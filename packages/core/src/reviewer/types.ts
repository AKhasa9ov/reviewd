import type { Actor, ReviewId, RoundNo } from '../review/types.js';
import type { Snapshot } from '../types.js';

export type FindingSeverity = 'blocker' | 'major' | 'minor' | 'nit';
export type FindingCategory =
  | 'security'
  | 'correctness'
  | 'tests'
  | 'performance'
  | 'maintainability'
  | 'api'
  | 'concurrency'
  | 'docs'
  | 'other';
export type FindingKind = 'issue' | 'question' | 'praise';
export type ReviewerConfidence = 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type TestResult = 'pass' | 'fail' | 'unknown';
export type VerificationStatus = 'fixed' | 'not-fixed' | 'unclear';
export type ReviewerBackendKind = 'fake' | 'command' | 'none' | 'worker';

export interface ReviewerConfig {
  backend: ReviewerBackendKind;
  command?: string[];
  timeoutMs?: number;
}

export interface ReviewSuggestion {
  original: string;
  replacement: string;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  confidence: ReviewerConfidence;
  kind: FindingKind;
  file: string;
  lineStart: number;
  lineEnd: number;
  title: string;
  rationale: string;
  evidence: string;
  suggestion?: ReviewSuggestion;
  /** Suggestion was supplied but could not be matched against the snapshot. */
  unanchored?: boolean;
}

export interface ReviewQuestion {
  id: string;
  file: string;
  line: number;
  question: string;
  why: string;
}

export interface TestCommand {
  command: string;
  result: TestResult;
  summary: string;
}

export interface TestSummary {
  ran: boolean;
  commands: TestCommand[];
}

export interface Verification {
  commentId: string;
  status: VerificationStatus;
  evidence: string;
}

export interface ReviewerReport {
  schemaVersion: 1;
  summary: string;
  riskLevel: RiskLevel;
  findings: Finding[];
  questions: ReviewQuestion[];
  tests: TestSummary;
  verification: Verification[];
  /** Set by command backends when the repo changed during the run. */
  dirtyWorktree?: boolean;
}

export type RejectedReportKind = 'report' | 'finding' | 'question' | 'test' | 'verification';

export interface RejectedReportItem {
  kind: RejectedReportKind;
  index?: number;
  id?: string;
  reason: string;
}

export interface ValidationResult {
  report: ReviewerReport;
  rejected: RejectedReportItem[];
  warnings: string[];
}

/** Persisted report: validated content plus provenance and rejected items. */
export interface AgentReport extends ReviewerReport {
  reviewId: ReviewId;
  round: RoundNo;
  backend: ReviewerBackendKind;
  rejected: RejectedReportItem[];
  warnings: string[];
  dirtyWorktree?: boolean;
  /** True when the configured backend intentionally did not run. */
  skipped?: boolean;
}

export interface ReviewerJob {
  id: string;
  reviewId: ReviewId;
  round: RoundNo;
  kind: 'initial' | 'verify';
  repoRoot: string;
  /** Complete markdown prompt handed to the reviewer. */
  prompt: string;
  snapshot: Snapshot;
}

export type FindingSink = (finding: Finding) => Promise<void> | void;

export interface ReviewerBackend {
  readonly kind: ReviewerBackendKind;
  run(job: ReviewerJob, sink: FindingSink, signal: AbortSignal): Promise<ReviewerReport>;
  /** Best-effort cancellation for backends that own an external process. */
  cancel?(): void;
}

export type ReviewerErrorCode =
  'invalid-output' | 'timeout' | 'nonzero-exit' | 'cancelled' | 'spawn-failed';

export class ReviewerError extends Error {
  readonly code: ReviewerErrorCode;

  constructor(code: ReviewerErrorCode, message: string) {
    super(message);
    this.name = 'ReviewerError';
    this.code = code;
  }
}

export type GitStatusRunner = (
  cwd: string,
  args: readonly string[],
  options?: { signal?: AbortSignal },
) => Promise<{ stdout: string; code: number; stderr: string }>;

export interface ReviewerActorContext {
  actor: Actor;
  requestId?: string;
}
