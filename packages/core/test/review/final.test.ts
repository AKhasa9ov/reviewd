import { describe, expect, it } from 'vitest';
import { isFinalReviewReport as isFinalReport, summarizeCoverage } from '../../src/index.js';
import type { AgentReport, ReviewCoverage, ReviewState, Round } from '../../src/index.js';

const reviewId = 'rev_01K8Z000000000000000000000';
const at = '2026-10-30T12:00:00.000Z';

function round(no = 1): Round {
  return {
    no,
    snapshotId: `snap_${no}`,
    createdAt: at,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    path: `snapshots/snap_${no}.json`,
  };
}

function report(roundNo = 1): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'No issues',
    riskLevel: 'low',
    findings: [],
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
    reviewId,
    round: roundNo,
    backend: 'fake',
    rejected: [],
    warnings: [],
  };
}

function coverage(statuses: ReviewCoverage['files'][number]['status'][]): ReviewCoverage {
  const files = statuses.map((status, index) => ({ path: `src/${index}.ts`, status }));
  return { files, totals: summarizeCoverage(files) };
}

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    id: reviewId,
    title: 'Final report',
    repoRoot: '/tmp/repo',
    status: 'open',
    createdAt: at,
    rounds: [round()],
    comments: [],
    version: 0,
    report: report(),
    ...overrides,
  };
}

describe('isFinalReviewReport', () => {
  it('accepts a latest report without agent metadata', () => {
    expect(isFinalReport(state())).toBe(true);
  });

  it('accepts a report supplied separately from the review view', () => {
    expect(isFinalReport(state({ report: undefined }), report())).toBe(true);
  });

  it('rejects a report from an older round', () => {
    expect(isFinalReport(state({ rounds: [round(1), round(2)] }))).toBe(false);
  });

  it('accepts a done reviewer with complete or absent coverage', () => {
    expect(isFinalReport(state({ agent: { status: 'done' } }))).toBe(true);
    expect(
      isFinalReport(state({ agent: { status: 'done', coverage: coverage(['deep-reviewed']) } })),
    ).toBe(true);
  });

  it('rejects incomplete coverage even when the status says done', () => {
    expect(
      isFinalReport(state({ agent: { status: 'done', coverage: coverage(['pending']) } })),
    ).toBe(false);
  });

  it('rejects reports while the reviewer is queued, running or partial', () => {
    for (const status of ['queued', 'running', 'partial'] as const) {
      expect(isFinalReport(state({ agent: { status } }))).toBe(false);
    }
  });

  it('rejects reports after a failed or skipped run', () => {
    for (const status of ['failed', 'skipped'] as const) {
      expect(isFinalReport(state({ agent: { status } }))).toBe(false);
    }
  });
});
