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

export const MAX_FINDINGS = 200;
export const MAX_QUESTIONS = 50;
export const MAX_TEXT_BYTES = 32 * 1024;

const SEVERITIES = new Set<FindingSeverity>(['blocker', 'major', 'minor', 'nit']);
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

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportValidationError';
  }
}

interface ValidationOptions {
  snapshot?: Snapshot;
  maxFindings?: number;
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
  const id = isNonEmpty(value.id) ? value.id : undefined;
  const rejected = (reason: string): null => {
    reject(ctx, 'finding', reason, id, index);
    return null;
  };
  if (id === undefined) return rejected('id must be a non-empty string');
  if (ids.has(id)) return rejected(`duplicate finding id: ${id}`);
  if (typeof value.severity !== 'string' || !SEVERITIES.has(value.severity as FindingSeverity)) {
    return rejected('severity must be blocker|major|minor|nit');
  }
  if (typeof value.category !== 'string' || !CATEGORIES.has(value.category as FindingCategory)) {
    return rejected('category is not a known category');
  }
  if (
    typeof value.confidence !== 'string' ||
    !CONFIDENCES.has(value.confidence as ReviewerConfidence)
  ) {
    return rejected('confidence must be high|medium|low');
  }
  if (typeof value.kind !== 'string' || !KINDS.has(value.kind as FindingKind)) {
    return rejected('kind must be issue|question|praise');
  }
  if (!isNonEmpty(value.file)) return rejected('file must be a non-empty string');
  if (!isPositiveInt(value.lineStart) || !isPositiveInt(value.lineEnd)) {
    return rejected('lineStart and lineEnd must be positive integers');
  }
  if (value.lineEnd < value.lineStart) return rejected('lineEnd must not precede lineStart');
  for (const field of ['title', 'rationale', 'evidence'] as const) {
    if (!textWithin(ctx, value[field])) {
      return rejected(`${field} must be a string no larger than ${ctx.maxTextBytes} bytes`);
    }
  }

  const file = findFile(ctx.snapshot, value.file);
  if (ctx.snapshot !== undefined && file === undefined) {
    return rejected(`file is not present in the snapshot: ${value.file}`);
  }
  const lines = fileLines(file);
  if (lines !== undefined && value.lineEnd > lines.length) {
    return rejected(
      `line range ${value.lineStart}..${value.lineEnd} exceeds ${lines.length} lines`,
    );
  }

  const finding: Finding = {
    id,
    severity: value.severity as FindingSeverity,
    category: value.category as FindingCategory,
    confidence: value.confidence as ReviewerConfidence,
    kind: value.kind as FindingKind,
    file: value.file,
    lineStart: value.lineStart,
    lineEnd: value.lineEnd,
    title: value.title as string,
    rationale: value.rationale as string,
    evidence: value.evidence as string,
  };
  if (value.suggestion !== undefined && file !== undefined) {
    const suggestion = validateSuggestion(
      ctx,
      file,
      value.lineStart,
      value.lineEnd,
      value.suggestion,
    );
    if (suggestion.suggestion !== undefined) finding.suggestion = suggestion.suggestion;
    if (suggestion.unanchored === true) finding.unanchored = true;
  } else if (value.suggestion !== undefined) {
    finding.unanchored = true;
  }
  ids.add(id);
  return finding;
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
  const id = isNonEmpty(value.id) ? value.id : undefined;
  const rejected = (reason: string): null => {
    reject(ctx, 'question', reason, id, index);
    return null;
  };
  if (id === undefined) return rejected('id must be a non-empty string');
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
    const max = options.maxFindings ?? MAX_FINDINGS;
    raw.findings.forEach((entry, index) => {
      if (index >= max) {
        reject(ctx, 'finding', `more than ${max} findings`, undefined, index);
        return;
      }
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
