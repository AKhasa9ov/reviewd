import type { ManifestFile, ManifestFileReason, ReviewManifest } from '../types.js';
import type { CoverageStatus, CoverageTotals, FileCoverage, ReviewCoverage } from './types.js';

export const COVERAGE_STATUSES: readonly CoverageStatus[] = Object.freeze([
  'pending',
  'deep-reviewed',
  'light-reviewed',
  'manifest-only',
  'skipped',
  'no-hunks',
  'deferred',
  'failed',
]);

/** Statuses that mean work is still owed before a round can be `done`. */
const UNRESOLVED_STATUSES = new Set<CoverageStatus>(['pending', 'skipped', 'deferred', 'failed']);

/** Manifest reasons where policy, not the render budget, excluded the content. */
const POLICY_REASONS = new Set<ManifestFileReason>(['binary', 'ignored', 'generated']);

/** Manifest reasons that explain why a non-policy file was not reviewed. */
const SKIP_REASONS = new Set<ManifestFileReason>([
  'render-budget',
  'per-file-cap',
  'diff-truncated',
  'unreadable',
  'legacy-truncated',
  'symlink',
]);

/** Warnings that prove the manifest's changed-path listing itself was cut. */
const INCOMPLETE_MANIFEST_WARNINGS = new Set([
  'manifest-listing-truncated',
  'untracked-list-truncated',
  'manifest-missing',
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

function policyReason(file: ManifestFile): ManifestFileReason | undefined {
  if (file.reason !== undefined && POLICY_REASONS.has(file.reason)) return file.reason;
  if (file.ignored) return 'ignored';
  if (file.binary) return 'binary';
  return undefined;
}

function skipReason(file: ManifestFile): ManifestFileReason {
  if (file.reason !== undefined && SKIP_REASONS.has(file.reason)) return file.reason;
  return 'render-budget';
}

/**
 * Builds the R1 coverage bridge from the complete manifest and the paths whose
 * file header made it into the prompt. Policy-excluded content is explicitly
 * `manifest-only`; an included file with a reviewable hunk is `pending` and may
 * at most become `light-reviewed` after the report. A file with no content
 * change (pure rename, mode-only, empty file, or an untracked symlink whose
 * target is deliberately not followed) is terminal `no-hunks`, because there
 * is nothing to inspect and it was not dropped by a budget. Everything else is
 * `skipped` with the manifest reason (or `render-budget` when the prompt
 * dropped it). This never mutates the manifest.
 */
export function coverageFromPrompt(
  manifest: ReviewManifest,
  includedPaths: readonly string[],
): ReviewCoverage {
  const included = new Set(includedPaths);
  const files = manifest.files.map((file): FileCoverage => {
    const policy = policyReason(file);
    if (policy !== undefined) {
      return { path: file.path, status: 'manifest-only', reason: policy };
    }
    if (
      file.reason === 'symlink' &&
      file.hunkCount === 0 &&
      file.added === 0 &&
      file.deleted === 0
    ) {
      return { path: file.path, status: 'no-hunks' };
    }
    if (included.has(file.path)) {
      if (file.hunkCount > 0) return { path: file.path, status: 'pending' };
      if (file.reason === undefined && file.added === 0 && file.deleted === 0) {
        return { path: file.path, status: 'no-hunks' };
      }
    }
    return { path: file.path, status: 'skipped', reason: skipReason(file) };
  });
  const incomplete = manifest.warnings.some((warning) => INCOMPLETE_MANIFEST_WARNINGS.has(warning));
  return {
    files,
    totals: summarizeCoverage(files),
    ...(incomplete ? { incomplete: true } : {}),
  };
}

/**
 * A round is complete only when every ledger file has a final reviewed or
 * policy-excluded status. Unknown persisted statuses and inconsistent totals
 * are treated as incomplete: they prove the ledger cannot be trusted.
 */
export function isCoverageComplete(coverage: ReviewCoverage): boolean {
  if (coverage.incomplete === true) return false;
  const computed = summarizeCoverage(coverage.files);
  const knownCount = COVERAGE_STATUSES.reduce((sum, status) => sum + computed.byStatus[status], 0);
  if (knownCount !== coverage.files.length) return false;
  if (coverage.totals.files !== coverage.files.length) return false;
  for (const status of COVERAGE_STATUSES) {
    if ((coverage.totals.byStatus[status] ?? 0) !== computed.byStatus[status]) return false;
  }
  const persistedCount = COVERAGE_STATUSES.reduce(
    (sum, status) => sum + (coverage.totals.byStatus[status] ?? 0),
    0,
  );
  if (persistedCount !== coverage.files.length) return false;
  return coverage.files.every((file) => {
    if (UNRESOLVED_STATUSES.has(file.status)) return false;
    if (file.status !== 'manifest-only') return true;
    return file.reason !== undefined && POLICY_REASONS.has(file.reason as ManifestFileReason);
  });
}

/**
 * Promotes pending files to light-reviewed after an accepted report. The
 * returned ledger and its file entries are new objects; the input is not
 * mutated. Totals are always recomputed from the resulting files.
 */
export function promotePendingToLight(coverage: ReviewCoverage): ReviewCoverage {
  const files = coverage.files.map((file): FileCoverage =>
    file.status === 'pending' ? { ...file, status: 'light-reviewed' } : { ...file },
  );
  return {
    files,
    totals: summarizeCoverage(files),
    ...(coverage.incomplete === true ? { incomplete: true } : {}),
  };
}
