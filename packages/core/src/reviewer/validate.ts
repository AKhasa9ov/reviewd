import type {
  Finding,
  FindingCategory,
  FindingKind,
  FindingSeverity,
  RejectedReportItem,
  ReviewQuestion,
  ReviewerConfidence,
  RiskLevel,
  TestCommand,
  TestResult,
  TestSummary,
  ValidationResult,
  Verification,
  VerificationStatus,
} from './types.js';
import type { FileDiff, Snapshot } from '../types.js';

export const MAX_QUESTIONS = 50;
export const MAX_TEXT_BYTES = 32 * 1024;

const CATEGORIES = new Set<FindingCategory>([
  'security',
  'correctness',
  'tests',
  'performance',
  'maintainability',
  'api',
  'concurrency',
  'docs',
  'other',
]);
const CONFIDENCES = new Set<ReviewerConfidence>(['high', 'medium', 'low']);
const KINDS = new Set<FindingKind>(['issue', 'question', 'praise']);
const RISKS = new Set<RiskLevel>(['low', 'medium', 'high', 'critical']);
const TEST_RESULTS = new Set<TestResult>(['pass', 'fail', 'unknown']);
const VERIFICATION_STATUSES = new Set<VerificationStatus>(['fixed', 'not-fixed', 'unclear']);

const REPORT_FIELDS = new Set([
  'schemaVersion',
  'summary',
  'riskLevel',
  'findings',
  'questions',
  'tests',
  'verification',
]);
const FINDING_FIELDS = new Set([
  'id',
  'severity',
  'category',
  'confidence',
  'kind',
  'file',
  'lineStart',
  'lineEnd',
  'title',
  'rationale',
  'evidence',
  'suggestion',
]);
const QUESTION_FIELDS = new Set(['id', 'file', 'line', 'question', 'why']);

/** LLM reviewers often use a low/medium/high scale; normalize it to our four levels. */
const SEVERITY_ALIASES: Record<string, FindingSeverity> = {
  blocker: 'blocker',
  critical: 'blocker',
  high: 'blocker',
  major: 'major',
  medium: 'major',
  minor: 'minor',
  low: 'minor',
  nit: 'nit',
  info: 'nit',
};

/**
 * Stable id for a finding that omitted one. The incremental `/findings` route
 * validates items one at a time with index 0, so an index-based id would make
 * every item collide; derive it from the content instead.
 */
function autoFindingId(value: Record<string, unknown>): string {
  const basis = [value.file, value.lineStart, value.lineEnd, value.title, value.evidence].join(
    '\u0000',
  );
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `f_auto_${(hash >>> 0).toString(36)}`;
}

function autoQuestionId(value: Record<string, unknown>): string {
  const basis = [value.file, value.line, value.question].join('\u0000');
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `q_auto_${(hash >>> 0).toString(36)}`;
}

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportValidationError';
  }
}

interface ValidationOptions {
  snapshot?: Snapshot;
  maxQuestions?: number;
  maxTextBytes?: number;
}

interface Context {
  snapshot?: Snapshot;
  rejected: RejectedReportItem[];
  warnings: string[];
  maxTextBytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function textWithin(ctx: Context, value: unknown): value is string {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= ctx.maxTextBytes;
}

function reject(
  ctx: Context,
  kind: RejectedReportItem['kind'],
  reason: string,
  id?: string,
  index?: number,
): void {
  ctx.rejected.push({
    kind,
    ...(id === undefined ? {} : { id }),
    ...(index === undefined ? {} : { index }),
    reason,
  });
}

function warnUnknown(
  ctx: Context,
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) ctx.warnings.push(`unknown-${label}-field:${key}`);
  }
}

function fileLines(file: FileDiff | undefined): string[] | undefined {
  return file?.newLines ?? file?.oldLines;
}

function findFile(snapshot: Snapshot | undefined, path: string): FileDiff | undefined {
  return snapshot?.files.find((file) => file.path === path);
}

/** Removes indentation and collapses horizontal whitespace for comparison. */
export function normalizeCode(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n');
}

