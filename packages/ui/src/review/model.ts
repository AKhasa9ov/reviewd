import { mergeShardReports } from '@sir_yami/reviewd-core/browser';
import type {
  Anchor,
  ActorKind,
  AgentReport,
  AgentState,
  Comment,
  DiffHunk,
  DiffLine,
  FileDiff,
  Finding,
  FixClaimRecord,
  ReviewState,
  Side,
  Snapshot,
} from '@sir_yami/reviewd-core';

export interface LiveReport {
  report: AgentReport;
  completedShards: number;
  totalShards: number;
}

/**
 * Builds a provisional report from shards that have already reported. It is
 * intentionally separate from the final aggregate: missing shards are not
 * failures while the round is still running, and no decisions may be taken
 * against this preview.
 */
export function liveReportFor(
  agent: AgentState | undefined,
  reviewId: string,
  round: number | null,
): LiveReport | null {
  if (agent === undefined || round === null) return null;
  const shards = (agent.shards ?? [])
    .filter((shard) => shard.round === round)
    .sort((left, right) => left.shardIndex - right.shardIndex);
  if (shards.length === 0) return null;
  const totalShards = Math.max(...shards.map((shard) => shard.shardCount), shards.length);
  const merged = mergeShardReports({
    reviewId,
    round,
    backend: 'worker',
    reports: shards.map((shard) => ({ shardId: shard.shardId, report: shard.report })),
  });
  return {
    report: {
      ...merged,
      summary: 'Provisional findings from completed shards.',
    },
    completedShards: shards.length,
    totalShards,
  };
}

export type ReviewTab = 'conversation' | 'files' | 'report' | 'signals';
export type FixGroup = 'addressed' | 'not-fixed' | 'outdated' | 'needs-decision';
export type FixFilter = 'all' | FixGroup;

export const FIX_GROUPS: readonly {
  id: FixGroup;
  label: string;
  description: string;
}[] = [
  { id: 'addressed', label: 'Addressed', description: 'Reviewer or agent confirms a fix.' },
  { id: 'not-fixed', label: 'Not fixed', description: 'Still present in the latest round.' },
  { id: 'outdated', label: 'Outdated', description: 'The quoted code no longer exists.' },
  {
    id: 'needs-decision',
    label: 'Needs decision',
    description: 'Open, ambiguous or unchanged without a verdict.',
  },
];

export interface DiffRow {
  key: string;
  type: 'hunk' | 'line';
  hunk?: DiffHunk;
  line?: DiffLine;
  hunkIndex: number;
  lineIndex: number;
}

/**
 * The round snapshot is intentionally bounded for rendering. The manifest is
 * complete, so use it to keep every changed path visible and let the caller
 * lazily fetch omitted diffs.
 */
export function filesForSnapshot(snapshot: Snapshot): FileDiff[] {
  const present = new Map(snapshot.files.map((item) => [item.path, item]));
  const manifest = snapshot.manifest?.files;
  if (manifest === undefined) return snapshot.files;
  const files: FileDiff[] = [];
  for (const entry of manifest) {
    const existing = present.get(entry.path);
    if (existing !== undefined) {
      files.push(existing);
      continue;
    }
    files.push({
      path: entry.path,
      ...(entry.oldPath === undefined ? {} : { oldPath: entry.oldPath }),
      status: entry.status,
      binary: entry.binary,
      oversized: entry.oversized,
      ...(entry.ignored ? { ignored: true } : {}),
      ...(entry.conflicted === true ? { conflicted: true } : {}),
      truncated: true,
      reason: entry.reason === 'unreadable' ? 'unreadable' : 'diff-truncated',
      added: entry.added,
      deleted: entry.deleted,
      hunks: [],
      contentHash: null,
    });
  }
  return files;
}

export function buildDiffRows(file: FileDiff): DiffRow[] {
  const rows: DiffRow[] = [];
  file.hunks.forEach((hunk, hunkIndex) => {
    rows.push({ key: `${file.path}:h:${hunkIndex}`, type: 'hunk', hunk, hunkIndex, lineIndex: -1 });
    hunk.lines.forEach((line, lineIndex) => {
      rows.push({
        key: `${file.path}:l:${hunkIndex}:${lineIndex}`,
        type: 'line',
        hunk,
        line,
        hunkIndex,
        lineIndex,
      });
    });
  });
  return rows;
}

