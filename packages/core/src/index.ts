export const CORE_VERSION = '0.3.0';
export { safeJoin, PathEscapeError } from './paths.js';
export { buildSnapshot } from './diff/snapshot.js';
export {
  buildReviewManifest,
  manifestFileFromDiff,
  manifestFromSnapshot,
  patchBytesFromHunks,
  reviewManifest,
} from './diff/manifest.js';
export { readBlob } from './git/content.js';
export type { BlobRead } from './git/content.js';
export { DiffParseError, parseUnifiedDiff } from './diff/parse.js';
export { EMPTY_TREE_SHA, resolveDefaultBase, resolveScope, worktreeDigest } from './git/scope.js';
export type { ResolveScopeInput } from './git/scope.js';
export { GitError, runGit } from './git/run.js';
export type { GitErrorCode, GitResult, GitRunOptions } from './git/run.js';
export { resolveRepoRoot } from './git/repo.js';
export type {
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffScope,
  FileDiff,
  FileStatus,
  ManifestFile,
  ManifestFileReason,
  ManifestTotals,
  ParsedFile,
  ResolvedScope,
  ReviewManifest,
  Snapshot,
  SnapshotOptions,
} from './types.js';
export { createId, ID_LENGTHS, ReviewIdError } from './review/ids.js';
export type { IdPrefix, RandomBytes } from './review/ids.js';
export {
  createEvent,
  isActor,
  isReviewEvent,
  isReviewEventType,
  REVIEW_EVENT_TYPES,
  ReviewEventError,
} from './review/events.js';
export type {
  AgentCoverageData,
  AgentShardData,
  AgentFailedData,
  AgentFindingData,
  AgentReportData,
  AgentStartedData,
  CommentAddedData,
  CommentAnchorData,
  CommentRepliedData,
  CommentStateData,
  CreateEventInput,
  FindingDecisionData,
  FixClaimData,
  SuggestionStateData,
  ReviewClosedData,
  ReviewCreatedData,
  ReviewEvent,
  ReviewEventBase,
  ReviewEventDataMap,
  ReviewEventErrorCode,
  ReviewEventType,
  ReviewSubmittedData,
  RoundCreatedData,
  SuggestionAppliedData,
} from './review/events.js';
export type {
  Actor,
  ActorKind,
  AgentShardState,
  AgentState,
  AgentStatus,
  AddCommentInput,
  Anchor,
  AnchorPosition,
  AnchorState,
  Comment,
  CommentId,
  CommentState,
  Confidence,
  CoverageStatus,
  CoverageTotals,
  CreateReviewInput,
  FileCoverage,
  FindingDecision,
  FindingDecisionState,
  Outcome,
  OutcomeStatus,
  Reply,
  ReviewCoverage,
  ReviewId,
  ReviewState,
  ReviewStatus,
  ReviewSummary,
  Round,
  RoundNo,
  Side,
  SuggestionState,
  FixStatus,
  FixClaimRecord,
  Initiator,
  SubmissionRecord,
  Suggestion,
} from './review/types.js';
export { AnchorError, captureAnchor, normalizeQuote, reanchor } from './review/anchors.js';
export type { AnchorErrorCode, CaptureAnchorInput, ReanchorOptions } from './review/anchors.js';
export {
  COVERAGE_STATUSES,
  coverageFromPrompt,
  initialCoverage,
  isCoverageComplete,
  promotePendingToLight,
  summarizeCoverage,
} from './review/coverage.js';
export {
  buildModuleMap,
  buildReviewPlan,
  classifyFile,
  coverageFromPlan,
  DEFAULT_SHARD_LIMITS,
  isUserFacingDoc,
} from './review/plan.js';
export type {
  FileKind,
  ModuleInfo,
  ModuleMap,
  ModuleRoot,
  PlanFile,
  ReviewPlan,
  ReviewShard,
  ReviewTier,
  ShardLimits,
} from './review/plan.js';
export { aggregateShardReports, mergeShardReports } from './review/aggregate.js';
export type {
  AggregateShardReportsInput,
  AggregateShardReportsResult,
  MergeShardReportsInput,
  ShardReportInput,
} from './review/aggregate.js';
export { deriveOutcome } from './review/outcomes.js';
export { isFinalReviewReport } from './review/final.js';
export { fold, ReviewFoldError } from './review/fold.js';
export { ReviewLifecycle, ReviewLifecycleError } from './review/lifecycle.js';
export type { RefreshResult, ReviewLifecycleErrorCode } from './review/lifecycle.js';
export {
  ReviewNotFoundError,
  ReviewStore,
  ReviewStoreCorruptionError,
  ReviewStoreLockedError,
} from './review/store.js';
export type { GcResult } from './review/store.js';
export type { ReviewStoreOptions } from './review/store.js';

export { FakeReviewer } from './reviewer/fake.js';
export type { FakeReviewerOptions } from './reviewer/fake.js';
export { CommandReviewer } from './reviewer/command.js';
export type { CommandReviewerOptions } from './reviewer/command.js';
export {
  MAX_TEXT_BYTES,
  normalizeCode,
  ReportValidationError,
  validateFindingItem,
  validateReport,
} from './reviewer/validate.js';
export type { FindingItemValidation } from './reviewer/validate.js';
export type {
  AgentReport,
  Finding,
  FindingCategory,
  FindingKind,
  FindingSeverity,
  FindingSink,
  GitStatusRunner,
  RejectedReportItem,
  RejectedReportKind,
  ReviewQuestion,
  ReviewSuggestion,
  ReviewerBackend,
  ReviewerBackendKind,
  ReviewerConfidence,
  ReviewerConfig,
  ReviewerErrorCode,
  ReviewerJob,
  ReviewerReport,
  RiskLevel,
  TestCommand,
  TestResult,
  TestSummary,
  ValidationResult,
  Verification,
  VerificationStatus,
} from './reviewer/types.js';
export { ReviewerError } from './reviewer/types.js';
export { ReviewError } from './service/types.js';
export type {
  CallContext,
  CommentView,
  FeedbackComment,
  FeedbackFinding,
  FeedbackJson,
  FeedbackPackage,
  FeedbackSuggestion,
  BulkFindingDecisionInput,
  BulkFindingDecisionView,
  FindingDecisionInput,
  FindingDecisionView,
  Page,
  ReplyInput,
  ReviewErrorCode,
  ReviewFilter,
  ReviewService,
  ReviewServiceImplDeps,
  ReviewView,
  ServiceCreateInput,
  ServiceSnapshotView,
  SubmissionView,
  SuggestionActionInput,
  FixStatusInput,
  RefreshInput,
  LatestFeedbackView,
  SubmitInput,
} from './service/types.js';
export { buildFeedback, FEEDBACK_BYTE_LIMIT } from './service/feedback.js';
export type { BuildFeedbackInput } from './service/feedback.js';
export { ReviewServiceImpl } from './service/service.js';
