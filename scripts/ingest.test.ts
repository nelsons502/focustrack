import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMarkdownFetcher, parseOptions } from './ingest.ts';
it('accepts an event-local day and explicit recreation', () => {
  expect(parseOptions(['--day=2026-11-10','--recreate'])).toEqual({day:'2026-11-10',recreate:true});
  expect(parseOptions([])).toEqual({recreate:false});
});
it('rejects typos and invalid days before any destructive work', () => {
  expect(() => parseOptions(['--day=2026-02-30'])).toThrow(/day/);
  expect(() => parseOptions(['--day=tomorrow'])).toThrow(/day/);
  expect(() => parseOptions(['--all'])).toThrow(/Unknown/);
});

const temporaryDirectories: string[] = [];
afterEach(async () => {
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
  const fetchMock = vi.fn().mockResolvedValue(new Response('# Cached session\n'));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchMarkdown('sessions/1.md','https://example.com/session/1')).toBe('# Cached session\n');
  expect(await fetchMarkdown('sessions/1.md','https://example.com/session/1')).toBe('# Cached session\n');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('spaces uncached request starts by at least one second', async () => {
  const fetchMarkdown = await temporaryCache();
  const starts: number[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
    starts.push(Date.now());
    return new Response('# Session\n');
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
