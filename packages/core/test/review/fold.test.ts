import { describe, expect, it } from 'vitest';
import { createEvent, fold, summarizeCoverage } from '../../src/index.js';
import type {
  Actor,
  AgentReport,
  CoverageStatus,
  FileCoverage,
  ReviewCoverage,
  ReviewEvent,
  ReviewEventDataMap,
  ReviewEventType,
  ReviewState,
} from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const reviewId = 'rev_01K8Z000000000000000000000';
const now = (): Date => new Date('2026-10-28T12:00:00.000Z');
let sequence = 0;

function event<T extends ReviewEventType>(type: T, data: ReviewEventDataMap[T]): ReviewEvent {
  return createEvent({
    reviewId,
    type,
    actor,
    data,
    now,
    newId: () => `evt_test_${sequence++}`,
  }) as ReviewEvent;
}

function baseState(): ReviewState {
  return {
    id: reviewId,
    title: 'Coverage fold',
    repoRoot: '/tmp/repo',
    status: 'open',
    createdAt: '2026-10-28T12:00:00.000Z',
    rounds: [
      {
        no: 1,
        snapshotId: 'snap_1',
        createdAt: '2026-10-28T12:00:00.000Z',
        baseSha: 'a'.repeat(40),
        headSha: 'b'.repeat(40),
        path: '/tmp/repo',
      },
    ],
    comments: [],
    version: 1,
  };
}

function ledger(statuses: CoverageStatus[]): ReviewCoverage {
  const files: FileCoverage[] = statuses.map((status, index) => ({
    path: `src/file-${index}.ts`,
    status,
  }));
  return { files, totals: summarizeCoverage(files) };
}

function report(round = 1, skipped = false): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'No issues',
    riskLevel: 'low',
    findings: [],
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
    reviewId,
    round,
    backend: 'worker',
    rejected: [],
    warnings: [],
    ...(skipped ? { skipped: true } : {}),
  };
}

function reportEvent(round = 1, skipped = false): ReviewEvent {
  return event('agent/report', { report: report(round, skipped) });
}

