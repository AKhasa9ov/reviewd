export const CORE_VERSION = '0.1.0';
export { DiffParseError, parseUnifiedDiff } from './diff/parse.js';
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
