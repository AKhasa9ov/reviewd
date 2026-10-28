import { lstat } from 'node:fs/promises';
import type {
  DiffHunk,
  FileDiff,
  FileStatus,
  ManifestFile,
  ManifestFileReason,
  ParsedFile,
  Snapshot,
  SnapshotOptions,
} from '../types.js';
import { hasSymlinkParent, safeJoin, splitNulPaths } from '../paths.js';
import { readBlob } from '../git/content.js';
import { resolveScope } from '../git/scope.js';
import { runGit } from '../git/run.js';
import type { GitResult } from '../git/run.js';
import { manifestFileFromDiff, reviewManifest } from './manifest.js';
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

/**
 * The changed-path listing is metadata only; this byte cap is a safety valve
 * for pathological repositories. Hitting it is surfaced as a snapshot warning,
 * never as a silent omission.
 */
const MAX_MANIFEST_LISTING_BYTES = 64 * 1024 * 1024;

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

type DiffFormat = 'patch' | 'raw' | 'numstat';

function diffArgs(scope: Snapshot['scope'], format: DiffFormat = 'patch'): string[] {
  const common = ['diff', '--no-color', '--no-ext-diff', '--no-textconv'];
  if (format === 'raw') common.push('--raw', '-z');
  else if (format === 'numstat') common.push('--numstat', '-z');
  else common.push('--unified=3');
  common.push('--find-renames=50%', '--src-prefix=a/', '--dst-prefix=b/');
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

function candidateKey(entry: ParsedFile): string {
  return `${entry.path}\0${entry.oldPath ?? ''}`;
}

function rawStatus(letter: string, oldMode: string, newMode: string): ParsedFile['status'] {
  if (letter === 'R') return 'renamed';
  if (oldMode === '160000' || newMode === '160000') return 'submodule';
  if (letter === 'A') return 'added';
  if (letter === 'D') return 'deleted';
  return 'modified';
}

function parseRawDiff(raw: string): ParsedFile[] {
  const tokens = raw.split('\0');
  const entries: ParsedFile[] = [];
  for (let index = 0; index < tokens.length;) {
    const header = tokens[index++];
    if (header === undefined || !header.startsWith(':')) continue;
    const fields = header.slice(1).split(' ');
    const oldMode = fields[0] ?? '';
    const newMode = fields[1] ?? '';
    const letter = (fields[4] ?? 'M').charAt(0);
    let oldPath: string | undefined;
    let path = tokens[index++] ?? '';
    if (letter === 'R' || letter === 'C') {
      oldPath = path;
      path = tokens[index++] ?? '';
    }
    if (path === '') continue;
    const entry: ParsedFile = {
      path,
      status: rawStatus(letter, oldMode, newMode),
      binary: false,
      hunks: [],
      added: 0,
      deleted: 0,
    };
    if (oldPath !== undefined) entry.oldPath = oldPath;
    entries.push(entry);
  }
  return entries;
}

interface RawListing {
  entries: ParsedFile[];
  truncated: boolean;
}

async function listRawChanges(scope: Snapshot['scope'], signal?: AbortSignal): Promise<RawListing> {
  const result = await runGit(scope.repoRoot, diffArgs(scope, 'raw'), {
    signal,
    maxBytes: MAX_MANIFEST_LISTING_BYTES,
    truncateOnOverflow: true,
  });
  return { entries: parseRawDiff(result.stdout), truncated: result.truncated === true };
}

interface NumstatEntry {
  added: number;
  deleted: number;
  binary: boolean;
}

interface NumstatListing {
  entries: Map<string, NumstatEntry>;
  truncated: boolean;
}

/**
 * Parses `git diff --numstat -z`. A rename record is
 * `added\tdeleted\t\0oldPath\0newPath\0`, so the empty path field is followed
 * by two NUL-delimited path tokens; the result is keyed by the new path.
 */
function parseNumstat(raw: string): Map<string, NumstatEntry> {
  const entries = new Map<string, NumstatEntry>();
  const tokens = raw.split('\0');
  if (!raw.endsWith('\0')) tokens.pop();

  for (let index = 0; index < tokens.length;) {
    const record = tokens[index++];
    if (record === undefined || record === '') continue;
    const fields = record.split('\t');
    if (fields.length < 3) continue;
    const addedField = fields[0] ?? '';
    const deletedField = fields[1] ?? '';
    let path = fields.slice(2).join('\t');
    if (path === '') {
      index += 1; // old path; only the new path keys the manifest
      path = tokens[index++] ?? '';
      if (path === '') continue;
    }
    const binary = addedField === '-' || deletedField === '-';
    const added = binary ? 0 : Number.parseInt(addedField, 10);
    const deleted = binary ? 0 : Number.parseInt(deletedField, 10);
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) continue;
    entries.set(path, { added, deleted, binary });
  }
  return entries;
}

async function listNumstatChanges(
  scope: Snapshot['scope'],
  signal?: AbortSignal,
): Promise<NumstatListing> {
  const result = await runGit(scope.repoRoot, diffArgs(scope, 'numstat'), {
    signal,
    maxBytes: MAX_MANIFEST_LISTING_BYTES,
    truncateOnOverflow: true,
  });
  return { entries: parseNumstat(result.stdout), truncated: result.truncated === true };
}

