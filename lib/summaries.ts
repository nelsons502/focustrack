import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INDEX_NAME, type Session } from './contract.ts';

export type SummaryEntry = {
  plainSummary: string;
  summarySource: 'ai-reviewed';
};

export type Summaries = Record<string, SummaryEntry>;

export const SUMMARIES_FILE = join('data', 'summaries.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSummaries(value: unknown): Summaries {
  if (!isRecord(value)) throw new Error('Summaries file must be a JSON object keyed by session ID');
  const summaries: Summaries = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!/^\d+$/.test(id)) throw new Error(`Summary key ${id} is not a Sessionize session ID`);
    if (!isRecord(entry)) throw new Error(`Summary ${id} must be an object`);
    const { plainSummary, summarySource } = entry;
    if (typeof plainSummary !== 'string' || !plainSummary.trim()) throw new Error(`Summary ${id} needs a non-empty plainSummary`);
    if (summarySource !== 'ai-reviewed') throw new Error(`Summary ${id} must have summarySource "ai-reviewed"`);
    const extra = Object.keys(entry).filter(key => key !== 'plainSummary' && key !== 'summarySource');
    if (extra.length) throw new Error(`Summary ${id} has unexpected fields: ${extra.join(', ')}`);
    summaries[id] = { plainSummary: plainSummary.trim(), summarySource };
  }
  return summaries;
}

export async function loadSummaries(file: string = SUMMARIES_FILE): Promise<Summaries> {
  return parseSummaries(JSON.parse(await readFile(file, 'utf8')));
}

export function mergeSummaries(sessions: Session[], summaries: Summaries): { sessions: Session[]; unmatched: string[] } {
  const ids = new Set(sessions.map(session => session.id));
  return {
    sessions: sessions.map(session => {
      const summary = Object.hasOwn(summaries, session.id) ? summaries[session.id] : undefined;
      return summary ? { ...session, ...summary } : session;
    }),
    unmatched: Object.keys(summaries).filter(id => !ids.has(id)),
  };
}

export type SummaryUpdate = {
  index: typeof INDEX_NAME;
  id: string;
  doc: SummaryEntry;
  doc_as_upsert: false;
  retry_on_conflict: number;
};

export function summaryUpdates(summaries: Summaries): SummaryUpdate[] {
  return Object.entries(summaries).map(([id, doc]) => ({
    index: INDEX_NAME, id, doc: { plainSummary: doc.plainSummary, summarySource: doc.summarySource },
    doc_as_upsert: false, retry_on_conflict: 3,
  }));
}

export async function applySummaryUpdates(
  update: (request: SummaryUpdate) => Promise<unknown>,
  summaries: Summaries,
): Promise<{ updated: string[]; failed: { id: string; reason: string }[] }> {
  const updated: string[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const request of summaryUpdates(summaries)) {
    try {
      await update(request);
      updated.push(request.id);
    } catch (error) {
      failed.push({ id: request.id, reason: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  return { updated, failed };
}
