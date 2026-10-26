import { lstat } from 'node:fs/promises';
import type { DiffHunk, FileDiff, Snapshot, SnapshotOptions } from '../types.js';
import { hasSymlinkParent, safeJoin } from '../paths.js';
import { readBlob } from '../git/content.js';
import { resolveScope } from '../git/scope.js';
import { runGit } from '../git/run.js';
import type { GitResult } from '../git/run.js';
import { parseUnifiedDiff } from './parse.js';
import { isIgnored } from './glob.js';

const DEFAULTS = {
  includeUntracked: true,
  includeContent: true,
  maxDiffBytes: 2 * 1024 * 1024,
  maxFileLines: 20_000,
  maxFiles: 500,
} as const;

interface DiffText {
  text: string;
  truncated: boolean;
}

function diffArgs(scope: Snapshot['scope']): string[] {
  const common = [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--unified=3',
    '--find-renames=50%',
  ];
  if (scope.kind === 'worktree') return [...common, scope.baseSha, '--'];
  return [...common, `${scope.baseSha}..${scope.headSha}`, '--'];
}

function truncateAtFileBoundary(text: string, maxBytes: number): DiffText {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return { text, truncated: false };
  }
  const cut = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
  const boundary = cut.lastIndexOf('\ndiff --git ');
  if (boundary <= 0) return { text: '', truncated: true };
  return { text: cut.slice(0, boundary + 1), truncated: true };
}

async function listUntracked(repoRoot: string, signal?: AbortSignal): Promise<string[]> {
  const result = await runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'], {
    signal,
    maxBytes: 8 * 1024 * 1024,
  });
  return result.stdout.split('\0').filter((path) => path.length > 0);
}

async function headModes(
  repoRoot: string,
  headSha: string | null,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  let result: GitResult;
  try {
    result = await runGit(
      repoRoot,
      headSha === null ? ['ls-files', '-s', '-z'] : ['ls-tree', '-r', '-z', headSha],
      { allowFailure: true, signal, maxBytes: 8 * 1024 * 1024 },
    );
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return new Map();
  }
  if (result.code !== 0) return new Map();

  const modes = new Map<string, string>();
  for (const entry of result.stdout.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const mode = entry.slice(0, tab).split(' ')[0];
    const path = entry.slice(tab + 1);
    if (mode !== undefined && path !== '') modes.set(path, mode);
  }
  return modes;
}

async function untrackedFile(
  repoRoot: string,
  path: string,
  maxFileLines: number,
  includeContent: boolean,
): Promise<FileDiff | null> {
  const absolute = safeJoin(repoRoot, path);
  if (await hasSymlinkParent(repoRoot, path)) return null;
  const info = await lstat(absolute).catch(() => null);
  if (info === null || info.isSymbolicLink() || !info.isFile()) return null;

  const read = await readBlob(repoRoot, null, path, maxFileLines);
  const contentHash = includeContent && !read.oversized && read.hash !== '' ? read.hash : null;

  if (read.lines === null) {
    if (!read.binary && !read.oversized) return null;
    return {
      path,
      status: 'untracked',
      binary: read.binary,
      oversized: read.oversized,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash,
    };
  }

  const hunk: DiffHunk = {
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: read.lines.length,
    header: '',
    lines: read.lines.map((text, index) => ({
      kind: 'add' as const,
      oldNo: null,
      newNo: index + 1,
      text,
    })),
  };

  const file: FileDiff = {
    path,
    status: 'untracked',
    binary: false,
    oversized: false,
    added: read.lines.length,
    deleted: 0,
    hunks: read.lines.length === 0 ? [] : [hunk],
    contentHash,
  };
  if (includeContent) file.newLines = read.lines;
  return file;
}

