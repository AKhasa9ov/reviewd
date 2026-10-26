import type { FileDiff, Snapshot, SnapshotOptions } from '../types.js';
import { readBlob } from '../git/content.js';
import { resolveScope } from '../git/scope.js';
import { runGit } from '../git/run.js';
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

export async function buildSnapshot(options: SnapshotOptions): Promise<Snapshot> {
  const includeContent = options.includeContent ?? DEFAULTS.includeContent;
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

  const files: FileDiff[] = [];
  for (const entry of selected) {
    const oldPath = entry.oldPath ?? entry.path;
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
    if (includeContent) {
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
