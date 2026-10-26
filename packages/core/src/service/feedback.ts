import type { Snapshot } from '../types.js';
import type { AgentReport } from '../reviewer/types.js';
import type { Comment, ReviewState, RoundNo } from '../review/types.js';
import type {
  FeedbackComment,
  FeedbackFinding,
  FeedbackJson,
  FeedbackPackage,
  FeedbackSuggestion,
  SubmitInput,
} from './types.js';

export const FEEDBACK_BYTE_LIMIT = 100 * 1024;

export interface BuildFeedbackInput {
  review: ReviewState;
  snapshot: Snapshot;
  report: AgentReport | null;
  round: RoundNo;
  verdict: SubmitInput['verdict'];
  deliveryKey: string;
  summary?: string;
  includeResolved?: boolean;
}

function latestAnchor(
  comment: Comment,
): { path: string; lineStart: number; lineEnd: number } | null {
  const anchor = comment.anchors.at(-1);
  if (anchor === undefined) return null;
  return { path: anchor.path, lineStart: anchor.lineStart, lineEnd: anchor.lineEnd };
}

function isApplied(comment: Comment): boolean {
  return comment.outcomes.some((outcome) => outcome.status === 'applied');
}

function suggestionOf(comment: Comment): FeedbackSuggestion | null {
  const anchor = latestAnchor(comment);
  if (anchor === null || comment.suggestion === undefined) return null;
  return {
    commentId: comment.id,
    path: anchor.path,
    lineStart: anchor.lineStart,
    lineEnd: anchor.lineEnd,
    original: comment.suggestion.original,
    replacement: comment.suggestion.replacement,
  };
}

function humanComment(
  comment: Comment,
  anchor: { path: string; lineStart: number; lineEnd: number },
): FeedbackComment {
  const item: FeedbackComment = {
    commentId: comment.id,
    path: anchor.path,
    lineStart: anchor.lineStart,
    lineEnd: anchor.lineEnd,
    body: comment.body,
  };
  if (comment.suggestion !== undefined) item.suggestion = comment.suggestion;
  return item;
}

function findingItem(finding: AgentReport['findings'][number]): FeedbackFinding {
  return {
    id: finding.id,
    severity: finding.severity,
    file: finding.file,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    title: finding.title,
    rationale: finding.rationale,
    evidence: finding.evidence,
  };
}

function verdictLabel(verdict: SubmitInput['verdict']): string {
  if (verdict === 'approve') return 'approved';
  if (verdict === 'request-changes') return 'changes requested';
  return 'comment';
}

function section(lines: string[], title: string, body: string[]): void {
  if (body.length === 0) return;
  lines.push(`### ${title}`, ...body, '');
}

export function jsonBytes(value: FeedbackJson): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function capFeedbackJson(input: FeedbackJson): FeedbackJson {
  if (jsonBytes(input) <= FEEDBACK_BYTE_LIMIT) return input;
  const json = structuredClone(input);
  json.truncated = true;
  json.notice = `feedback json truncated at ${FEEDBACK_BYTE_LIMIT} bytes`;

  for (const comment of json.humanComments) {
    if (jsonBytes(json) <= FEEDBACK_BYTE_LIMIT) break;
    if (comment.body.length > 16 * 1024) {
      const excess = jsonBytes(json) - FEEDBACK_BYTE_LIMIT;
      comment.body = truncateUtf8(
        comment.body,
        Math.max(0, Buffer.byteLength(comment.body, 'utf8') - excess - 1024),
      );
    }
  }
  const arrays: Array<
    keyof Pick<
      FeedbackJson,
      | 'findings'
      | 'questions'
      | 'acceptedSuggestions'
      | 'appliedSuggestions'
      | 'verification'
      | 'humanComments'
    >
  > = [
    'findings',
    'questions',
    'acceptedSuggestions',
    'appliedSuggestions',
    'verification',
    'humanComments',
  ];
  for (const key of arrays) {
    while (jsonBytes(json) > FEEDBACK_BYTE_LIMIT && json[key].length > 0) json[key].pop();
  }
  if (jsonBytes(json) > FEEDBACK_BYTE_LIMIT) json.summary = truncateUtf8(json.summary ?? '', 1024);
  if (jsonBytes(json) > FEEDBACK_BYTE_LIMIT) json.notice = 'feedback json truncated';
  if (jsonBytes(json) > FEEDBACK_BYTE_LIMIT) {
    json.title = truncateUtf8(json.title, 1024);
    json.scope = { ...json.scope, label: truncateUtf8(json.scope.label, 1024) };
  }
  if (jsonBytes(json) > FEEDBACK_BYTE_LIMIT) {
    json.findings = [];
    json.questions = [];
    json.acceptedSuggestions = [];
    json.appliedSuggestions = [];
    json.verification = [];
    json.humanComments = [];
  }
  return json;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] ?? 0) >= 0x80 && (bytes[end] ?? 0) < 0xc0) end -= 1;
  return bytes.subarray(0, end).toString('utf8');
}

