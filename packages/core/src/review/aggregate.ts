import type {
  AgentReport,
  Finding,
  ReviewQuestion,
  RiskLevel,
  TestCommand,
  Verification,
} from '../reviewer/types.js';
import { MAX_QUESTIONS } from '../reviewer/validate.js';
import type { ReviewPlan } from './plan.js';
import { coverageFromPlan } from './plan.js';
import { summarizeCoverage } from './coverage.js';
import type { FileCoverage, ReviewCoverage, ReviewId, RoundNo } from './types.js';
import type { ReviewerBackendKind } from '../reviewer/types.js';

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export interface ShardReportInput {
  shardId: string;
  report: AgentReport;
}

export interface AggregateShardReportsInput {
  reviewId: ReviewId;
  round: RoundNo;
  backend: ReviewerBackendKind;
  plan: ReviewPlan;
  reports: readonly ShardReportInput[];
  /** Shards known to have failed; missing shards are failed automatically. */
  failedShards?: readonly string[];
}

export interface AggregateShardReportsResult {
  report: AgentReport;
  coverage: ReviewCoverage;
}

function findingKey(finding: Finding): string {
  return `${finding.file}\0${finding.lineStart}\0${finding.lineEnd}\0${finding.title}`;
}

function questionKey(question: ReviewQuestion): string {
  return `${question.file}\0${question.line}\0${question.question}`;
}

function mergeFindings(reports: readonly ShardReportInput[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    for (const finding of report.report.findings) {
      const key = findingKey(finding);
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ ...finding });
    }
  }
  return findings;
}

function mergeQuestions(reports: readonly ShardReportInput[]): ReviewQuestion[] {
  const questions: ReviewQuestion[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    for (const question of report.report.questions) {
      const key = questionKey(question);
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push({ ...question });
      if (questions.length >= MAX_QUESTIONS) return questions;
    }
  }
  return questions;
}

function mergeTests(reports: readonly ShardReportInput[]): AgentReport['tests'] {
  const commands: TestCommand[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    for (const command of report.report.tests.commands) {
      const key = `${command.command}\0${command.result}\0${command.summary}`;
      if (seen.has(key)) continue;
      seen.add(key);
      commands.push({ ...command });
    }
  }
  return { ran: reports.some((report) => report.report.tests.ran), commands };
}

function mergeVerification(reports: readonly ShardReportInput[]): Verification[] {
  const entries: Verification[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    for (const item of report.report.verification) {
      const key = `${item.commentId}\0${item.status}\0${item.evidence}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ ...item });
    }
  }
  return entries;
}

function highestRisk(reports: readonly ShardReportInput[]): RiskLevel {
  let result: RiskLevel = 'low';
  for (const report of reports) {
    if (RISK_ORDER[report.report.riskLevel] > RISK_ORDER[result]) {
      result = report.report.riskLevel;
    }
  }
  return result;
}

function updateCoverage(
  plan: ReviewPlan,
  reports: readonly ShardReportInput[],
  failed: ReadonlySet<string>,
): ReviewCoverage {
  const base = coverageFromPlan(plan);
  const byShard = new Map(reports.map((report) => [report.shardId, report]));
  const files: FileCoverage[] = base.files.map((file) => {
    const planFile = plan.files.find((item) => item.path === file.path);
    const shardId = planFile?.shardId;
    if (shardId === undefined) return { ...file };
    if (failed.has(shardId)) {
      return { ...file, status: 'failed', reason: 'shard-failed' };
    }
    const shard = plan.shards.find((item) => item.id === shardId);
    if (shard === undefined || !byShard.has(shardId)) {
      return { ...file, status: 'failed', reason: 'shard-failed' };
    }
    const status = shard.tier === 'deep' ? 'deep-reviewed' : 'light-reviewed';
    const next: FileCoverage = { ...file, status };
    delete next.reason;
    return next;
  });
  return {
    files,
    totals: summarizeCoverage(files),
    ...(base.incomplete === true ? { incomplete: true } : {}),
  };
}

export interface MergeShardReportsInput {
  reviewId: ReviewId;
  round: RoundNo;
  backend: ReviewerBackendKind;
  /**
   * Reports in display order. Callers that have a plan must sort by plan order;
   * live previews sort by shard index before calling this helper.
   */
  reports: readonly ShardReportInput[];
}

/**
 * Merges completed shard reports without another model call or coverage
 * assumptions. Missing shards are intentionally ignored: this is the live
 * preview path while a round is still running. Final aggregation, which also
 * computes coverage and fails missing shards, uses this helper after ordering
 * reports by the plan.
 */
export function mergeShardReports(input: MergeShardReportsInput): AgentReport {
  const findings = mergeFindings(input.reports);
  const summaryParts = input.reports
    .map((report) => report.report.summary.trim())
    .filter((summary) => summary !== '');
  const summary =
    summaryParts.length === 0
      ? 'The review did not produce a shard report.'
      : summaryParts.join('\n\n').slice(0, 20_000);
  return {
    schemaVersion: 1,
    summary,
    riskLevel: highestRisk(input.reports),
    findings,
    questions: mergeQuestions(input.reports),
    tests: mergeTests(input.reports),
    verification: mergeVerification(input.reports),
    reviewId: input.reviewId,
    round: input.round,
    backend: input.backend,
    rejected: input.reports.flatMap((item) => item.report.rejected),
    warnings: [...new Set(input.reports.flatMap((report) => report.report.warnings))],
    ...(input.reports.some((item) => item.report.dirtyWorktree === true)
      ? { dirtyWorktree: true }
      : {}),
    skipped: false,
  };
}

/**
 * Merges shard reports without another model call. Deterministic: reports are
 * ordered by the review plan (not shard completion order), findings dedupe by
 * file/range/title, coverage is derived from the plan and the completed shards.
 * Missing shards are failed, never silently reviewed.
 */
export function aggregateShardReports(
  input: AggregateShardReportsInput,
): AggregateShardReportsResult {
  const failed = new Set(input.failedShards ?? []);
  for (const shard of input.plan.shards) {
    if (!input.reports.some((report) => report.shardId === shard.id)) failed.add(shard.id);
  }
  const shardOrder = new Map(input.plan.shards.map((shard, index) => [shard.id, index]));
  const rank = (shardId: string): number => shardOrder.get(shardId) ?? input.plan.shards.length;
  const reports = [...input.reports].sort(
    (left, right) => rank(left.shardId) - rank(right.shardId),
  );
  const report = mergeShardReports({
    reviewId: input.reviewId,
    round: input.round,
    backend: input.backend,
    reports,
  });
  for (const shardId of [...failed].sort()) {
    report.warnings.push(`shard-failed:${shardId}`);
  }
  return { report, coverage: updateCoverage(input.plan, reports, failed) };
}
