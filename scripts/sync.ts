import { pathToFileURL } from 'node:url';
import type { Client } from '@elastic/elasticsearch';
import { INDEX_NAME, type Session } from '../lib/contract.ts';
import { createElasticClient } from '../lib/elastic.ts';
import { parseSessionize } from '../lib/parse-sessionize.ts';
import { checkSummary } from '../lib/summary-guardrail.ts';
import {
  AUTO_SUMMARY_PIPELINE, type StoredVersion, descriptionHash, needsAutoSummary, selectDetailIds, sessionChanged, syncOperations, withStoredDetails,
} from '../lib/auto-summary.ts';
import { createMarkdownFetcher, source } from './ingest.ts';

export type SyncOptions = { dryRun: boolean; summaryLimit: number; detailBudget: number };

export function parseSyncOptions(args: string[]): SyncOptions {
  const options: SyncOptions = { dryRun: false, summaryLimit: 600, detailBudget: 120 };
  for (const arg of args) {
    const numeric = /^--(summary-limit|detail-budget)=(\d+)$/.exec(arg);
    if (arg === '--dry-run') options.dryRun = true;
    else if (numeric?.[1] === 'summary-limit') options.summaryLimit = +numeric[2];
    else if (numeric?.[1] === 'detail-budget') options.detailBudget = +numeric[2];
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

type Stored = { sources: Map<string, Record<string, unknown>>; versions: Map<string, StoredVersion> };

export function selectSyncWork(
  listed: Session[], stored: Map<string, Record<string, unknown>>, detailBudget: number, slot: number,
): { listedNow: Session[]; detailIds: Set<string> } {
  const unseen = listed.filter(session => !stored.has(session.id)).slice(0, detailBudget);
  const listedNow = listed.filter(session => stored.has(session.id) || unseen.includes(session));
  const detailIds = selectDetailIds(listedNow, stored, detailBudget, slot);
  return { listedNow, detailIds };
}

async function storedSessions(client: Client): Promise<Stored> {
  const result = await client.search<Record<string, unknown>>({
    index: INDEX_NAME, size: 5000, track_total_hits: true, seq_no_primary_term: true, query: { match_all: {} },
  });
  const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
  if (total > result.hits.hits.length) throw new Error(`Index has ${total} documents; sync reads at most ${result.hits.hits.length}`);
  const sources = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, StoredVersion>();
  for (const hit of result.hits.hits) {
    if (!hit._id || !hit._source) continue;
    sources.set(hit._id, hit._source);
    if (typeof hit._seq_no === 'number' && typeof hit._primary_term === 'number') {
      versions.set(hit._id, { if_seq_no: hit._seq_no, if_primary_term: hit._primary_term });
    }
  }
  return { sources, versions };
}

async function upsert(client: Client, sessions: Session[], versions: Map<string, StoredVersion>): Promise<{ written: number; conflicts: string[] }> {
  let written = 0;
  const conflicts: string[] = [];
  for (let offset = 0; offset < sessions.length; offset += 40) {
    const result = await client.bulk({ operations: syncOperations(sessions.slice(offset, offset + 40), versions), refresh: 'wait_for' });
    const items = result.items.flatMap(item => Object.values(item));
    for (const item of items) if (item.status === 409) conflicts.push(String(item._id));
    const failures = items.filter(item => item.status !== 409 && (item.status >= 300 || item.error));
    if (failures.length) throw new Error(`Upsert failed: ${failures.map(item => `${item._id} status ${item.status}`).join('; ')}`);
    written += items.filter(item => item.status < 300).length;
  }
  return { written, conflicts };
}

export function isMissingPipeline(error: unknown): boolean {
  return error instanceof Error && /pipeline with id \[[^\]]+\] does not exist/i.test(error.message);
}

async function summarize(client: Client, ids: string[]): Promise<number | 'skipped'> {
  let failures = 0;
  for (let offset = 0; offset < ids.length; offset += 10) {
    let result;
    try {
      result = await client.updateByQuery({
        index: INDEX_NAME, pipeline: AUTO_SUMMARY_PIPELINE, refresh: true, conflicts: 'proceed',
        query: { ids: { values: ids.slice(offset, offset + 10) } },
      });
    } catch (error) {
      if (offset === 0 && isMissingPipeline(error)) return 'skipped';
      throw error;
    }
    failures += result.failures?.length ?? 0;
    console.log(`Summarize pass ${Math.min(offset + 10, ids.length)}/${ids.length}`);
  }
  return failures;
}

export async function main(): Promise<void> {
  const options = parseSyncOptions(process.argv.slice(2));
  const client = createElasticClient();
  try {
    const fetchMarkdown = createMarkdownFetcher(process.env.SYNC_CACHE_DIR || '.cache', new Set(['schedule.md']));
    const list = await fetchMarkdown('schedule.md', source);
    const listed = parseSessionize(list);
    const { sources: stored, versions } = await storedSessions(client);
    const { listedNow, detailIds } = selectSyncWork(listed, stored, options.detailBudget, Math.floor(Date.now() / 1_800_000));
    const details: Record<string, string> = {};
    for (const id of detailIds) details[id] = await fetchMarkdown(`sessions/${id}.md`, `${source}/session/${id}`);
    const listedNowIds = new Set(listedNow.map(session => session.id));
    const sessions = parseSessionize(list, details).filter(session => listedNowIds.has(session.id))
      .map(session => detailIds.has(session.id) ? session : withStoredDetails(session, stored.get(session.id)));
    const changed = sessions.filter(session => sessionChanged(stored.get(session.id), session));
    const candidates = sessions.filter(session => needsAutoSummary(stored.get(session.id), session.description)).slice(0, options.summaryLimit);
    console.log(`Fetched ${sessions.length} sessions (${detailIds.size} detail pages checked); ${changed.length} new or changed; ${candidates.length} need an automatic summary.`);
    if (options.dryRun) { console.log('Dry run: nothing was written.'); return; }
    const { written, conflicts } = changed.length ? await upsert(client, changed, versions) : { written: 0, conflicts: [] };
    if (conflicts.length) console.log(`Skipped ${conflicts.length} sessions changed by another writer during sync; the next run retries them: ${conflicts.join(', ')}`);
    const conflicted = new Set(conflicts);
    const summarizeIds = candidates.filter(session => !conflicted.has(session.id));
    const failures = summarizeIds.length ? await summarize(client, summarizeIds.map(session => session.id)) : 0;
    if (failures === 'skipped') {
      console.log(`Sync done: fetched ${sessions.length}, changed ${written}/${changed.length}; summaries skipped because pipeline ${AUTO_SUMMARY_PIPELINE} is not set up (run npm run setup-auto-summary). Nothing was deleted.`);
      return;
    }
    let summarized = 0;
    let rejected = 0;
    if (candidates.length) {
      const read = await client.mget<Record<string, unknown>>({ index: INDEX_NAME, ids: candidates.map(session => session.id) });
      for (const doc of read.docs) {
        const fields = 'found' in doc && doc.found ? doc._source : undefined;
        const session = candidates.find(item => item.id === doc._id);
        if (!fields || !session || typeof fields.autoSummary !== 'string' || fields.descriptionHash !== descriptionHash(session.description)) continue;
        summarized++;
        const verdict = checkSummary(fields.autoSummary, session);
        if (!verdict.ok) { rejected++; console.log(`Guardrail rejected ${session.id}: ${verdict.reason}`); }
      }
    }
    console.log(`Sync done: fetched ${sessions.length}, changed ${written}/${changed.length}, summarized ${summarized}/${candidates.length}, rejected by guardrail ${rejected}, request failures ${failures}. Nothing was deleted.`);
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    let message = error instanceof Error ? error.message : 'Unknown error';
    for (const value of [process.env.ES_URL, process.env.ES_API_KEY]) if (value) message = message.split(value).join('[redacted]');
    console.error(`Sync failed: ${message}`);
    process.exitCode = 1;
  });
}