function validateSuggestion(
  ctx: Context,
  file: FileDiff,
  lineStart: number,
  lineEnd: number,
  value: unknown,
): { suggestion?: { original: string; replacement: string }; unanchored?: boolean } {
  if (!isRecord(value)) return { unanchored: true };
  const { original, replacement } = value;
  if (!textWithin(ctx, original) || !textWithin(ctx, replacement)) return { unanchored: true };
  const lines = fileLines(file);
  if (lines === undefined) return { unanchored: true };
  const current = lines.slice(lineStart - 1, lineEnd).join('\n');
  if (normalizeCode(current) !== normalizeCode(original)) return { unanchored: true };
  return { suggestion: { original, replacement } };
}

function validateFinding(
  ctx: Context,
  value: unknown,
  index: number,
  ids: Set<string>,
): Finding | null {
  if (!isRecord(value)) {
    reject(ctx, 'finding', 'finding must be an object', undefined, index);
    return null;
  }
  warnUnknown(ctx, value, FINDING_FIELDS, 'finding');
  const id = isNonEmpty(value.id) ? value.id : autoFindingId(value);
  const rejected = (reason: string): null => {
    reject(ctx, 'finding', reason, id, index);
    return null;
  };
  if (ids.has(id)) return rejected(`duplicate finding id: ${id}`);
  const severityKey = typeof value.severity === 'string' ? value.severity.toLowerCase() : '';
  const severity = Object.prototype.hasOwnProperty.call(SEVERITY_ALIASES, severityKey)
    ? SEVERITY_ALIASES[severityKey]
    : undefined;
  if (severity === undefined) return rejected('severity must be blocker|major|minor|nit');
  // Keep reports from capable but imperfect models: missing metadata gets a
  // safe default, while present-but-invalid metadata and broken anchors reject.
  let category: FindingCategory = 'other';
  if (value.category !== undefined) {
    if (!CATEGORIES.has(value.category as FindingCategory)) {
      return rejected('category is not a known category');
    }
    category = value.category as FindingCategory;
  }
  let confidence: ReviewerConfidence = 'medium';
  if (value.confidence !== undefined) {
    if (!CONFIDENCES.has(value.confidence as ReviewerConfidence)) {
      return rejected('confidence must be high|medium|low');
    }
    confidence = value.confidence as ReviewerConfidence;
  }
  let kind: FindingKind = 'issue';
  if (value.kind !== undefined) {
    if (!KINDS.has(value.kind as FindingKind))
      return rejected('kind must be issue|question|praise');
    kind = value.kind as FindingKind;
  }
  if (!isNonEmpty(value.file)) return rejected('file must be a non-empty string');
  const lineStart = value.lineStart;
  const lineEnd = value.lineEnd === undefined ? lineStart : value.lineEnd;
  if (!isPositiveInt(lineStart) || !isPositiveInt(lineEnd)) {
    return rejected('lineStart and lineEnd must be positive integers');
  }
  if (lineEnd < lineStart) return rejected('lineEnd must not precede lineStart');
  const title = value.title;
  if (!textWithin(ctx, title)) {
    return rejected(`title must be a string no larger than ${ctx.maxTextBytes} bytes`);
  }
  let rationale: unknown = value.rationale;
  if (rationale === undefined) {
    rationale = textWithin(ctx, value.recommendation) ? value.recommendation : title;
  }
  if (!textWithin(ctx, rationale)) {
    return rejected(`rationale must be a string no larger than ${ctx.maxTextBytes} bytes`);
  }
  const evidence = value.evidence;
  if (!textWithin(ctx, evidence)) {
    return rejected(`evidence must be a string no larger than ${ctx.maxTextBytes} bytes`);
  }

  const file = findFile(ctx.snapshot, value.file);
  if (ctx.snapshot !== undefined && file === undefined) {
    return rejected(`file is not present in the snapshot: ${value.file}`);
  }
  const lines = fileLines(file);
  if (lines !== undefined && lineEnd > lines.length) {
    return rejected(`line range ${lineStart}..${lineEnd} exceeds ${lines.length} lines`);
  }

  const finding: Finding = {
    id,
    severity,
    category,
    confidence,
    kind,
    file: value.file,
    lineStart,
    lineEnd,
    title,
    rationale,
    evidence,
  };
  if (value.suggestion !== undefined && file !== undefined) {
    const suggestion = validateSuggestion(ctx, file, lineStart, lineEnd, value.suggestion);
    if (suggestion.suggestion !== undefined) finding.suggestion = suggestion.suggestion;
    if (suggestion.unanchored === true) finding.unanchored = true;
  } else if (value.suggestion !== undefined) {
    finding.unanchored = true;
  }
  ids.add(id);
  return finding;
}

