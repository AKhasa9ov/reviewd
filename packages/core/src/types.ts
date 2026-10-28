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
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'submodule';
  binary: boolean;
  hunks: DiffHunk[];
  added: number;
  deleted: number;
  oldMode?: string;
  newMode?: string;
  indexMode?: string;
  /** Present when the diff was cut inside this file before a hunk was complete. */
  synthetic?: true;
  /** Present when metadata was recovered after the file fell wholly beyond the diff cap. */
  backfill?: true;
  /** Present when raw metadata confirmed this synthetic file was cut by the diff cap. */
  skipped?: true;
}

export type DiffScope =
  | { kind: 'range'; baseRef: string; headRef: string; twoDot?: boolean }
  | { kind: 'worktree'; baseRef: string }
  | { kind: 'commit'; sha: string }
  | { kind: 'commits'; shas: string[] };

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
  /** Present for a selected-commit scope, oldest to newest. */
  shas?: string[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  oversized: boolean;
  /** Ignored entries stay visible but carry no content. */
  ignored?: boolean;
  /** Content was omitted by the snapshot-wide budget or because the file lies beyond the diff cap. */
  truncated?: boolean;
  /** Set when the raw bytes are not valid UTF-8. */
  encoding?: 'unknown';
  /** Set when content was unavailable: an unreadable read or diff-cap backfill. */
  reason?: 'unreadable' | 'diff-truncated';
  added: number;
  deleted: number;
  hunks: DiffHunk[];
  oldLines?: string[];
  newLines?: string[];
  contentHash: string | null;
}

/** Why a manifest entry has no patch content. */
export type ManifestFileReason =
  | 'per-file-cap'
  | 'binary'
  | 'ignored'
  | 'generated'
  | 'legacy-truncated'
  | 'diff-truncated'
  | 'render-budget'
  | 'unreadable';

/**
 * One changed path in the complete manifest. Every changed path is listed here,
 * even when its patch/content is omitted from the bounded render subset.
 */
export interface ManifestFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  ignored: boolean;
  oversized: boolean;
  added: number;
  deleted: number;
  hunkCount: number;
  /** UTF-8 bytes of the hunk bodies; a lower bound on full unified-diff bytes. */
  patchBytes: number;
  /** Raw content bytes when a source (such as numstat) provides them; absent means unknown. */
  contentBytes?: number;
  reason?: ManifestFileReason;
}

export interface ManifestTotals {
  files: number;
  added: number;
  deleted: number;
  /** Sum of the per-file hunk-body byte bounds, not full unified-diff bytes. */
  patchBytes: number;
}

/** Complete changed-file manifest; independent of the snapshot render budget. */
export interface ReviewManifest {
  schemaVersion: 1;
  scope: ResolvedScope;
  files: ManifestFile[];
  totals: ManifestTotals;
  warnings: string[];
}

export interface Snapshot {
  /** v1 snapshots may omit `manifest`; v2 snapshots always carry one. */
  schemaVersion: 1 | 2;
  scope: ResolvedScope;
  files: FileDiff[];
  /** Complete changed-file manifest; absent on legacy v1 snapshots. */
  manifest?: ReviewManifest;
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
