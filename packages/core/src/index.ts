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
