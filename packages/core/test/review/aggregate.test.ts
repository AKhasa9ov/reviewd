import { describe, expect, it } from 'vitest';
import type { AgentReport, Finding } from '../../src/reviewer/types.js';
import type { ManifestFile, ReviewManifest } from '../../src/types.js';
import { aggregateShardReports } from '../../src/review/aggregate.js';
import { buildReviewPlan } from '../../src/review/plan.js';
import { isCoverageComplete } from '../../src/review/coverage.js';

function file(path: string, overrides: Partial<ManifestFile> = {}): ManifestFile {
  return {
    path,
    status: 'modified',
    binary: false,
    ignored: false,
    oversized: false,
    added: 1,
    deleted: 0,
    hunkCount: 1,
    patchBytes: 20,
    ...overrides,
  };
}

function manifest(files: readonly ManifestFile[]): ReviewManifest {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/repo',
      baseRef: 'main',
      headRef: 'feature',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      label: 'main...feature',
      worktreeDigest: 'b'.repeat(40),
    },
    files: [...files],
    totals: {
      files: files.length,
      added: files.reduce((sum, item) => sum + item.added, 0),
      deleted: files.reduce((sum, item) => sum + item.deleted, 0),
      patchBytes: files.reduce((sum, item) => sum + item.patchBytes, 0),
    },
    warnings: [],
  };
}

function finding(filePath: string, id = 'f1', title = 'risk'): Finding {
  return {
    id,
    severity: 'major',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: filePath,
    lineStart: 1,
    lineEnd: 1,
    title,
    rationale: 'why',
    evidence: 'code',
  };
}

function report(overrides: Partial<AgentReport> = {}): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'shard summary',
    riskLevel: 'low',
    findings: [],
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
    reviewId: 'rev_1',
    round: 1,
    backend: 'worker',
    rejected: [],
    warnings: [],
    ...overrides,
  };
}

const source = manifest([
  file('src/a.ts'),
  file('src/a.test.ts'),
  file('docs/api.md'),
  file('pnpm-lock.yaml'),
]);

function plan() {
  return buildReviewPlan({ manifest: source, limits: { maxFiles: 1 } });
}

describe('aggregateShardReports', () => {
  it('merges findings and marks every shard file reviewed', () => {
    const reviewPlan = plan();
    expect(reviewPlan.shards).toHaveLength(3);
    const [first, second, third] = reviewPlan.shards;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('expected three shards');
    }
    const result = aggregateShardReports({
      reviewId: 'rev_1',
      round: 1,
      backend: 'worker',
      plan: reviewPlan,
      reports: [
        {
          shardId: first.id,
          report: report({
            summary: 'source shard',
            riskLevel: 'high',
            findings: [finding('src/a.ts')],
            questions: [{ id: 'q1', file: 'src/a.ts', line: 1, question: 'why?', why: 'because' }],
          }),
        },
        {
          shardId: second.id,
          report: report({
            summary: 'test shard',
            findings: [finding('src/a.test.ts', 'f1')],
          }),
        },
        { shardId: third.id, report: report({ summary: 'docs shard' }) },
      ],
    });

    expect(result.report.findings).toHaveLength(2);
    expect(result.report.summary).toContain('source shard');
    expect(result.report.summary).toContain('docs shard');
    expect(result.report.riskLevel).toBe('high');
    expect(result.report.questions).toHaveLength(1);
    expect(result.report.reviewId).toBe('rev_1');
    expect(result.report.round).toBe(1);
    expect(result.report.backend).toBe('worker');
    expect(isCoverageComplete(result.coverage)).toBe(true);
    const byPath = new Map(result.coverage.files.map((item) => [item.path, item]));
    expect(byPath.get('src/a.ts')).toMatchObject({ status: 'deep-reviewed' });
    expect(byPath.get('src/a.test.ts')).toMatchObject({ status: 'deep-reviewed' });
    expect(byPath.get('docs/api.md')).toMatchObject({ status: 'deep-reviewed' });
    expect(byPath.get('pnpm-lock.yaml')).toMatchObject({ status: 'manifest-only' });
  });

  it('deduplicates the same finding reported by two shards', () => {
    const reviewPlan = plan();
    const [first, second] = reviewPlan.shards;
    if (first === undefined || second === undefined) throw new Error('expected shards');
    const duplicate = finding('src/a.ts', 'different-id', 'same title');
    const result = aggregateShardReports({
      reviewId: 'rev_1',
      round: 1,
      backend: 'worker',
      plan: reviewPlan,
      reports: [
        {
          shardId: first.id,
          report: report({ findings: [duplicate, finding('src/a.ts', 'f2', 'other')] }),
        },
        { shardId: second.id, report: report({ findings: [duplicate] }) },
      ],
    });
    expect(result.report.findings.map((item) => item.title)).toEqual(['same title', 'other']);
  });

  it('keeps failed shards failed and the aggregate partial', () => {
    const reviewPlan = plan();
    const [first, second] = reviewPlan.shards;
    if (first === undefined || second === undefined) throw new Error('expected shards');
    const result = aggregateShardReports({
      reviewId: 'rev_1',
      round: 1,
      backend: 'worker',
      plan: reviewPlan,
      reports: [{ shardId: first.id, report: report({ summary: 'only shard' }) }],
      failedShards: [second.id],
    });
    const byPath = new Map(result.coverage.files.map((item) => [item.path, item]));
    const failedPath = second.paths[0];
    expect(failedPath).toBeDefined();
    expect(byPath.get(failedPath ?? '')).toMatchObject({
      status: 'failed',
      reason: 'shard-failed',
    });
    expect(isCoverageComplete(result.coverage)).toBe(false);
    expect(result.report.warnings).toContain(`shard-failed:${second.id}`);
  });
});
