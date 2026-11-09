import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createElasticClient, indexSessions } from '../lib/elastic.ts';
import { parseSessionize } from '../lib/parse-sessionize.ts';
import { loadSummaries, mergeSummaries } from '../lib/summaries.ts';

const source = 'https://sessionize.com/api/v2/uo948i5p/view/markdown';

function markdownError(markdown: string, relativeFile: string, url: string): string | undefined {
  const normalized = markdown.replace(/\r/g, '');
  if (!normalized.startsWith('# ') || /[\u0000\ufffd]/.test(normalized)) return `Sessionize returned invalid Markdown for ${relativeFile}`;
  const requestedId = /\/session\/(\d+)\/?$/.exec(new URL(url).pathname)?.[1];
  if (requestedId && /^- \*\*Session ID:\*\* (\d+)$/m.exec(normalized)?.[1] !== requestedId) {
    return `Sessionize Session ID must match ${requestedId} for ${relativeFile}`;
  }
  if (relativeFile === 'schedule.md') {
    const advertised = /^- \*\*Sessions:\*\* (\d+)$/m.exec(normalized)?.[1];
    if (!advertised || +advertised === 0) return 'Sessionize schedule is missing a positive Sessions count';
    const ids = [...normalized.matchAll(/^- \[.*\]\(https:\/\/sessionize\.com\/api\/v2\/[^/]+\/view\/markdown\/session\/(\d+)\)$/gm)].map(match => match[1]);
    if (ids.length !== +advertised || new Set(ids).size !== +advertised) {
      return `Sessionize schedule expected ${advertised} sessions; found ${ids.length} entries (${new Set(ids).size} unique)`;
    }
    try { parseSessionize(normalized); }
    catch (error) { return error instanceof Error ? error.message : 'Invalid schedule metadata'; }
  }
}

export function parseOptions(args: string[]): {day?: string; recreate: boolean} {
  const options: {day?: string; recreate: boolean} = {recreate:false};
  for (const arg of args) {
    if (arg === '--recreate') options.recreate = true;
    else if (arg.startsWith('--day=')) {
      const day = arg.slice(6);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) throw new Error('Invalid --day; use YYYY-MM-DD');
      options.day = day;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export function createMarkdownFetcher(cacheDirectory = '.cache') {
  let lastRequestAt = 0;
  return async (relativeFile: string, url: string): Promise<string> => {
    const file = join(cacheDirectory, relativeFile);
    let cached: string | undefined;
    try { cached = await readFile(file, 'utf8'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    if (cached !== undefined && !markdownError(cached, relativeFile, url)) return cached;
    await sleep(Math.max(0, 1000 - (Date.now() - lastRequestAt)));
    lastRequestAt = Date.now();
    const response = await fetch(url, {signal:AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`Sessionize fetch failed for ${relativeFile}: HTTP ${response.status}`);
    const markdown = await response.text();
    const error = markdownError(markdown, relativeFile, url);
    if (error) throw new Error(error);
    await mkdir(dirname(file), {recursive:true});
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, markdown, {flag:'wx'});
      await rename(temporary, file);
    } finally { await rm(temporary, {force:true}); }
    return markdown;
  };
}

export async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const client = createElasticClient();
  const started = performance.now();
  try {
    const fetchMarkdown = createMarkdownFetcher();
    const list = await fetchMarkdown('schedule.md', source);
    const selected = parseSessionize(list).filter(session => !options.day || session.day === options.day);
    if (!selected.length) throw new Error('No sessions selected; index was not changed');
    console.log(`Selected ${selected.length} sessions${options.day ? ` for ${options.day}` : ' across all days'}; fetching details at no more than 1 request/sec (cache hits are immediate).`);
    const details: Record<string,string> = {};
    for (const [i, session] of selected.entries()) {
      details[session.id] = await fetchMarkdown(`sessions/${session.id}.md`, `${source}/session/${session.id}`);
      if ((i+1) % 25 === 0 || i+1 === selected.length) console.log(`Details ${i+1}/${selected.length}`);
    }
    const parsed = parseSessionize(list, details).filter(session => !options.day || session.day === options.day);
    const { sessions, unmatched } = mergeSummaries(parsed, await loadSummaries());
    console.log(`Merged ${sessions.filter(session => session.plainSummary).length} reviewed plain-language summaries${unmatched.length ? `; ${unmatched.length} summary IDs not in this selection: ${unmatched.join(', ')}` : ''}.`);
    await indexSessions(client, sessions, options.recreate);
    console.log(`Total ingest elapsed ${((performance.now()-started)/1000).toFixed(2)}s.`);
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    let message = error instanceof Error ? error.message : 'Unknown error';
    for (const value of [process.env.ES_URL, process.env.ES_API_KEY]) if (value) message = message.split(value).join('[redacted]');
    console.error(`Ingest failed: ${message}`);
    process.exitCode = 1;
  });
}
