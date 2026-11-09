import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMarkdownFetcher, main, parseOptions } from './ingest.ts';

const cli = vi.hoisted(() => ({
  shutdown: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  createClient: vi.fn(),
}));
vi.mock('../lib/telemetry/node-cli.ts', () => ({ initNodeTelemetry: () => ({ shutdown: cli.shutdown }) }));
vi.mock('../lib/elastic.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/elastic.ts')>(),
  createElasticClient: cli.createClient,
}));
it('accepts an event-local day and explicit recreation', () => {
  expect(parseOptions(['--day=2026-11-10','--recreate'])).toEqual({day:'2026-11-10',recreate:true});
  expect(parseOptions([])).toEqual({recreate:false});
});
it('rejects typos and invalid days before any destructive work', () => {
  expect(() => parseOptions(['--day=2026-02-30'])).toThrow(/day/);
  expect(() => parseOptions(['--day=tomorrow'])).toThrow(/day/);
  expect(() => parseOptions(['--all'])).toThrow(/Unknown/);
});

vi.mock('node:fs/promises', async importOriginal => ({...await importOriginal<typeof import('node:fs/promises')>()}));

const temporaryDirectories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {recursive:true,force:true})));
});
async function temporaryCache() {
  const directory = await mkdtemp(join(tmpdir(), 'focustrack-ingest-test-'));
  temporaryDirectories.push(directory);
  return createMarkdownFetcher(directory);
}
it('reuses cached Markdown without another network request', async () => {
  const fetchMarkdown = await temporaryCache();
  const fetchMock = vi.fn().mockResolvedValue(new Response('# Cached session\n- **Session ID:** 1\n'));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchMarkdown('sessions/1.md','https://example.com/session/1')).toBe('# Cached session\n- **Session ID:** 1\n');
  expect(await fetchMarkdown('sessions/1.md','https://example.com/session/1')).toBe('# Cached session\n- **Session ID:** 1\n');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('spaces uncached request starts by at least one second', async () => {
  const fetchMarkdown = await temporaryCache();
  const starts: number[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
    starts.push(Date.now());
    return new Response(`# Session\n- **Session ID:** ${starts.length}\n`);
  }));
  await fetchMarkdown('sessions/1.md','https://example.com/session/1');
  await fetchMarkdown('sessions/2.md','https://example.com/session/2');
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
});
it('fails for HTTP errors and invalid Markdown', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable',{status:503})));
  await expect((await temporaryCache())('schedule.md','https://example.com')).rejects.toThrow('HTTP 503');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Error</html>')));
  await expect((await temporaryCache())('schedule.md','https://example.com')).rejects.toThrow('invalid Markdown');
});

const detailMarkdown = '# Session\n- **Session ID:** 1\n';
const sourceUrl = 'https://sessionize.com/api/v2/uo948i5p/view/markdown';
async function workspaceCache() {
  const root = join(process.cwd(), '.cache');
  await mkdir(root, {recursive:true});
  const directory = await mkdtemp(join(root, 'ingest-test-'));
  temporaryDirectories.push(directory);
  return {directory, fetchMarkdown:createMarkdownFetcher(directory)};
}

it.each(['<html>Error</html>', '# Session\n- **Session ID:** 2\n', '# Session\n', '# Session\n- **Session ID:** 1\n\ufffd'])(
  'refetches invalid cached details: %s', async cached => {
    const {directory, fetchMarkdown} = await workspaceCache();
    await writeFile(join(directory, '1.md'), cached);
    const fetchMock = vi.fn().mockResolvedValue(new Response(detailMarkdown));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchMarkdown('1.md', `${sourceUrl}/session/1`)).toBe(detailMarkdown);
    expect(await readFile(join(directory, '1.md'), 'utf8')).toBe(detailMarkdown);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
it.each(['# Session\n- **Session ID:** 2\n', '# Session\n'])(
  'rejects fresh details without the requested Session ID: %s', async markdown => {
    const {directory, fetchMarkdown} = await workspaceCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(markdown)));
    await expect(fetchMarkdown('1.md', `${sourceUrl}/session/1`)).rejects.toThrow(/Session ID/);
    expect(await readdir(directory)).toEqual([]);
  },
);