export function firstChangedLine(file: FileDiff): { line: number; side: Side } | null {
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'add' && line.newNo !== null) return { line: line.newNo, side: 'new' };
      if (line.kind === 'del' && line.oldNo !== null) return { line: line.oldNo, side: 'old' };
    }
  }
  const first = file.hunks[0]?.lines[0];
  if (first !== undefined) {
    if (first.newNo !== null) return { line: first.newNo, side: 'new' };
    if (first.oldNo !== null) return { line: first.oldNo, side: 'old' };
  }
  return null;
}

export function linesForSide(file: FileDiff, side: Side): string[] | undefined {
  return side === 'new' ? file.newLines : file.oldLines;
}

export function fileLineCount(file: FileDiff, side: Side): number {
  const lines = linesForSide(file, side);
  if (lines !== undefined) return lines.length;
  let max = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const no = side === 'new' ? line.newNo : line.oldNo;
      if (no !== null && no > max) max = no;
    }
  }
  return max;
}

export function selectedLines(
  file: FileDiff,
  side: Side,
  lineStart: number,
  lineEnd: number,
): string[] {
  const lines = linesForSide(file, side);
  if (lines === undefined) return [];
  return lines.slice(Math.max(0, lineStart - 1), Math.max(0, lineEnd));
}

export interface AnchorHistory {
  from: Anchor | undefined;
  to: Anchor | undefined;
  lineChanged: boolean;
  pathChanged: boolean;
  label: string;
}

export function latestAnchor(comment: Comment): Anchor | undefined {
  return [...comment.anchors].sort((a, b) => a.round - b.round).at(-1);
}

export function anchorForRound(comment: Comment, round: number): Anchor | undefined {
  const same = comment.anchors.find((anchor) => anchor.round === round);
  if (same !== undefined) return same;
  return [...comment.anchors]
    .filter((anchor) => anchor.round <= round)
    .sort((a, b) => a.round - b.round)
    .at(-1);
}

export function anchorHistory(comment: Comment): AnchorHistory {
  const sorted = [...comment.anchors].sort((a, b) => a.round - b.round);
  const from = sorted[0];
  const to = sorted.at(-1);
  const lineChanged = from !== undefined && to !== undefined && from.lineStart !== to.lineStart;
  const pathChanged = from !== undefined && to !== undefined && from.path !== to.path;
  let label = to === undefined ? 'No anchor' : `line ${to.lineStart}`;
  if (lineChanged) label = `line ${from.lineStart} → ${to.lineStart}`;
  if (to !== undefined && to.lineStart !== to.lineEnd) {
    label = `${to.lineStart}–${to.lineEnd}`;
    if (lineChanged) label = `${from.lineStart} → ${label}`;
  }
  return { from, to, lineChanged, pathChanged, label };
}

function latestClaim(review: ReviewState, commentId: string): FixClaimRecord | undefined {
  return review.fixClaims
    ?.filter((claim) => claim.commentId === commentId)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1);
}

function latestVerification(report: AgentReport | undefined, commentId: string) {
  return report?.verification?.filter((item) => item.commentId === commentId).at(-1);
}

export function fixStatus(review: ReviewState, comment: Comment): FixGroup {
  if (comment.state === 'resolved') return 'addressed';
  if (comment.state === 'dismissed') return 'needs-decision';

  const anchor = latestAnchor(comment);
  if (anchor?.state === 'outdated') return 'outdated';

  const claim = latestClaim(review, comment.id);
  const verification = latestVerification(review.report, comment.id);
  const fixed =
    claim?.status === 'fixed' ||
    verification?.status === 'fixed' ||
    comment.outcomes.some(
      (outcome) => outcome.status === 'applied' || outcome.status === 'addressed',
    );
  const notFixed = claim?.status === 'not-fixed' || verification?.status === 'not-fixed';
  if (fixed && notFixed) return 'needs-decision';
  if (fixed) return 'addressed';
  if (notFixed) return 'not-fixed';
  if (anchor?.state === 'ambiguous') return 'needs-decision';
  const latestOutcome = [...comment.outcomes].sort((a, b) => a.round - b.round).at(-1);
  if (latestOutcome?.status === 'unchanged' || latestOutcome?.status === 'moved') {
    return 'needs-decision';
  }
  return 'needs-decision';
}