interface ManifestSeed {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  added: number;
  deleted: number;
  ignored: boolean;
  oversized: boolean;
  /** True when `added`/`deleted` came from the exact numstat listing. */
  fromNumstat: boolean;
  reason?: ManifestFileReason;
}

function rawSeeds(
  raw: readonly ParsedFile[],
  numstat: Map<string, NumstatEntry>,
  ignore: readonly string[],
): Map<string, ManifestSeed> {
  const seeds = new Map<string, ManifestSeed>();
  for (const entry of raw) {
    const counts = numstat.get(entry.path);
    const seed: ManifestSeed = {
      path: entry.path,
      status: entry.status,
      binary: counts?.binary === true,
      added: counts?.added ?? entry.added,
      deleted: counts?.deleted ?? entry.deleted,
      ignored: isIgnored(entry.path, ignore),
      oversized: false,
      fromNumstat: counts !== undefined,
    };
    if (entry.oldPath !== undefined) seed.oldPath = entry.oldPath;
    seeds.set(entry.path, seed);
  }
  return seeds;
}

/**
 * Builds one complete-manifest entry from the full listing seed and, when the
 * path is inside the render subset, the bounded render data. Manifest-only
 * entries never trigger content reads; their patch fields stay at zero.
 *
 * Exported from the module (not the package index) so the reason precedence
 * for manifest-only paths can be pinned without a synthetic git fixture.
 */
export function manifestEntry(input: {
  seed: ManifestSeed;
  file?: FileDiff;
  renderExcluded: boolean;
}): ManifestFile {
  const mapped = input.file === undefined ? undefined : manifestFileFromDiff(input.file);
  const ignored = input.seed.ignored || mapped?.ignored === true;
  const oversized = input.seed.oversized || mapped?.oversized === true;
  const binary = input.seed.binary || mapped?.binary === true;
  let reason = mapped?.reason ?? input.seed.reason;
  // A binary path has no textual patch regardless of the cap; report the more
  // specific reason. Ignored/unreadable/explicit policy reasons still win.
  if (reason === 'diff-truncated' && binary && !ignored) reason = 'binary';
  if (reason === undefined) {
    if (ignored) reason = 'ignored';
    else if (binary) reason = 'binary';
    else if (oversized) reason = 'per-file-cap';
    else if (input.renderExcluded) reason = 'render-budget';
  }
  const entry: ManifestFile = {
    path: input.seed.path,
    status: mapped?.status ?? input.seed.status,
    binary,
    ignored,
    oversized,
    added: input.seed.fromNumstat ? input.seed.added : (mapped?.added ?? input.seed.added),
    deleted: input.seed.fromNumstat ? input.seed.deleted : (mapped?.deleted ?? input.seed.deleted),
    hunkCount: mapped?.hunkCount ?? 0,
    patchBytes: mapped?.patchBytes ?? 0,
  };
  const oldPath = mapped?.oldPath ?? input.seed.oldPath;
  if (oldPath !== undefined) entry.oldPath = oldPath;
  if (reason !== undefined) entry.reason = reason;
  return entry;
}

interface UntrackedListing {
  paths: string[];
  truncated: boolean;
}

