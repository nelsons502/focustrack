import { createHash } from 'node:crypto';
import { INDEX_NAME, type Session } from './contract.ts';

export const AUTO_SUMMARY_INFERENCE_ID = 'focustrack-openai-summary';
export const AUTO_SUMMARY_PIPELINE = 'focustrack-auto-summary';
export const DEFAULT_SUMMARY_MODEL = 'gpt-4.1-mini';

export const SUMMARY_INSTRUCTIONS = [
  'Summarize this conference session for a busy attendee in plain, calm language.',
  'Write one or two short sentences, under 260 characters in total. Start with "This talk" or "This session".',
  'Only use names, products, acronyms and numbers that appear in the title or description. Never add any others.',
  'No URLs, no hype, no markdown, no quotation marks. Reply with the summary only.',
].join(' ');

export type SummaryState = {
  plainSummary?: unknown;
  autoSummary?: unknown;
  descriptionHash?: unknown;
};

export function descriptionHash(description: string): string {
  return createHash('sha256').update(description, 'utf8').digest('hex');
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function needsAutoSummary(stored: SummaryState | undefined, description: string): boolean {
  if (!description.trim()) return false;
  if (nonEmpty(stored?.plainSummary)) return false;
  if (!nonEmpty(stored?.autoSummary)) return true;
  return stored?.descriptionHash !== descriptionHash(description);
}

export const SYNC_FIELDS = [
  'id', 'eventId', 'title', 'description', 'speakers', 'startsAt', 'endsAt', 'day', 'room', 'venue', 'level',
  'roomType', 'kind', 'restrictions', 'crowdEstimate', 'crowdBasis', 'noiseEstimate', 'noiseBasis', 'captions', 'sourceUrl',
] as const satisfies readonly (keyof Session)[];

export type SyncFields = Pick<Session, typeof SYNC_FIELDS[number]>;

export function syncDoc(session: Session): SyncFields {
  const doc: Partial<Record<keyof SyncFields, unknown>> = {};
  for (const field of SYNC_FIELDS) doc[field] = session[field];
  return doc as SyncFields;
}

export function sessionChanged(stored: Record<string, unknown> | undefined, next: Session): boolean {
  if (!stored) return true;
  return SYNC_FIELDS.some(field => JSON.stringify(stored[field] ?? null) !== JSON.stringify(next[field] ?? null));
}

export type SyncBulkOperation =
  | { update: { _index: typeof INDEX_NAME; _id: string; retry_on_conflict: number } }
  | { doc: SyncFields; doc_as_upsert: true };

export function syncOperations(sessions: Session[]): SyncBulkOperation[] {
  return sessions.flatMap((session): SyncBulkOperation[] => [
    { update: { _index: INDEX_NAME, _id: session.id, retry_on_conflict: 3 } },
    { doc: syncDoc(session), doc_as_upsert: true },
  ]);
}

export function selectDetailIds(listed: Session[], stored: Map<string, Record<string, unknown>>, budget: number, slot: number): Set<string> {
  const ids = new Set<string>();
  for (const session of listed) {
    const previous = stored.get(session.id);
    if (!previous || typeof previous.description !== 'string' || !Array.isArray(previous.speakers)
      || (['title', 'startsAt', 'endsAt', 'room'] as const).some(field => previous[field] !== session[field])) ids.add(session.id);
  }
  const ordered = listed.map(session => session.id).sort();
  if (ordered.length && budget > 0) {
    const start = (slot * budget) % ordered.length;
    for (let i = 0; i < Math.min(budget, ordered.length); i++) ids.add(ordered[(start + i) % ordered.length]);
  }
  return ids;
}

function storedSpeakers(value: unknown): Session['speakers'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const speakers: Session['speakers'] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return undefined;
    const { name, company } = item as Record<string, unknown>;
    if (typeof name !== 'string' || typeof company !== 'string') return undefined;
    speakers.push({ name, company });
  }
  return speakers;
}

export function withStoredDetails(session: Session, stored: Record<string, unknown> | undefined): Session {
  const speakers = storedSpeakers(stored?.speakers);
  if (typeof stored?.description !== 'string' || !speakers) return session;
  return { ...session, description: stored.description, speakers };
}

export function autoSummaryPipeline(model: string, inferenceId: string = AUTO_SUMMARY_INFERENCE_ID) {
  return {
    description: 'FocusTrack: write an automatic plain-language summary with OpenAI when a session has no reviewed summary and its description changed.',
    processors: [
      { script: { lang: 'painless', params: { instructions: SUMMARY_INSTRUCTIONS, titleLabel: '\n\nTitle: ', descriptionLabel: '\nDescription: ' }, source: [
        "String d = ctx.description instanceof String ? ctx.description : '';",
        'String h = d.sha256();',
        "boolean reviewed = ctx.plainSummary instanceof String && !ctx.plainSummary.trim().isEmpty();",
        "boolean fresh = ctx.autoSummary instanceof String && !ctx.autoSummary.trim().isEmpty() && ctx.descriptionHash == h;",
        'if (reviewed || fresh || d.trim().isEmpty()) { ctx._autoSummarySkip = true; }',
        'else { ctx._autoSummaryPrompt = params.instructions + params.titleLabel + ctx.title + params.descriptionLabel + d; ctx._autoSummaryHash = h; }',
      ].join('\n') } },
      { drop: { if: 'ctx._autoSummarySkip == true' } },
      { inference: {
        model_id: inferenceId,
        input_output: [{ input_field: '_autoSummaryPrompt', output_field: '_autoSummaryResult' }],
        on_failure: [{ drop: {} }],
      } },
      { script: { lang: 'painless', params: { model }, source: [
        'def r = ctx._autoSummaryResult;',
        "if (r instanceof List && !r.isEmpty()) { r = r.get(0); }",
        "if (r instanceof Map) { r = r.containsKey('result') ? r.result : r.completion; }",
        "if (!(r instanceof String) || r.trim().isEmpty()) { ctx._autoSummaryEmpty = true; }",
        'else { ctx.autoSummary = r.trim(); ctx.descriptionHash = ctx._autoSummaryHash; ctx.autoSummaryModel = params.model; }',
      ].join('\n') } },
      { drop: { if: 'ctx._autoSummaryEmpty == true' } },
      { set: { field: 'autoSummaryAt', value: '{{{_ingest.timestamp}}}' } },
      { remove: { field: ['_autoSummaryPrompt', '_autoSummaryResult', '_autoSummaryHash'], ignore_missing: true } },
    ],
  };
}

export const autoSummaryMappings = {
  autoSummary: { type: 'text' },
  autoSummaryAt: { type: 'date' },
  autoSummaryModel: { type: 'keyword' },
  descriptionHash: { type: 'keyword' },
} as const;
