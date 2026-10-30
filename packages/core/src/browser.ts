/**
 * Browser-safe subset of the core package.
 *
 * The root entry point also exposes filesystem, git and process helpers. Those
 * pull Node built-ins into browser bundles even when only review state helpers
 * are imported, so the SPA uses this deliberately narrow entry instead.
 */
export { fold, ReviewFoldError } from './review/fold.js';
export { isFinalReviewReport } from './review/final.js';
export { mergeShardReports } from './review/aggregate.js';
export type { MergeShardReportsInput } from './review/aggregate.js';
