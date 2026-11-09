import { describe, expect, it, vi } from 'vitest';
import type { Session } from './contract.ts';
import { applySummaryUpdates, loadSummaries, mergeSummaries, parseSummaries, type SummaryUpdate } from './summaries.ts';

function session(id: string, extra: Partial<Session> = {}): Session {
  return {
    id, eventId: 'kccncna2026', title: `Talk ${id}`, description: 'Original description.', speakers: [],
    startsAt: '2026-11-10T11:30:00-07:00', endsAt: '2026-11-10T12:00:00-07:00', day: '2026-11-10',
    room: 'Salt Palace | Level 2 | 255 BC', venue: 'Salt Palace', level: 'Level 2', roomType: 'breakout', kind: 'talk',
    restrictions: [], crowdEstimate: 'unknown', crowdBasis: 'unknown', noiseEstimate: 'unknown', noiseBasis: 'unknown',
    captions: 'wordly-breakout', sourceUrl: `https://sessionize.com/session/${id}`, ...extra,
  };
}

const reviewed = { plainSummary: 'A plain summary. A second sentence.', summarySource: 'ai-reviewed' as const };

describe('mergeSummaries', () => {
  it('adds the summary and source only to matching sessions, leaving every other field intact', () => {
    const original = [session('1'), session('2')];
    const { sessions, unmatched } = mergeSummaries(original, { '1': reviewed });
    expect(sessions[0]).toEqual({ ...original[0], ...reviewed });
    expect(sessions[1]).toBe(original[1]);
    expect(sessions[1]).not.toHaveProperty('plainSummary');
    expect(unmatched).toEqual([]);
    expect(original[0]).not.toHaveProperty('plainSummary');
  });

  it('reports summary IDs missing from the selected sessions instead of inventing documents', () => {
    const { sessions, unmatched } = mergeSummaries([session('1')], { '1': reviewed, '9': reviewed });
    expect(sessions.map(item => item.id)).toEqual(['1']);
    expect(unmatched).toEqual(['9']);
  });

  it('ignores inherited object keys such as constructor', () => {
    const { sessions } = mergeSummaries([session('constructor')], {});
    expect(sessions[0]).not.toHaveProperty('plainSummary');
  });
});

describe('parseSummaries', () => {
  it('accepts reviewed entries and trims whitespace', () => {
    expect(parseSummaries({ '12': { plainSummary: '  Text.  ', summarySource: 'ai-reviewed' } }))
      .toEqual({ '12': { plainSummary: 'Text.', summarySource: 'ai-reviewed' } });
  });

  it.each([
    ['a non-object file', []],
    ['a non-numeric key', { abc: reviewed }],
    ['an empty summary', { '1': { plainSummary: ' ', summarySource: 'ai-reviewed' } }],
    ['an unreviewed source', { '1': { plainSummary: 'Text.', summarySource: 'ai' } }],
    ['extra fields that could overwrite schedule data', { '1': { ...reviewed, title: 'Changed' } }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseSummaries(value)).toThrow();
  });

  it('loads the committed summaries file, with two sentences per summary', async () => {
    const summaries = await loadSummaries();
    expect(Object.keys(summaries).length).toBeGreaterThanOrEqual(10);
    for (const { plainSummary } of Object.values(summaries)) {
      expect(plainSummary.match(/[.!?](?=\s|$)/g)).toHaveLength(2);
    }
  });
});

describe('applySummaryUpdates', () => {
  it('sends one partial update per summary that never upserts', async () => {
    const update = vi.fn<(request: SummaryUpdate) => Promise<unknown>>().mockResolvedValue({});
    const result = await applySummaryUpdates(update, { '1': reviewed, '2': reviewed });
    expect(update.mock.calls.map(([request]) => request)).toEqual([
      { index: 'sessions', id: '1', doc: reviewed, doc_as_upsert: false, retry_on_conflict: 3 },
      { index: 'sessions', id: '2', doc: reviewed, doc_as_upsert: false, retry_on_conflict: 3 },
    ]);
    expect(result).toEqual({ updated: ['1', '2'], failed: [] });
  });

  it('keeps going after a missing document and reports the failure', async () => {
    const update = vi.fn<(request: SummaryUpdate) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('document_missing_exception'))
      .mockResolvedValue({});
    const result = await applySummaryUpdates(update, { '1': reviewed, '2': reviewed });
    expect(result).toEqual({ updated: ['2'], failed: [{ id: '1', reason: 'document_missing_exception' }] });
  });
});
