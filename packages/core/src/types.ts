export type DiffLineKind = 'context' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'submodule' | 'untracked';

export interface ParsedFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary: boolean;
  hunks: DiffHunk[];
  added: number;
  deleted: number;
  oldMode?: string;
  newMode?: string;
  indexMode?: string;
  /** Present when the diff was cut inside this file before a hunk was complete. */
  synthetic?: true;
}

export type DiffScope =
  | { kind: 'range'; baseRef: string; headRef: string; twoDot?: boolean }
  | { kind: 'worktree'; baseRef: string }
  | { kind: 'commit'; sha: string };

export interface ResolvedScope {
  kind: DiffScope['kind'];
  repoRoot: string;
  baseRef?: string;
  headRef?: string;
  baseSha: string;
  headSha: string | null;
  label: string;
  worktreeDigest: string;
  worktreeDigestTruncated?: boolean;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  oversized: boolean;
  /** Ignored entries stay visible but carry no content. */
  ignored?: boolean;
  /** Content was omitted because the snapshot-wide content budget was exhausted. */
  truncated?: boolean;
  /** Set when the raw bytes are not valid UTF-8. */
  encoding?: 'unknown';
  /** Set when a per-file read failed (for example EACCES or an ENOENT race). */
  reason?: 'unreadable';
  added: number;
  deleted: number;
  hunks: DiffHunk[];
  oldLines?: string[];
  newLines?: string[];
  contentHash: string | null;
}

export interface Snapshot {
  schemaVersion: 1;
  scope: ResolvedScope;
  files: FileDiff[];
  totals: { files: number; added: number; deleted: number; truncated: boolean };
  warnings: string[];
}

export interface SnapshotOptions {
  repoRoot: string;
  scope: DiffScope;
  includeUntracked?: boolean;
  includeContent?: boolean;
  maxDiffBytes?: number;
  maxFileLines?: number;
  maxContentBytes?: number;
  maxTotalContentBytes?: number;
  maxFiles?: number;
  ignore?: readonly string[];
  signal?: AbortSignal;
}
