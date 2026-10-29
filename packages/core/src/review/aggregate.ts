import type {
  AgentReport,
  Finding,
  ReviewQuestion,
  RiskLevel,
  TestCommand,
  Verification,
} from '../reviewer/types.js';
import { MAX_FINDINGS, MAX_QUESTIONS } from '../reviewer/validate.js';
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
      if (findings.length >= MAX_FINDINGS) return findings;
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

/**
 * Merges shard reports without another model call. Deterministic: input order
 * is the shard arrival order, findings dedupe by file/range/title, coverage is
 * derived from the plan and the completed shards. Missing shards are failed,
 * never silently reviewed.
 */
export function aggregateShardReports(
  input: AggregateShardReportsInput,
): AggregateShardReportsResult {
  const failed = new Set(input.failedShards ?? []);
  for (const shard of input.plan.shards) {
    if (!input.reports.some((report) => report.shardId === shard.id)) failed.add(shard.id);
  }
  const reports = [...input.reports];
  const findings = mergeFindings(reports);
  const warnings = [...new Set(reports.flatMap((report) => report.report.warnings))];
  for (const shardId of [...failed].sort()) {
    warnings.push(`shard-failed:${shardId}`);
  }
  const summaryParts = reports
    .map((report) => report.report.summary.trim())
    .filter((summary) => summary !== '');
  const summary =
    summaryParts.length === 0
      ? 'The review did not produce a shard report.'
      : summaryParts.join('\n\n').slice(0, 20_000);
  const report: AgentReport = {
    schemaVersion: 1,
    summary,
    riskLevel: highestRisk(reports),
    findings,
    questions: mergeQuestions(reports),
    tests: mergeTests(reports),
    verification: mergeVerification(reports),
    reviewId: input.reviewId,
    round: input.round,
    backend: input.backend,
    rejected: reports.flatMap((item) => item.report.rejected),
    warnings,
    ...(reports.some((item) => item.report.dirtyWorktree === true) ? { dirtyWorktree: true } : {}),
    skipped: false,
  };
  return { report, coverage: updateCoverage(input.plan, reports, failed) };
}
