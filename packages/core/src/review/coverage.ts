import type { ReviewManifest } from '../types.js';
import type { CoverageStatus, CoverageTotals, FileCoverage, ReviewCoverage } from './types.js';

export const COVERAGE_STATUSES: readonly CoverageStatus[] = [
  'pending',
  'deep-reviewed',
  'light-reviewed',
  'manifest-only',
  'skipped',
  'deferred',
  'failed',
];

/** Counts file coverage by status without mutating the ledger. */
export function summarizeCoverage(files: readonly FileCoverage[]): CoverageTotals {
  const byStatus: Record<CoverageStatus, number> = {
    pending: 0,
    'deep-reviewed': 0,
    'light-reviewed': 0,
    'manifest-only': 0,
    skipped: 0,
    deferred: 0,
    failed: 0,
  };
  for (const file of files) byStatus[file.status] += 1;
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