export function actorSource(kind: ActorKind): {
  label: 'AI' | 'Human' | 'System';
  tone: 'info' | 'neutral' | 'warning';
} {
  if (kind === 'agent') return { label: 'AI', tone: 'info' };
  if (kind === 'system') return { label: 'System', tone: 'warning' };
  return { label: 'Human', tone: 'neutral' };
}

export function isTransferredComment(comment: Comment): boolean {
  return comment.sourceFindingId !== undefined;
}

export function fixCounts(review: ReviewState): Record<FixGroup, number> {
  const counts: Record<FixGroup, number> = {
    addressed: 0,
    'not-fixed': 0,
    outdated: 0,
    'needs-decision': 0,
  };
  for (const comment of review.comments) {
    if (comment.deletedAt !== undefined) continue;
    counts[fixStatus(review, comment)] += 1;
  }
  return counts;
}

export function filterComments(review: ReviewState, filter: FixFilter): Comment[] {
  if (filter === 'all') {
    return review.comments.filter(
      (comment) => comment.deletedAt === undefined || comment.replies.length > 0,
    );
  }
  return review.comments.filter(
    (comment) => comment.deletedAt === undefined && fixStatus(review, comment) === filter,
  );
}

export function roundCommentCount(review: ReviewState, round: number): number {
  return review.comments.filter(
    (comment) =>
      comment.deletedAt === undefined && comment.anchors.some((anchor) => anchor.round === round),
  ).length;
}

export function unresolvedComments(review: ReviewState): Comment[] {
  return review.comments.filter(
    (comment) => comment.deletedAt === undefined && comment.state === 'open',
  );
}

export function latestVerdict(review: ReviewState): string {
  const submission = [...(review.submissions ?? [])].sort((a, b) => a.round - b.round).at(-1);
  if (submission !== undefined) return submission.verdict;
  if (review.closeVerdict !== undefined) return review.closeVerdict;
  return review.status === 'closed' ? 'closed' : 'open';
}

export function deltaPaths(current: Snapshot, previous: Snapshot | null): Set<string> {
  if (previous === null) return new Set(current.files.map((file) => file.path));
  const previousByPath = new Map(previous.files.map((file) => [file.path, file]));
  const changed = new Set<string>();
  for (const file of current.files) {
    const before = previousByPath.get(file.path) ?? previousByPath.get(file.oldPath ?? '');
    if (before === undefined) {
      changed.add(file.path);
      continue;
    }
    if (
      before.contentHash !== file.contentHash ||
      before.status !== file.status ||
      before.added !== file.added ||
      before.deleted !== file.deleted ||
      before.path !== file.path ||
      before.truncated !== file.truncated
    ) {
      changed.add(file.path);
    }
  }
  return changed;
}

export interface ReviewLocationState {
  round?: number;
  file?: string;
  line?: number;
}

export function parseReviewLocation(location: string): ReviewLocationState {
  const url = new URL(location, 'http://local');
  const roundRaw = url.searchParams.get('round');
  const round = roundRaw === null ? undefined : Number(roundRaw);
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const file = hash.get('file') ?? undefined;
  const lineRaw = hash.get('line');
  const line = lineRaw === null ? undefined : Number(lineRaw);
  return {
    ...(round !== undefined && Number.isInteger(round) && round > 0 ? { round } : {}),
    ...(file !== undefined && file !== '' ? { file } : {}),
    ...(line !== undefined && Number.isInteger(line) && line > 0 ? { line } : {}),
  };
}

