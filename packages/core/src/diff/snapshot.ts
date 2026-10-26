import { lstat } from 'node:fs/promises';
import type { DiffHunk, FileDiff, ParsedFile, Snapshot, SnapshotOptions } from '../types.js';
import { hasSymlinkParent, safeJoin } from '../paths.js';
import { readBlob } from '../git/content.js';
import { resolveScope } from '../git/scope.js';
import { runGit } from '../git/run.js';
import type { GitResult } from '../git/run.js';
import { parseDiffHeader, parseUnifiedDiff, stripDiffPrefix } from './parse.js';
import { isIgnored } from './glob.js';

const DEFAULTS = {
  includeUntracked: true,
  includeContent: true,
  maxDiffBytes: 2 * 1024 * 1024,
  maxFileLines: 20_000,
  maxContentBytes: 1024 * 1024,
  maxTotalContentBytes: 64 * 1024 * 1024,
  maxFiles: 500,
} as const;

interface ContentBudget {
  includeContent: boolean;
  maxTotalBytes: number;
  usedBytes: number;
  exhausted: boolean;
  warned: boolean;
  warnings: string[];
}

function fitsContent(budget: ContentBudget, bytes: number): boolean {
  if (!budget.includeContent) return false;
  if (budget.exhausted || budget.usedBytes + bytes > budget.maxTotalBytes) {
    if (!budget.warned) {
      budget.warnings.push('content-budget-truncated');
      budget.warned = true;
    }
    budget.exhausted = true;
    return false;
  }
  budget.usedBytes += bytes;
  return true;
}

function comparePaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function warnUnreadable(warnings: string[], path: string): void {
  const warning = `unreadable:${path}`;
  if (!warnings.includes(warning)) warnings.push(warning);
}

interface DiffText {
  text: string;
  truncated: boolean;
  synthetic?: ParsedFile;
}

function diffArgs(scope: Snapshot['scope']): string[] {
  const common = [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--unified=3',
    '--find-renames=50%',
    '--src-prefix=a/',
    '--dst-prefix=b/',
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
  if (boundary > 0) {
    const synthetic = syntheticFileFromCut(cut.slice(boundary + 1));
    return {
      text: cut.slice(0, boundary + 1),
      truncated: true,
      ...(synthetic === undefined ? {} : { synthetic }),
    };
  }
  if (cut.startsWith('diff --git ')) {
    const synthetic = syntheticFileFromCut(cut);
    return { text: '', truncated: true, ...(synthetic === undefined ? {} : { synthetic }) };
  }
  return { text: '', truncated: true };
}

function syntheticFileFromCut(cut: string): ParsedFile | undefined {
  const firstLineEnd = cut.indexOf('\n');
  const headerLine = firstLineEnd < 0 ? cut : cut.slice(0, firstLineEnd);
  if (!headerLine.startsWith('diff --git ')) return undefined;

  const header = parseDiffHeader(headerLine, 1);
  let oldPath = header.oldPath;
  let newPath = header.newPath;
  let status: ParsedFile['status'] = 'modified';
  let oldIsNull = false;
  let newIsNull = false;

  for (const line of cut.split('\n').slice(1)) {
    if (line.startsWith('@@ ') || line === 'GIT binary patch') break;
    if (line.startsWith('new file mode ')) status = 'added';
    else if (line.startsWith('deleted file mode ')) status = 'deleted';
    else if (line.startsWith('rename from ')) {
      oldPath = line.slice('rename from '.length);
      status = 'renamed';
    } else if (line.startsWith('rename to ')) {
      newPath = line.slice('rename to '.length);
      status = 'renamed';
    } else if (line.startsWith('--- ')) {
      const value = line.slice(4);
      if (value === '/dev/null') oldIsNull = true;
      else oldPath = stripDiffPrefix(value);
    } else if (line.startsWith('+++ ')) {
      const value = line.slice(4);
      if (value === '/dev/null') newIsNull = true;
      else newPath = stripDiffPrefix(value);
    }
  }

  if (oldIsNull) status = 'added';
  if (newIsNull) status = 'deleted';
  const path = newIsNull ? oldPath : newPath;
  const file: ParsedFile = {
    path,
    status,
    binary: false,
    hunks: [],
    added: 0,
    deleted: 0,
    synthetic: true,
  };
  if (oldPath !== path) file.oldPath = oldPath;
  return file;
}

async function listUntracked(repoRoot: string, signal?: AbortSignal): Promise<string[]> {
  const result = await runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'], {
    signal,
    maxBytes: 8 * 1024 * 1024,
  });
  return result.stdout.split('\0').filter((path) => path.length > 0);
}