async function listUntracked(repoRoot: string, signal?: AbortSignal): Promise<UntrackedListing> {
  const result = await runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'], {
    signal,
    maxBytes: 8 * 1024 * 1024,
    truncateOnOverflow: true,
  });
  return {
    paths: splitNulPaths(result.stdout),
    truncated: result.truncated === true,
  };
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

  // The complete changed-path listing is independent of the render budget.
  // It is metadata only, so it stays cheap even when patch bytes are capped.
  const rawListing = await listRawChanges(scope, options.signal);
  const numstatListing = await listNumstatChanges(scope, options.signal);
  const listingTruncated = rawListing.truncated || numstatListing.truncated;
  if (listingTruncated) warnings.push('manifest-listing-truncated');
  const seeds = rawSeeds(rawListing.entries, numstatListing.entries, ignore);

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

  let truncated = listingTruncated || diffTruncated || limited.truncated;
  if (truncated) {
    const seen = new Set(candidates.map((entry) => candidateKey(entry)));
    const byKey = new Map(candidates.map((entry) => [candidateKey(entry), entry]));
    for (const listed of rawListing.entries) {
      const key = candidateKey(listed);
      const warning = `diff-file-skipped:${listed.path}`;
      if (seen.has(key)) {
        const existing = byKey.get(key);
        // Every synthetic entry is a file cut by the global diff cap, whether
        // the cut lands in the first file or after a complete prefix.
        if (existing?.synthetic === true) {
          existing.skipped = true;
          if (!warnings.includes(warning)) warnings.push(warning);
        }
        continue;
      }
      // Only this backfill copy carries the marker; the seed above stays plain
      // listing metadata so it is not mistaken for a diff-cap omission.
      const entry: ParsedFile = { ...listed, backfill: true };
      seen.add(key);
      byKey.set(key, entry);
      candidates.push(entry);
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    candidates.sort((left, right) => comparePaths(left.path, right.path));
  }

  let renderCapped = false;
  let selected = candidates;
  const reviewableCandidates = candidates.filter((entry) => !isIgnored(entry.path, ignore));
  if (reviewableCandidates.length > maxFiles) {
    const kept = new Set(reviewableCandidates.slice(0, maxFiles));
    selected = candidates.filter((entry) => isIgnored(entry.path, ignore) || kept.has(entry));
    truncated = true;
    renderCapped = true;
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
    if (entry.backfill === true) {
      const seed = seeds.get(entry.path);
      const skipped: FileDiff = {
        path: entry.path,
        status: entry.status,
        binary: seed?.binary === true,
        oversized: false,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
        truncated: true,
        reason: 'diff-truncated',
      };
      if (entry.oldPath !== undefined) skipped.oldPath = entry.oldPath;
      if (isIgnored(entry.path, ignore)) skipped.ignored = true;
      files.push(skipped);
      continue;
    }
    if (entry.synthetic === true) {
      const seed = seeds.get(entry.path);
      const synthetic: FileDiff = {
        path: entry.path,
        status: entry.status,
        binary: entry.binary || seed?.binary === true,
        // Nothing measured this file's size; the global diff cap cut it.
        oversized: false,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
        truncated: true,
        reason: 'diff-truncated',
      };
      if (entry.oldPath !== undefined) synthetic.oldPath = entry.oldPath;
      if (isIgnored(entry.path, ignore)) synthetic.ignored = true;
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
    const listing = await listUntracked(scope.repoRoot, options.signal);
    if (listing.truncated) {
      if (!warnings.includes('untracked-list-truncated')) {
        warnings.push('untracked-list-truncated');
      }
      truncated = true;
    }
    for (const path of listing.paths) {
      const ignored = isIgnored(path, ignore);
      const seed: ManifestSeed = {
        path,
        status: 'untracked',
        binary: false,
        added: 0,
        deleted: 0,
        ignored,
        oversized: false,
        fromNumstat: false,
      };
      seeds.set(path, seed);
      const absolute = safeJoin(scope.repoRoot, path);
      const info = await lstat(absolute).catch(() => null);
      if (info?.isSymbolicLink() === true || (await hasSymlinkParent(scope.repoRoot, path))) {
        seed.reason = 'unreadable';
        warnings.push(`symlink-not-followed:${path}`);
        continue;
      }
      const file = await untrackedFile(
        scope.repoRoot,
        path,
        maxFileLines,
        maxContentBytes,
        includeContent,
        ignored,
        budget,
        warnings,
      );
      if (file !== null) files.push(file);
    }
  }

  files.sort((left, right) => comparePaths(left.path, right.path));

  // Everything built before the render cap is retained for manifest metadata;
  // culling below only bounds what the snapshot renders.
  const retainedFiles = files.slice();
  const reviewableFiles = files.filter((file) => file.ignored !== true);
  if (reviewableFiles.length > maxFiles) {
    const kept = new Set(reviewableFiles.slice(0, maxFiles));
    files.splice(
      0,
      files.length,
      ...files.filter((file) => file.ignored === true || kept.has(file)),
    );
    truncated = true;
    renderCapped = true;
    if (!warnings.includes('files-truncated')) warnings.push('files-truncated');
  }

  const retainedByPath = new Map(retainedFiles.map((file) => [file.path, file]));
  for (const file of retainedFiles) {
    if (seeds.has(file.path)) continue;
    const seed: ManifestSeed = {
      path: file.path,
      status: file.status,
      binary: file.binary,
      added: file.added,
      deleted: file.deleted,
      ignored: file.ignored === true,
      oversized: file.oversized,
      fromNumstat: false,
    };
    if (file.oldPath !== undefined) seed.oldPath = file.oldPath;
    if (file.reason !== undefined) seed.reason = file.reason;
    seeds.set(file.path, seed);
  }

  const renderPaths = new Set(files.map((file) => file.path));
  const manifest = reviewManifest(
    scope,
    [...seeds.values()]
      .map((seed) => {
        const file = retainedByPath.get(seed.path);
        return manifestEntry({
          seed,
          ...(file === undefined ? {} : { file }),
          renderExcluded: !renderPaths.has(seed.path),
        });
      })
      .sort((left, right) => comparePaths(left.path, right.path)),
    warnings,
  );

  const manifestTruncated =
    truncated ||
    budget.exhausted ||
    renderCapped ||
    manifest.files.some(
      (file) =>
        file.reason === 'render-budget' ||
        file.reason === 'diff-truncated' ||
        file.reason === 'per-file-cap',
    );

  const totals = {
    files: manifest.totals.files,
    added: manifest.totals.added,
    deleted: manifest.totals.deleted,
    truncated: manifestTruncated,
  };

  return {
    schemaVersion: 2,
    scope,
    files,
    manifest,
    totals,
    warnings,
  };
}