export interface FindingItemValidation {
  finding: Finding | null;
  rejected: RejectedReportItem[];
  warnings: string[];
}

/**
 * Validate one incremental finding against the same rules as a full report.
 * Used by the job route so an agent cannot append malformed findings to the
 * event-sourced review before its final report is validated.
 */
export function validateFindingItem(
  value: unknown,
  options: { snapshot?: Snapshot; maxTextBytes?: number } = {},
): FindingItemValidation {
  const ctx: Context = {
    rejected: [],
    warnings: [],
    maxTextBytes: options.maxTextBytes ?? MAX_TEXT_BYTES,
    ...(options.snapshot === undefined ? {} : { snapshot: options.snapshot }),
  };
  const finding = validateFinding(ctx, value, 0, new Set<string>());
  return { finding, rejected: ctx.rejected, warnings: ctx.warnings };
}

function validateQuestion(
  ctx: Context,
  value: unknown,
  index: number,
  ids: Set<string>,
): ReviewQuestion | null {
  if (!isRecord(value)) {
    reject(ctx, 'question', 'question must be an object', undefined, index);
    return null;
  }
  warnUnknown(ctx, value, QUESTION_FIELDS, 'question');
  const id = isNonEmpty(value.id) ? value.id : autoQuestionId(value);
  const rejected = (reason: string): null => {
    reject(ctx, 'question', reason, id, index);
    return null;
  };
  if (ids.has(id)) return rejected(`duplicate question id: ${id}`);
  if (!isNonEmpty(value.file)) return rejected('file must be a non-empty string');
  if (!isPositiveInt(value.line)) return rejected('line must be a positive integer');
  if (!textWithin(ctx, value.question) || !textWithin(ctx, value.why)) {
    return rejected(`question text must be no larger than ${ctx.maxTextBytes} bytes`);
  }
  const file = findFile(ctx.snapshot, value.file);
  if (ctx.snapshot !== undefined && file === undefined) {
    return rejected(`file is not present in the snapshot: ${value.file}`);
  }
  const lines = fileLines(file);
  if (lines !== undefined && value.line > lines.length) {
    return rejected(`line ${value.line} exceeds ${lines.length} lines`);
  }
  ids.add(id);
  return {
    id,
    file: value.file,
    line: value.line,
    question: value.question,
    why: value.why,
  };
}

function validateTests(ctx: Context, value: unknown): TestSummary {
  if (value === undefined) return { ran: false, commands: [] };
  if (!isRecord(value)) {
    reject(ctx, 'test', 'tests must be an object');
    return { ran: false, commands: [] };
  }
  const ran = value.ran === true;
  const commands: TestCommand[] = [];
  if (Array.isArray(value.commands)) {
    value.commands.forEach((entry, index) => {
      if (!isRecord(entry)) {
        reject(ctx, 'test', 'test command must be an object', undefined, index);
        return;
      }
      if (
        typeof entry.command !== 'string' ||
        typeof entry.summary !== 'string' ||
        typeof entry.result !== 'string' ||
        !TEST_RESULTS.has(entry.result as TestResult)
      ) {
        reject(ctx, 'test', 'invalid test command', undefined, index);
        return;
      }
      if (
        Buffer.byteLength(entry.command, 'utf8') > ctx.maxTextBytes ||
        Buffer.byteLength(entry.summary, 'utf8') > ctx.maxTextBytes
      ) {
        reject(ctx, 'test', 'test command text exceeds the text limit', undefined, index);
        return;
      }
      commands.push({
        command: entry.command,
        result: entry.result as TestResult,
        summary: entry.summary,
      });
    });
  }
  return { ran, commands };
}

