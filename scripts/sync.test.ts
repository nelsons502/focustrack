import { expect, it } from 'vitest';
import type { Session } from '../lib/contract.ts';
import { isMissingPipeline, parseSyncOptions, selectSyncWork } from './sync.ts';

it('parses sync options and rejects unknown flags', () => {
  expect(parseSyncOptions([])).toEqual({ dryRun: false, summaryLimit: 100, detailBudget: 120 });
  expect(parseSyncOptions(['--dry-run', '--summary-limit=5', '--detail-budget=0'])).toEqual({ dryRun: true, summaryLimit: 5, detailBudget: 0 });
  expect(() => parseSyncOptions(['--delete'])).toThrow(/Unknown/);
});

it('processes new session details in bounded batches so later runs can continue', () => {
  const listed = Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1) }) as Session);
  const stored = new Map<string, Record<string, unknown>>();
  const first = selectSyncWork(listed, stored, 2, 0);

  expect(first.listedNow.map(session => session.id)).toEqual(['1', '2']);
  expect([...first.detailIds]).toEqual(['1', '2']);

  for (const id of first.detailIds) stored.set(id, { description: 'Details fetched.', speakers: [] });
  const next = selectSyncWork(listed, stored, 2, 0);

  expect(next.listedNow.map(session => session.id)).toEqual(['1', '2', '3', '4']);
  expect(next.detailIds.has('3')).toBe(true);
  expect(next.detailIds.has('4')).toBe(true);
  expect(next.listedNow.some(session => session.id === '5')).toBe(false);
});

it('recognizes a missing summary pipeline so sync can skip summaries instead of failing', () => {
  expect(isMissingPipeline(new Error('illegal_argument_exception: pipeline with id [focustrack-auto-summary] does not exist'))).toBe(true);
  expect(isMissingPipeline(new Error('version_conflict_engine_exception'))).toBe(false);
});