export function buildReviewLocation(
  id: string,
  state: ReviewLocationState,
  extra: { tab?: ReviewTab } = {},
): string {
  const params = new URLSearchParams();
  if (state.round !== undefined) params.set('round', String(state.round));
  if (extra.tab !== undefined && extra.tab !== 'conversation') params.set('tab', extra.tab);
  const query = params.toString();
  const hash = new URLSearchParams();
  if (state.file !== undefined) hash.set('file', state.file);
  if (state.line !== undefined) hash.set('line', String(state.line));
  const fragment = hash.toString();
  return `/review/${encodeURIComponent(id)}${query === '' ? '' : `?${query}`}${fragment === '' ? '' : `#${fragment}`}`;
}

export function parseTab(value: string | null): ReviewTab {
  return value === 'files' || value === 'report' || value === 'signals' ? value : 'conversation';
}

export interface CommentDraft {
  body: string;
  lineStart: number;
  lineEnd: number;
  suggestionEnabled: boolean;
  original: string;
  replacement: string;
}

export interface DraftErrors {
  body?: string;
  range?: string;
  suggestion?: string;
}

export function validateCommentDraft(
  draft: CommentDraft,
  maxLine: number,
): { ok: boolean; errors: DraftErrors } {
  const errors: DraftErrors = {};
  if (draft.body.trim() === '') errors.body = 'Write a comment before posting.';
  if (draft.body.length > 32_000) errors.body = 'Comments are limited to 32,000 characters.';
  if (
    !Number.isInteger(draft.lineStart) ||
    !Number.isInteger(draft.lineEnd) ||
    draft.lineStart < 1 ||
    draft.lineEnd < draft.lineStart ||
    (maxLine > 0 && draft.lineEnd > maxLine)
  ) {
    errors.range =
      maxLine > 0
        ? `Choose a line between 1 and ${maxLine}.`
        : 'Choose a line that exists in this diff.';
  }
  if (draft.suggestionEnabled) {
    if (draft.original.trim() === '') {
      errors.suggestion = 'The original snippet is required for a suggestion.';
    } else if (draft.replacement.trim() === '') {
      errors.suggestion = 'Write the replacement code.';
    } else if (draft.original === draft.replacement) {
      errors.suggestion = 'The replacement is identical to the original.';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export interface ReviewSignal {
  id: string;
  tone: 'info' | 'warning' | 'danger';
  label: string;
  detail: string;
  file?: string;
  line?: number;
}

const TEST_PATH = /(^|\/)(__tests__|tests?|specs?)\/|\.(test|spec)\.[a-z0-9]+$/i;
const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum)$/i;
const MIGRATION = /(^|\/)migrations?\//i;
const SECRET =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(api[_-]?key|secret|password|access[_-]?token)\b\s*[:=]\s*['"]?[A-Za-z0-9_-]{12,})/i;
const TODO = /\b(TODO|FIXME|HACK|XXX)\b/;
const MERGE_MARKER = /^(<{7}|={7}|>{7})/;

function addedLines(file: FileDiff): Array<{ line: number; text: string }> {
  const result: Array<{ line: number; text: string }> = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'add' && line.newNo !== null) {
        result.push({ line: line.newNo, text: line.text });
      }
    }
  }
  return result;
}

