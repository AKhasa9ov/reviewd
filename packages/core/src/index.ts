export const CORE_VERSION = '0.1.0';
export { safeJoin, PathEscapeError } from './paths.js';
export { buildSnapshot } from './diff/snapshot.js';
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
  ParsedFile,
  ResolvedScope,
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
  CommentAddedData,
  CommentAnchorData,
  CommentRepliedData,
  CommentStateData,
  CreateEventInput,
  ReviewClosedData,
  ReviewCreatedData,
  ReviewEvent,
  ReviewEventBase,
  ReviewEventDataMap,
  ReviewEventErrorCode,
  ReviewEventType,
  RoundCreatedData,
  SuggestionAppliedData,
} from './review/events.js';
export type {
  Actor,
  ActorKind,
  AddCommentInput,
  Anchor,
  AnchorPosition,
  AnchorState,
  Comment,
  CommentId,
  CommentState,
  Confidence,
  CreateReviewInput,
  Outcome,
  OutcomeStatus,
  Reply,
  ReviewId,
  ReviewState,
  ReviewStatus,
  ReviewSummary,
  Round,
  RoundNo,
  Side,
  Suggestion,
} from './review/types.js';
export { AnchorError, captureAnchor, reanchor } from './review/anchors.js';
export type { AnchorErrorCode, CaptureAnchorInput, ReanchorOptions } from './review/anchors.js';
export { fold, ReviewFoldError } from './review/fold.js';
export {
  ReviewNotFoundError,
  ReviewStore,
  ReviewStoreCorruptionError,
  ReviewStoreLockedError,
} from './review/store.js';
