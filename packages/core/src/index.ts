export const CORE_VERSION = '0.1.0';
export { DiffParseError, parseUnifiedDiff } from './diff/parse.js';
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
