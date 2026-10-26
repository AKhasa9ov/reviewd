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

export type FileStatus =
  'added' | 'modified' | 'deleted' | 'renamed' | 'binary' | 'oversized' | 'submodule' | 'untracked';

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
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  oversized: boolean;
  added: number;
  deleted: number;
  hunks: DiffHunk[];
  oldLines?: string[];
  newLines?: string[];
  contentHash: string;
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
  maxFiles?: number;
  ignore?: readonly string[];
  signal?: AbortSignal;
}