interface ModeListing {
  modes: Map<string, string>;
  available: boolean;
}

async function headModes(
  repoRoot: string,
  headSha: string | null,
  signal?: AbortSignal,
): Promise<ModeListing> {
  let result: GitResult;
  try {
    result = await runGit(
      repoRoot,
      headSha === null ? ['ls-files', '-s', '-z'] : ['ls-tree', '-r', '-z', headSha],
      { allowFailure: true, signal, maxBytes: 8 * 1024 * 1024 },
    );
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { modes: new Map(), available: false };
  }
  if (result.code !== 0) return { modes: new Map(), available: false };

  const modes = new Map<string, string>();
  for (const entry of result.stdout.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const mode = entry.slice(0, tab).split(' ')[0];
    const path = entry.slice(tab + 1);
    if (mode !== undefined && path !== '') modes.set(path, mode);
  }
  return { modes, available: true };
}

async function untrackedFile(
  repoRoot: string,
  path: string,
  maxFileLines: number,
  maxContentBytes: number,
  includeContent: boolean,
  ignored: boolean,
  budget: ContentBudget,
  warnings: string[],
): Promise<FileDiff | null> {
  const absolute = safeJoin(repoRoot, path);
  if (await hasSymlinkParent(repoRoot, path)) return null;
  const info = await lstat(absolute).catch(() => null);
  if (info === null) {
    warnUnreadable(warnings, path);
    return {
      path,
      status: 'untracked',
      binary: false,
      oversized: false,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: null,
      reason: 'unreadable',
    };
  }
  if (info.isSymbolicLink() || !info.isFile()) return null;

  const read = await readBlob(repoRoot, null, path, maxFileLines, maxContentBytes);
  if (read.reason === 'unreadable') {
    warnUnreadable(warnings, path);
    return {
      path,
      status: 'untracked',
      binary: false,
      oversized: false,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: null,
      reason: 'unreadable',
    };
  }

  if (ignored) {
    if (read.lines === null && !read.binary && !read.oversized) return null;
    return {
      path,
      status: 'untracked',
      binary: read.binary,
      oversized: read.oversized,
      ignored: true,
      added: read.lines?.length ?? 0,
      deleted: 0,
      hunks: [],
      contentHash: null,
    };
  }

  if (read.lines === null) {
    if (!read.binary && !read.oversized) return null;
    const binaryLike: FileDiff = {
      path,
      status: 'untracked',
      binary: read.binary,
      oversized: read.oversized,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: includeContent && !read.oversized ? read.hash : null,
    };
    if (read.encoding !== undefined) binaryLike.encoding = read.encoding;
    return binaryLike;
  }

  const truncated = includeContent && !fitsContent(budget, read.bytes);
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
    hunks: truncated || read.lines.length === 0 ? [] : [hunk],
    contentHash: includeContent && !truncated ? read.hash : null,
  };
  if (truncated) file.truncated = true;
  if (includeContent && !truncated) file.newLines = read.lines;
  return file;
}