/** Deterministic feedback package for one submission. */
export function buildFeedback(input: BuildFeedbackInput): FeedbackPackage {
  const { review, snapshot, report, round, verdict, deliveryKey } = input;
  const openComments = review.comments.filter(
    (comment) => comment.author.kind === 'human' && comment.state === 'open',
  );
  const resolved = review.comments.filter((comment) => comment.state === 'resolved');

  const findings = (report?.findings ?? []).filter(
    (finding) =>
      (finding.severity === 'blocker' || finding.severity === 'major') && finding.kind !== 'praise',
  );
  const humanComments: FeedbackComment[] = [];
  const accepted: FeedbackSuggestion[] = [];
  const applied: FeedbackSuggestion[] = [];
  for (const comment of openComments) {
    const anchor = latestAnchor(comment);
    if (anchor === null) continue;
    humanComments.push(humanComment(comment, anchor));
    const suggestion = suggestionOf(comment);
    if (suggestion !== null) {
      if (isApplied(comment)) applied.push(suggestion);
      else accepted.push(suggestion);
    }
  }
  for (const comment of review.comments) {
    if (comment.author.kind === 'human' && isApplied(comment)) {
      const suggestion = suggestionOf(comment);
      if (suggestion !== null && !applied.some((item) => item.commentId === suggestion.commentId)) {
        applied.push(suggestion);
      }
    }
  }

  const json: FeedbackJson = {
    schemaVersion: 1,
    reviewId: review.id,
    round,
    verdict,
    title: review.title,
    scope: {
      baseSha: snapshot.scope.baseSha,
      headSha: snapshot.scope.headSha,
      label: snapshot.scope.label,
    },
    deliveryKey,
    findings: findings.map(findingItem),
    humanComments,
    appliedSuggestions: applied,
    acceptedSuggestions: accepted,
    questions: report?.questions ?? [],
    verification: report?.verification ?? [],
    resolved: {
      count: resolved.length,
      commentIds: resolved.map((comment) => comment.id),
    },
  };
  if (input.summary !== undefined) json.summary = input.summary;

  const lines: string[] = [
    `## Ревью «${review.title}» — ${verdictLabel(verdict)} (round ${round})`,
    `Review: /review/${review.id}?round=${round}`,
    `Scope: ${snapshot.scope.label} (${snapshot.scope.baseSha}..${snapshot.scope.headSha ?? 'worktree'})`,
    '',
  ];
  if (json.summary !== undefined) lines.push(json.summary, '');

  section(
    lines,
    'Блокеры и major (агент)',
    findings.flatMap((finding) => [
      `- [${finding.severity}][${finding.file}:${finding.lineStart}] ${finding.title}`,
      `  ${finding.rationale}`,
      `  > ${finding.evidence.replace(/\n/g, '\n  > ')}`,
    ]),
  );

  section(
    lines,
    'Комментарии человека (open)',
    humanComments.map((comment) => `- [${comment.path}:${comment.lineStart}] ${comment.body}`),
  );

  section(lines, 'Принятые suggested правки', [
    ...applied.map(
      (suggestion) =>
        `- [${suggestion.path}:${suggestion.lineStart}] применено человеком (не применять повторно)`,
    ),
    ...accepted.flatMap((suggestion) => [
      `- [${suggestion.path}:${suggestion.lineStart}] принято, но не применено (патч ниже)`,
      '```diff',
      ...suggestion.original.split('\n').map((line) => `- ${line}`),
      ...suggestion.replacement.split('\n').map((line) => `+ ${line}`),
      '```',
    ]),
  ]);

  section(
    lines,
    'Вопросы к тебе',
    (report?.questions ?? []).map(
      (question) => `- [${question.id}] ${question.question} — ${question.why}`,
    ),
  );

  if (resolved.length > 0 || input.includeResolved === true) {
    section(
      lines,
      'Уже исправлено в этом раунде',
      resolved.map((comment) => `- [${comment.id}] resolved`),
    );
  }

  lines.push(
    '### Инструкция',
    'Правь только перечисленное, не переписывай несвязанный код, прогони тесты,',
    'затем вызови review_refresh(reviewId) и review_fix_status(...) с evidence.',
    'Если сообщение повторное — не применяй правки дважды.',
  );

  let markdown = lines.join('\n');
  if (Buffer.byteLength(markdown, 'utf8') > FEEDBACK_BYTE_LIMIT) {
    const notice = `\n\n… (feedback truncated at ${FEEDBACK_BYTE_LIMIT} bytes; see [review](/review/${review.id}?round=${round}))`;
    const room = FEEDBACK_BYTE_LIMIT - Buffer.byteLength(notice, 'utf8');
    markdown = `${truncateUtf8(markdown, room)}${notice}`;
  }

  return { markdown, json: capFeedbackJson(json), deliveryKey };
}