describe('agent coverage fold', () => {
  it('records coverage at enqueue and keeps it when the agent starts', () => {
    const coverage = ledger(['pending', 'skipped']);
    const queued = fold(baseState(), event('agent/coverage', { coverage, round: 1 }));

    expect(queued.agent).toMatchObject({ status: 'queued', round: 1, coverage });

    const started = fold(
      queued,
      event('agent/started', { jobId: 'job_1', round: 1, backend: 'worker' }),
    );

    expect(started.agent).toMatchObject({ status: 'running', jobId: 'job_1', round: 1 });
    expect(started.agent?.coverage).toEqual(coverage);
  });

  it('promotes pending files and marks an incomplete round partial', () => {
    const queued = fold(
      baseState(),
      event('agent/coverage', { coverage: ledger(['pending', 'skipped']), round: 1 }),
    );

    const reported = fold(queued, reportEvent());

    expect(reported.agent?.status).toBe('partial');
    expect(reported.agent?.coverage?.totals.byStatus).toMatchObject({
      pending: 0,
      'light-reviewed': 1,
      skipped: 1,
    });
    expect(queued.agent?.coverage?.totals.byStatus.pending).toBe(1);
  });

  it('marks a complete round done after promoting pending files', () => {
    const coverage = ledger(['pending', 'deep-reviewed', 'manifest-only']);
    coverage.files[2]!.reason = 'generated';
    const queued = fold(baseState(), event('agent/coverage', { coverage, round: 1 }));

    const reported = fold(queued, reportEvent());

    expect(reported.agent?.status).toBe('done');
    expect(reported.agent?.coverage?.totals.byStatus).toMatchObject({
      pending: 0,
      'light-reviewed': 1,
      'deep-reviewed': 1,
      'manifest-only': 1,
    });
  });

  it('keeps a round partial when the manifest listing itself was incomplete', () => {
    const coverage = ledger(['pending']);
    coverage.incomplete = true;
    const queued = fold(baseState(), event('agent/coverage', { coverage, round: 1 }));

    const reported = fold(queued, reportEvent());

    expect(reported.agent?.status).toBe('partial');
    expect(reported.agent?.coverage?.incomplete).toBe(true);
    expect(reported.agent?.coverage?.totals.byStatus['light-reviewed']).toBe(1);
  });

  it('keeps a manifest-only file without a policy reason partial', () => {
    const queued = fold(
      baseState(),
      event('agent/coverage', {
        coverage: ledger(['pending', 'manifest-only']),
        round: 1,
      }),
    );

    const reported = fold(queued, reportEvent());

    expect(reported.agent?.status).toBe('partial');
  });

  it('keeps a skipped report skipped even when coverage is incomplete', () => {
    const queued = fold(
      baseState(),
      event('agent/coverage', { coverage: ledger(['pending', 'skipped']), round: 1 }),
    );

    const reported = fold(queued, reportEvent(1, true));

    expect(reported.agent?.status).toBe('skipped');
  });

  it('keeps a failed round failed and preserves its coverage', () => {
    const queued = fold(
      baseState(),
      event('agent/coverage', { coverage: ledger(['pending']), round: 1 }),
    );

    const failed = fold(
      queued,
      event('agent/failed', { code: 'timeout', message: 'reviewer timed out' }),
    );

    expect(failed.agent).toMatchObject({ status: 'failed', error: 'reviewer timed out' });
    expect(failed.agent?.coverage?.totals.byStatus.pending).toBe(1);
  });

  it('keeps a legacy report without coverage done', () => {
    const reported = fold(baseState(), reportEvent());

    expect(reported.agent?.status).toBe('done');
    expect(reported.agent?.coverage).toBeUndefined();
  });

  it('treats an unknown persisted status as incomplete', () => {
    const files: FileCoverage[] = [
      { path: 'src/a.ts', status: 'light-reviewed' },
      { path: 'src/legacy.ts', status: 'mystery' as unknown as CoverageStatus },
    ];
    const coverage = { files, totals: summarizeCoverage(files) };
    const queued = fold(baseState(), event('agent/coverage', { coverage, round: 1 }));

    const reported = fold(queued, reportEvent());

    expect(reported.agent?.status).toBe('partial');
  });

  it('does not mutate the previous state when folding coverage or a report', () => {
    const queued = fold(
      baseState(),
      event('agent/coverage', { coverage: ledger(['pending']), round: 1 }),
    );
    const before = structuredClone(queued);

    fold(queued, reportEvent());

    expect(queued).toEqual(before);
  });
});

describe('agent shard fold', () => {
  it('records shard reports without finishing the round', () => {
    const queued = fold(
      baseState(),
      event('agent/coverage', { coverage: ledger(['pending']), round: 1 }),
    );

    const sharded = fold(
      queued,
      event('agent/shard', {
        shardId: 'shard_001',
        shardIndex: 0,
        shardCount: 2,
        round: 1,
        report: report(),
      }),
    );

    expect(sharded.agent?.status).toBe('queued');
    expect(sharded.agent?.shards).toHaveLength(1);
    expect(sharded.agent?.shards?.[0]).toMatchObject({ shardId: 'shard_001', round: 1 });
    expect(sharded.report).toBeUndefined();
  });

  it('replaces a shard report by shard id', () => {
    const first = fold(
      baseState(),
      event('agent/shard', {
        shardId: 'shard_001',
        shardIndex: 0,
        shardCount: 1,
        round: 1,
        report: report(),
      }),
    );
    const second = fold(
      first,
      event('agent/shard', {
        shardId: 'shard_001',
        shardIndex: 0,
        shardCount: 1,
        round: 1,
        report: { ...report(), summary: 'replacement' },
      }),
    );

    expect(second.agent?.shards).toHaveLength(1);
    expect(second.agent?.shards?.[0]?.report.summary).toBe('replacement');
  });
});