export function deriveSignals(snapshot: Snapshot): ReviewSignal[] {
  const signals: ReviewSignal[] = [];
  const seen = new Set<string>();
  function add(signal: ReviewSignal): void {
    if (seen.has(signal.id)) return;
    seen.add(signal.id);
    signals.push(signal);
  }

  for (const file of snapshot.files) {
    if (TEST_PATH.test(file.path)) {
      add({
        id: `tests:${file.path}`,
        tone: 'warning',
        label: 'Test file changed',
        detail: `${file.path} was ${file.status}. Review coverage before merging.`,
        file: file.path,
      });
    }
    if (LOCKFILE.test(file.path)) {
      add({
        id: `lockfile:${file.path}`,
        tone: 'warning',
        label: 'Dependency lockfile changed',
        detail: 'Check that dependency changes are intentional and reproducible.',
        file: file.path,
      });
    }
    if (MIGRATION.test(file.path)) {
      add({
        id: `migration:${file.path}`,
        tone: 'danger',
        label: 'Migration changed',
        detail: 'Destructive or missing migrations can break production data.',
        file: file.path,
      });
    }
    if (file.binary) {
      add({
        id: `binary:${file.path}`,
        tone: 'info',
        label: 'Binary file',
        detail: 'Binary changes cannot be reviewed as text.',
        file: file.path,
      });
    }
    if (file.truncated === true || file.oversized) {
      add({
        id: `truncated:${file.path}`,
        tone: 'warning',
        label: 'Diff truncated',
        detail: 'Part of this file is not visible in the review surface.',
        file: file.path,
      });
    }
    if (file.status === 'renamed' && file.oldPath !== undefined) {
      add({
        id: `renamed:${file.path}`,
        tone: 'info',
        label: 'File renamed',
        detail: `${file.oldPath} → ${file.path}`,
        file: file.path,
      });
    }
    if (file.status === 'submodule') {
      add({
        id: `submodule:${file.path}`,
        tone: 'info',
        label: 'Submodule updated',
        detail: 'The pinned submodule commit changed.',
        file: file.path,
      });
    }
    if (file.added + file.deleted > 500) {
      add({
        id: `large:${file.path}`,
        tone: 'info',
        label: 'Large change',
        detail: `${file.added} additions and ${file.deleted} deletions.`,
        file: file.path,
      });
    }
    for (const line of addedLines(file)) {
      if (TODO.test(line.text)) {
        add({
          id: `todo:${file.path}:${line.line}`,
          tone: 'info',
          label: 'New TODO marker',
          detail: line.text.trim().slice(0, 200),
          file: file.path,
          line: line.line,
        });
      }
      if (MERGE_MARKER.test(line.text)) {
        add({
          id: `merge:${file.path}:${line.line}`,
          tone: 'danger',
          label: 'Merge marker added',
          detail: 'A conflict marker was added to the file.',
          file: file.path,
          line: line.line,
        });
      } else if (SECRET.test(line.text)) {
        add({
          id: `secret:${file.path}:${line.line}`,
          tone: 'danger',
          label: 'Possible secret',
          detail: 'A credential-like value was added. Confirm it is not committed.',
          file: file.path,
          line: line.line,
        });
      }
    }
  }
  return signals;
}

type FindingFilter<T extends string> = T | 'all' | ReadonlySet<T>;

function matchesFilter<T extends string>(value: T, filter: FindingFilter<T>): boolean {
  if (filter === 'all') return true;
  if (typeof filter === 'object') return filter.size === 0 || filter.has(value);
  return value === filter;
}

export function filterFindings(
  findings: readonly Finding[] | undefined,
  severity: FindingFilter<Finding['severity']>,
  category: FindingFilter<Finding['category']>,
): Finding[] {
  return (findings ?? []).filter(
    (finding) =>
      matchesFilter(finding.severity, severity) && matchesFilter(finding.category, category),
  );
}

export function findingCounts(report: AgentReport | null | undefined): Record<string, number> {
  const counts: Record<string, number> = {
    blocker: 0,
    major: 0,
    minor: 0,
    nit: 0,
  };
  for (const finding of report?.findings ?? [])
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  return counts;
}

export function commentLineKey(comment: Comment, round: number): string | null {
  const anchor = anchorForRound(comment, round);
  if (anchor === undefined) return null;
  return `${anchor.path}:${anchor.side}:${anchor.lineStart}`;
}

export function formatScope(scope: Snapshot['scope'] | null | undefined): string {
  if (scope === null || scope === undefined) return 'No rounds yet';
  const base = scope.baseSha.slice(0, 8);
  const head = scope.headSha === null ? 'worktree' : scope.headSha.slice(0, 8);
  return `${base} → ${head}`;
}

export function commentsAtLine(
  comments: readonly Comment[],
  round: number,
  path: string,
  line: number,
  side: Side,
): Comment[] {
  return comments.filter((comment) => {
    const anchor = anchorForRound(comment, round);
    return (
      anchor !== undefined &&
      anchor.path === path &&
      anchor.side === side &&
      anchor.lineStart === line
    );
  });
}

export function diffFileId(path: string): string {
  return `diff-file-${encodeURIComponent(path)}`;
}

export function diffLineId(path: string, side: Side, line: number): string {
  return `diff-line-${encodeURIComponent(path)}-${side}-${line}`;
}