export async function buildSnapshot(options: SnapshotOptions): Promise<Snapshot> {
  const includeContent = options.includeContent ?? DEFAULTS.includeContent;
  const includeUntracked = options.includeUntracked ?? DEFAULTS.includeUntracked;
  const maxDiffBytes = options.maxDiffBytes ?? DEFAULTS.maxDiffBytes;
  const maxFileLines = options.maxFileLines ?? DEFAULTS.maxFileLines;
  const maxContentBytes = options.maxContentBytes ?? DEFAULTS.maxContentBytes;
  const maxTotalContentBytes = options.maxTotalContentBytes ?? DEFAULTS.maxTotalContentBytes;
  const maxFiles = options.maxFiles ?? DEFAULTS.maxFiles;
  const ignore = options.ignore ?? [];

  const scope = await resolveScope({
    repoRoot: options.repoRoot,
    scope: options.scope,
    signal: options.signal,
  });

  const warnings: string[] = [];
  if (scope.worktreeDigestTruncated === true) warnings.push('worktree-digest-truncated');
  const diff = await runGit(scope.repoRoot, diffArgs(scope), {
    signal: options.signal,
    maxBytes: Math.max(maxDiffBytes * 8, 16 * 1024 * 1024),
    truncateOnOverflow: true,
  });
  const diffTruncated = diff.truncated === true;
  if (diffTruncated) warnings.push('diff-truncated');
  const limited = truncateAtFileBoundary(diff.stdout, maxDiffBytes);
  if (limited.truncated && !diffTruncated) warnings.push('diff-truncated');
  if (limited.synthetic !== undefined) {
    warnings.push(`diff-file-truncated:${limited.synthetic.path}`);
  }

  const candidates = [
    ...(limited.synthetic === undefined ? [] : [limited.synthetic]),
    ...parseUnifiedDiff(limited.text),
  ].sort((left, right) => comparePaths(left.path, right.path));

  let truncated = diffTruncated || limited.truncated;
  let selected = candidates;
  const reviewableCandidates = candidates.filter((entry) => !isIgnored(entry.path, ignore));
  if (reviewableCandidates.length > maxFiles) {
    const kept = new Set(reviewableCandidates.slice(0, maxFiles));
    selected = candidates.filter((entry) => isIgnored(entry.path, ignore) || kept.has(entry));
    truncated = true;
    warnings.push('files-truncated');
  }

  const modeListing = await headModes(scope.repoRoot, scope.headSha, options.signal);
  if (!modeListing.available) warnings.push('submodule-modes-unavailable');

  const budget: ContentBudget = {
    includeContent,
    maxTotalBytes: maxTotalContentBytes,
    usedBytes: 0,
    exhausted: false,
    warned: false,
    warnings,
  };
  const files: FileDiff[] = [];
  for (const entry of selected) {
    if (entry.synthetic === true) {
      const synthetic: FileDiff = {
        path: entry.path,
        status: entry.status,
        binary: false,
        oversized: true,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
      };
      if (entry.oldPath !== undefined) synthetic.oldPath = entry.oldPath;
      if (isIgnored(entry.path, ignore)) {
        synthetic.ignored = true;
        synthetic.oversized = false;
      }
      files.push(synthetic);
      continue;
    }
    if (isIgnored(entry.path, ignore)) {
      const ignored: FileDiff = {
        path: entry.path,
        status: entry.status,
        binary: entry.binary,
        oversized: false,
        ignored: true,
        added: entry.added,
        deleted: entry.deleted,
        hunks: [],
        contentHash: null,
      };
      if (entry.oldPath !== undefined) ignored.oldPath = entry.oldPath;
      files.push(ignored);
      continue;
    }
    const oldPath = entry.oldPath ?? entry.path;
    const hasMode =
      entry.oldMode !== undefined || entry.newMode !== undefined || entry.indexMode !== undefined;
    const isGitlink = hasMode
      ? entry.oldMode === '160000' || entry.newMode === '160000' || entry.indexMode === '160000'
      : modeListing.modes.get(entry.path) === '160000';
    if (isGitlink) {
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
    const budgetSkipped = includeContent && budget.exhausted;
    const base =
      entry.status === 'added' || !includeContent || budgetSkipped
        ? null
        : await readBlob(scope.repoRoot, scope.baseSha, oldPath, maxFileLines, maxContentBytes);
    const head =
      entry.status === 'deleted' || !includeContent || budgetSkipped
        ? null
        : await readBlob(scope.repoRoot, scope.headSha, entry.path, maxFileLines, maxContentBytes);

    const binary = entry.binary || base?.binary === true || head?.binary === true;
    const oversized = base?.oversized === true || head?.oversized === true;
    const encoding =
      base?.encoding === 'unknown' || head?.encoding === 'unknown' ? 'unknown' : undefined;
    const reason =
      base?.reason === 'unreadable' || head?.reason === 'unreadable' ? 'unreadable' : undefined;

    let fileTruncated = false;
    let oldLines: string[] | undefined;
    let newLines: string[] | undefined;
    if (reason !== undefined) {
      warnUnreadable(warnings, entry.path);
    } else if (includeContent && !binary && !oversized) {
      if (budgetSkipped) {
        fileTruncated = true;
      } else {
        const bytes =
          (base?.lines === null || base === null ? 0 : base.bytes) +
          (head?.lines === null || head === null ? 0 : head.bytes);
        if (fitsContent(budget, bytes)) {
          oldLines = base?.lines ?? undefined;
          newLines = head?.lines ?? undefined;
        } else {
          fileTruncated = true;
        }
      }
    }

    let contentHash: string | null = null;
    if (includeContent && !oversized && reason === undefined && !fileTruncated) {
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
      hunks: binary || oversized ? [] : entry.hunks,
      contentHash,
    };
    if (entry.oldPath !== undefined) file.oldPath = entry.oldPath;
    if (encoding !== undefined) file.encoding = encoding;
    if (reason !== undefined) file.reason = reason;
    if (fileTruncated) file.truncated = true;
    if (oldLines !== undefined) file.oldLines = oldLines;
    if (newLines !== undefined) file.newLines = newLines;
    files.push(file);
  }

  if (scope.kind === 'worktree' && includeUntracked) {
    const untrackedPaths = await listUntracked(scope.repoRoot, options.signal);
    for (const path of untrackedPaths) {
      const absolute = safeJoin(scope.repoRoot, path);
      const info = await lstat(absolute).catch(() => null);
      if (info?.isSymbolicLink() === true || (await hasSymlinkParent(scope.repoRoot, path))) {
        warnings.push(`symlink-not-followed:${path}`);
        continue;
      }
      const file = await untrackedFile(
        scope.repoRoot,
        path,
        maxFileLines,
        maxContentBytes,
        includeContent,
        isIgnored(path, ignore),
        budget,
        warnings,
      );
      if (file !== null) files.push(file);
    }
  }

  files.sort((left, right) => comparePaths(left.path, right.path));

  const reviewableFiles = files.filter((file) => file.ignored !== true);
  if (reviewableFiles.length > maxFiles) {
    const kept = new Set(reviewableFiles.slice(0, maxFiles));
    files.splice(
      0,
      files.length,
      ...files.filter((file) => file.ignored === true || kept.has(file)),
    );
    truncated = true;
    if (!warnings.includes('files-truncated')) warnings.push('files-truncated');
  }

  const totalsTruncated = truncated || budget.exhausted;
  const totals = files.reduce(
    (accumulator, file) => ({
      files: accumulator.files + 1,
      added: accumulator.added + file.added,
      deleted: accumulator.deleted + file.deleted,
      truncated: totalsTruncated,
    }),
    { files: 0, added: 0, deleted: 0, truncated: totalsTruncated },
  );

  return {
    schemaVersion: 1,
    scope,
    files,
    totals,
    warnings,
  };
}