const listEntry = '- [Talk](https://sessionize.com/api/v2/uo948i5p/view/markdown/session/1)\n  7:00 pm - 12:00 am · Online\n';
const completeSchedule = `# Event\n- **Sessions:** 2\n### Wednesday, November 11, 2026\n${listEntry}- [Registration + Badge Pick-Up](https://sessionize.com/api/v2/uo948i5p/view/markdown/session/2)\n  8:00 am - 5:00 pm · Online\n`;
it.each([false, true])('rejects truncated schedules with valid headings (cached: %s)', async cached => {
  const {directory, fetchMarkdown} = await workspaceCache();
  const truncated = `# Event\n- **Sessions:** 600\n### Wednesday, November 11, 2026\n${listEntry}`;
  if (cached) await writeFile(join(directory, 'schedule.md'), truncated);
  const fetchMock = vi.fn().mockResolvedValue(new Response(truncated));
  vi.stubGlobal('fetch', fetchMock);
  await expect(fetchMarkdown('schedule.md', sourceUrl)).rejects.toThrow(/600.*1/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('refetches a truncated schedule and counts logistics before filtering', async () => {
  const {directory, fetchMarkdown} = await workspaceCache();
  await writeFile(join(directory, 'schedule.md'), '# Event\n- **Sessions:** 600\n');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(completeSchedule)));
  expect(await fetchMarkdown('schedule.md', sourceUrl)).toBe(completeSchedule);
  expect(await readFile(join(directory, 'schedule.md'), 'utf8')).toBe(completeSchedule);
});
it('rejects schedules without an advertised session count', async () => {
  const {fetchMarkdown} = await workspaceCache();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`# Event\n### Wednesday, November 11, 2026\n${listEntry}`)));
  await expect(fetchMarkdown('schedule.md', sourceUrl)).rejects.toThrow(/Sessions count/);
});
it('publishes validated cache contents with a sibling temporary file and rename', async () => {
  const {directory, fetchMarkdown} = await workspaceCache();
  const rename = vi.spyOn(fs, 'rename');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(detailMarkdown)));
  await fetchMarkdown('1.md', `${sourceUrl}/session/1`);
  expect(rename).toHaveBeenCalledTimes(1);
  const [temporary, destination] = rename.mock.calls[0];
  expect(destination).toBe(join(directory, '1.md'));
  expect(temporary).not.toBe(destination);
  expect(String(temporary)).toMatch(new RegExp(`^${directory}/`));
  expect(await readdir(directory)).toEqual(['1.md']);
  expect(await readFile(destination, 'utf8')).toBe(detailMarkdown);
});
it.each(['write', 'rename'])('cleans up after a failed %s and preserves previous cache bytes', async failure => {
  const {directory, fetchMarkdown} = await workspaceCache();
  const file = join(directory, '1.md');
  const previous = '# Interrupted download';
  await writeFile(file, previous);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(detailMarkdown)));
  if (failure === 'write') {
    vi.spyOn(fs, 'writeFile').mockImplementationOnce(async (path) => {
      await writeFile(path, '# Partial');
      throw new Error('disk failure');
    });
  } else vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk failure'));
  await expect(fetchMarkdown('1.md', `${sourceUrl}/session/1`)).rejects.toThrow('disk failure');
  expect(await readFile(file, 'utf8')).toBe(previous);
  expect(await readdir(directory)).toEqual(['1.md']);
});

it('shuts telemetry down when the Elastic client cannot be created', async () => {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'ingest.ts']);
  cli.createClient.mockImplementationOnce(() => { throw new Error('missing ES_URL'); });
  await expect(main()).rejects.toThrow('missing ES_URL');
  expect(cli.shutdown).toHaveBeenCalledTimes(1);
});

it('shuts telemetry down when option parsing or client closing throws', async () => {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'ingest.ts', '--bogus']);
  cli.createClient.mockReturnValueOnce({ close: cli.close });
  await expect(main()).rejects.toThrow('Unknown option');
  expect(cli.shutdown).toHaveBeenCalledTimes(1);
  cli.shutdown.mockClear();
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'ingest.ts', '--day=2099-01-01']);
  cli.createClient.mockReturnValueOnce({ close: async () => { throw new Error('close failed'); } });
  vi.spyOn(fs, 'readFile').mockResolvedValueOnce('# x');
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
  await expect(main()).rejects.toThrow();
  expect(cli.shutdown).toHaveBeenCalledTimes(1);
});