function validateVerification(ctx: Context, value: unknown, index: number): Verification | null {
  if (!isRecord(value)) {
    reject(ctx, 'verification', 'verification must be an object', undefined, index);
    return null;
  }
  if (
    !isNonEmpty(value.commentId) ||
    typeof value.status !== 'string' ||
    !VERIFICATION_STATUSES.has(value.status as VerificationStatus) ||
    !textWithin(ctx, value.evidence)
  ) {
    reject(ctx, 'verification', 'invalid verification entry', undefined, index);
    return null;
  }
  return {
    commentId: value.commentId,
    status: value.status as VerificationStatus,
    evidence: value.evidence,
  };
}

/**
 * Dependency-free validation of reviewer output. Invalid items are rejected
 * individually; the rest of the report is kept.
 */
export function validateReport(raw: unknown, options: ValidationOptions = {}): ValidationResult {
  if (!isRecord(raw)) throw new ReportValidationError('reviewer report must be an object');
  if (raw.schemaVersion !== 1) {
    throw new ReportValidationError('reviewer report schemaVersion must be 1');
  }

  const ctx: Context = {
    rejected: [],
    warnings: [],
    maxTextBytes: options.maxTextBytes ?? MAX_TEXT_BYTES,
    ...(options.snapshot === undefined ? {} : { snapshot: options.snapshot }),
  };
  warnUnknown(ctx, raw, REPORT_FIELDS, 'report');

  const riskLevel: RiskLevel =
    typeof raw.riskLevel === 'string' && RISKS.has(raw.riskLevel as RiskLevel)
      ? (raw.riskLevel as RiskLevel)
      : 'medium';
  if (typeof raw.riskLevel !== 'string' || !RISKS.has(raw.riskLevel as RiskLevel)) {
    ctx.warnings.push('invalid-risk-level');
  }

  let summary = typeof raw.summary === 'string' ? raw.summary : '';
  if (typeof raw.summary !== 'string') ctx.warnings.push('invalid-summary');
  if (Buffer.byteLength(summary, 'utf8') > ctx.maxTextBytes) {
    summary = Buffer.from(summary, 'utf8').subarray(0, ctx.maxTextBytes).toString('utf8');
    ctx.warnings.push('summary-truncated');
  }

  const findings: Finding[] = [];
  const findingIds = new Set<string>();
  if (Array.isArray(raw.findings)) {
    raw.findings.forEach((entry, index) => {
      const finding = validateFinding(ctx, entry, index, findingIds);
      if (finding !== null) findings.push(finding);
    });
  } else if (raw.findings !== undefined) {
    reject(ctx, 'report', 'findings must be an array');
  }

  const questions: ReviewQuestion[] = [];
  const questionIds = new Set<string>();
  if (Array.isArray(raw.questions)) {
    const max = options.maxQuestions ?? MAX_QUESTIONS;
    raw.questions.forEach((entry, index) => {
      if (index >= max) {
        reject(ctx, 'question', `more than ${max} questions`, undefined, index);
        return;
      }
      const question = validateQuestion(ctx, entry, index, questionIds);
      if (question !== null) questions.push(question);
    });
  } else if (raw.questions !== undefined) {
    reject(ctx, 'report', 'questions must be an array');
  }

  const verification: Verification[] = [];
  if (Array.isArray(raw.verification)) {
    raw.verification.forEach((entry, index) => {
      const item = validateVerification(ctx, entry, index);
      if (item !== null) verification.push(item);
    });
  } else if (raw.verification !== undefined) {
    reject(ctx, 'report', 'verification must be an array');
  }

  return {
    report: {
      schemaVersion: 1,
      summary,
      riskLevel,
      findings,
      questions,
      tests: validateTests(ctx, raw.tests),
      verification,
    },
    rejected: ctx.rejected,
    warnings: ctx.warnings,
  };
}
