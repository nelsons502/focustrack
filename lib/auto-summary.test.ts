import { describe, expect, it } from 'vitest';
import type { Session } from './contract.ts';
import {
  capWork, descriptionHash, needsAutoSummary, runLimitsFromEnv, selectDetailIds, sessionChanged, syncOperations, withStoredDetails,
} from './auto-summary.ts';

function session(id: string, extra: Partial<Session> = {}): Session {
  return {
    id, eventId: 'kccncna2026', title: `Talk ${id}`, description: 'Original description.', speakers: [],
    startsAt: '2026-11-10T11:30:00-07:00', endsAt: '2026-11-10T12:00:00-07:00', day: '2026-11-10',
    room: 'Salt Palace | Level 2 | 255 BC', venue: 'Salt Palace', level: 'Level 2', roomType: 'breakout', kind: 'talk',
    restrictions: [], crowdEstimate: 'unknown', crowdBasis: 'unknown', noiseEstimate: 'unknown', noiseBasis: 'unknown',
    captions: 'wordly-breakout', sourceUrl: `https://sessionize.com/session/${id}`, ...extra,
  };
}

describe('needsAutoSummary', () => {
  const description = 'A talk about clusters.';

  it('never summarizes a session that has a human-reviewed summary', () => {
    expect(needsAutoSummary({ plainSummary: 'Reviewed.' }, description)).toBe(false);
    expect(needsAutoSummary({ plainSummary: 'Reviewed.', autoSummary: 'Old.', descriptionHash: 'stale' }, description)).toBe(false);
  });

  it('summarizes when no automatic summary exists yet', () => {
    expect(needsAutoSummary(undefined, description)).toBe(true);
    expect(needsAutoSummary({ autoSummary: '  ' }, description)).toBe(true);
  });

  it('summarizes again only when the description hash changes', () => {
    expect(needsAutoSummary({ autoSummary: 'Old.', descriptionHash: descriptionHash(description) }, description)).toBe(false);
    expect(needsAutoSummary({ autoSummary: 'Old.', descriptionHash: descriptionHash('Previous text.') }, description)).toBe(true);
  });

  it('skips sessions with no description to summarize', () => {
    expect(needsAutoSummary(undefined, '   ')).toBe(false);
  });
});

describe('syncOperations', () => {
  it('sends only schedule fields, conditional on the version sync read, so summaries are never overwritten', () => {
    const operations = syncOperations([session('7', { plainSummary: 'Reviewed.', summarySource: 'ai-reviewed', autoSummary: 'Auto.' })],
      new Map([['7', { if_seq_no: 12, if_primary_term: 1 }]]));
    expect(operations).toHaveLength(2);
    expect(operations[0]).toEqual({ update: { _index: 'sessions', _id: '7', if_seq_no: 12, if_primary_term: 1 } });
    const body = operations[1];
    if (!('doc' in body)) throw new Error('expected a partial update body');
    expect(body).not.toHaveProperty('doc_as_upsert');
    expect(body.doc.title).toBe('Talk 7');
    for (const field of ['plainSummary', 'summarySource', 'autoSummary', 'autoSummaryAt', 'autoSummaryModel', 'descriptionHash']) {
      expect(body.doc).not.toHaveProperty(field);
    }
  });

  it('creates unseen IDs with a create-only operation that cannot overwrite', () => {
    const operations = syncOperations([session('8')]);
    expect(operations[0]).toEqual({ create: { _index: 'sessions', _id: '8' } });
    expect(operations[1]).toMatchObject({ id: '8', title: 'Talk 8' });
    expect(operations[1]).not.toHaveProperty('plainSummary');
  });
});

describe('sessionChanged', () => {
  it('ignores summary fields and detects schedule changes', () => {
    const current = session('1');
    expect(sessionChanged({ ...current, plainSummary: 'Reviewed.', autoSummary: 'Auto.' }, current)).toBe(false);
    expect(sessionChanged({ ...current, room: 'Other room' }, current)).toBe(true);
    expect(sessionChanged(undefined, current)).toBe(true);
  });
});

describe('detail refresh selection', () => {
  it('refreshes new and moved sessions plus a rotating slice of the rest', () => {
    const listed = ['1', '2', '3', '4'].map(id => session(id));
    const stored = new Map<string, Record<string, unknown>>([
      ['1', { ...session('1') }], ['2', { ...session('2', { room: 'Moved' }) }], ['3', { ...session('3') }],
    ]);
    expect([...selectDetailIds(listed, stored, 0, 0)].sort()).toEqual(['2', '4']);
    expect([...selectDetailIds(listed, stored, 1, 0)].sort()).toEqual(['1', '2', '4']);
    expect([...selectDetailIds(listed, stored, 1, 2)].sort()).toEqual(['2', '3', '4']);
  });

  it('keeps the stored description and speakers when details were not refetched', () => {
    const listed = session('1', { description: '', speakers: [{ name: 'Ana', company: '' }] });
    const merged = withStoredDetails(listed, { description: 'Stored.', speakers: [{ name: 'Ana', company: 'Acme' }] });
    expect(merged.description).toBe('Stored.');
    expect(merged.speakers).toEqual([{ name: 'Ana', company: 'Acme' }]);
    expect(withStoredDetails(listed, { description: 'Stored.', speakers: 'bad' })).toBe(listed);
  });
});

describe('per-run caps', () => {
  it('defaults to 120 detail fetches, 100 summaries and a 480 second deadline, overridable by env', () => {
    expect(runLimitsFromEnv({})).toEqual({ maxDetailFetches: 120, maxSummaries: 100, deadlineSeconds: 480 });
    expect(runLimitsFromEnv({ SYNC_MAX_DETAIL_FETCHES: '5', SYNC_MAX_SUMMARIES: '7', SYNC_DEADLINE_SECONDS: 'x' }))
      .toEqual({ maxDetailFetches: 5, maxSummaries: 7, deadlineSeconds: 480 });
  });

  it('splits work into what runs now and what is deferred', () => {
    const ids = Array.from({ length: 130 }, (_, i) => String(i));
    const { run, deferred } = capWork(ids, 120);
    expect(run).toHaveLength(120);
    expect(deferred).toEqual(ids.slice(120));
  });
});
