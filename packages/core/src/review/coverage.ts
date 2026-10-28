import type { ReviewManifest } from '../types.js';
import type { CoverageStatus, CoverageTotals, FileCoverage, ReviewCoverage } from './types.js';

export const COVERAGE_STATUSES: readonly CoverageStatus[] = Object.freeze([
  'pending',
  'deep-reviewed',
  'light-reviewed',
  'manifest-only',
  'skipped',
  'deferred',
  'failed',
]);

/**
 * Counts file coverage by status without mutating the ledger. `files` counts
 * every ledger entry; unknown persisted statuses are excluded from `byStatus`
 * rather than creating a NaN bucket.
 */
export function summarizeCoverage(files: readonly FileCoverage[]): CoverageTotals {
  const byStatus = Object.fromEntries(COVERAGE_STATUSES.map((status) => [status, 0])) as Record<
    CoverageStatus,
    number
  >;
  const known = new Set<string>(COVERAGE_STATUSES);
  for (const file of files) {
    if (!known.has(file.status)) continue;
    byStatus[file.status] += 1;
  }
  return { files: files.length, byStatus };
}

/**
 * Seeds a coverage ledger from the manifest: every changed file starts as
 * pending so no manifest path can be silently absent from coverage.
 */
export function initialCoverage(manifest: ReviewManifest): ReviewCoverage {
  const files: FileCoverage[] = manifest.files.map((file) => ({
    path: file.path,
    status: 'pending',
  }));
  return { files, totals: summarizeCoverage(files) };
}
