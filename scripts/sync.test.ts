import { expect, it } from 'vitest';
import { isMissingPipeline, parseSyncOptions } from './sync.ts';

it('parses sync options and rejects unknown flags', () => {
  expect(parseSyncOptions([])).toEqual({ dryRun: false, summaryLimit: 600, detailBudget: 120 });
  expect(parseSyncOptions(['--dry-run', '--summary-limit=5', '--detail-budget=0'])).toEqual({ dryRun: true, summaryLimit: 5, detailBudget: 0 });
  expect(() => parseSyncOptions(['--delete'])).toThrow(/Unknown/);
});

it('recognizes a missing summary pipeline so sync can skip summaries instead of failing', () => {
  expect(isMissingPipeline(new Error('illegal_argument_exception: pipeline with id [focustrack-auto-summary] does not exist'))).toBe(true);
  expect(isMissingPipeline(new Error('version_conflict_engine_exception'))).toBe(false);
});