export async function buildSnapshot(options: SnapshotOptions): Promise<Snapshot> {
  const includeContent = options.includeContent ?? DEFAULTS.includeContent;
  const includeUntracked = options.includeUntracked ?? DEFAULTS.includeUntracked;
  const maxDiffBytes = options.maxDiffBytes ?? DEFAULTS.maxDiffBytes;
  const maxFileLines = options.maxFileLines ?? DEFAULTS.maxFileLines;
  const maxFiles = options.maxFiles ?? DEFAULTS.maxFiles;
  const ignore = options.ignore ?? [];

  const scope = await resolveScope({
    repoRoot: options.repoRoot,
    scope: options.scope,
    signal: options.signal,
  });

  const warnings: string[] = [];
  const diff = await runGit(scope.repoRoot, diffArgs(scope), {
    signal: options.signal,
    maxBytes: Math.max(maxDiffBytes * 8, 16 * 1024 * 1024),
    truncateOnOverflow: true,
  });
  const diffTruncated = diff.truncated === true;
  if (diffTruncated) warnings.push('diff-truncated');
  const limited = truncateAtFileBoundary(diff.stdout, maxDiffBytes);
  if (limited.truncated && !diffTruncated) warnings.push('diff-truncated');

  const candidates = parseUnifiedDiff(limited.text)
    .filter((entry) => !isIgnored(entry.path, ignore))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  let truncated = diffTruncated || limited.truncated;
  let selected = candidates;
  if (candidates.length > maxFiles) {
    selected = candidates.slice(0, maxFiles);
    truncated = true;
    warnings.push('files-truncated');
  }

  const modes = await headModes(scope.repoRoot, scope.headSha, options.signal);

  const files: FileDiff[] = [];
  for (const entry of selected) {
    const oldPath = entry.oldPath ?? entry.path;
    if (modes.get(entry.path) === '160000') {
      // A gitlink addresses a commit, not a worktree path: never read content for it.
      const submodule: FileDiff = {
        path: entry.path,
        status: 'submodule',
        binary: false,
        oversized: false,
        added: entry.added,
        deleted: entry.deleted,
        hunks: entry.hunks,
        contentHash: null,
      };
      if (entry.oldPath !== undefined) submodule.oldPath = entry.oldPath;
      files.push(submodule);
      continue;
    }
    const base =
      entry.status === 'added' || !includeContent
        ? null
        : await readBlob(scope.repoRoot, scope.baseSha, oldPath, maxFileLines);
    const head =
      entry.status === 'deleted' || !includeContent
        ? null
        : await readBlob(scope.repoRoot, scope.headSha, entry.path, maxFileLines);

    const binary = entry.binary || base?.binary === true || head?.binary === true;
    const oversized = base?.oversized === true || head?.oversized === true;
    let contentHash: string | null = null;
    if (includeContent && !oversized) {
      if (head !== null && head.hash !== '') contentHash = head.hash;
      else if (base !== null && base.hash !== '') contentHash = base.hash;
    }

    const file: FileDiff = {
      path: entry.path,
      status: entry.status,
      binary,
      oversized,
      added: entry.added,
      deleted: entry.deleted,
      hunks: entry.hunks,
      contentHash,
    };
    if (entry.oldPath !== undefined) file.oldPath = entry.oldPath;
    if (!binary && !oversized && base !== null && base.lines !== null) {
      file.oldLines = base.lines;
    }
    if (!binary && !oversized && head !== null && head.lines !== null) {
      file.newLines = head.lines;
    }
    files.push(file);
  }

  if (scope.kind === 'worktree' && includeUntracked) {
    const untrackedPaths = await listUntracked(scope.repoRoot, options.signal);
    for (const path of untrackedPaths) {
      if (isIgnored(path, ignore)) continue;
      const absolute = safeJoin(scope.repoRoot, path);
      const info = await lstat(absolute).catch(() => null);
      if (info?.isSymbolicLink() === true || (await hasSymlinkParent(scope.repoRoot, path))) {
        warnings.push(`symlink-not-followed:${path}`);
        continue;
      }
      const file = await untrackedFile(scope.repoRoot, path, maxFileLines, includeContent);
      if (file !== null) files.push(file);
    }
  }

  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  if (files.length > maxFiles) {
    files.splice(maxFiles);
    truncated = true;
    if (!warnings.includes('files-truncated')) warnings.push('files-truncated');
  }

  const totals = files.reduce(
    (accumulator, file) => ({
      files: accumulator.files + 1,
      added: accumulator.added + file.added,
      deleted: accumulator.deleted + file.deleted,
      truncated,
    }),
    { files: 0, added: 0, deleted: 0, truncated },
  );

  return {
    schemaVersion: 1,
    scope,
    files,
    totals,
    warnings,
  };
}
