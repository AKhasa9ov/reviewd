import { describe, expect, it } from 'vitest';
import type { CoverageStatus, ReviewCoverage, ReviewPlan } from '@dsh-code-review/core';
import { retryTargetShardIds } from '../../src/daemon/retry.js';
import type { RetryJobState } from '../../src/daemon/retry.js';

function plan(ids: readonly string[]): ReviewPlan {
  return {
    schemaVersion: 1,
    files: [],
    shards: ids.map((id) => ({
      id,
      moduleId: '.',
      tier: 'deep',
      effort: 'deep',
      paths: [`${id}.ts`],
      fileCount: 1,
      patchBytes: 1,
    })),
    coverage: { files: [], totals: { files: 0, byStatus: {} as never } },
    coveragePlan: { total: 0, byTier: { deep: 0, light: 0, 'manifest-only': 0 } },
    riskFlags: [],
    limits: { maxFiles: 1, maxPatchBytes: 1 },
  };
}

function coverage(
  files: Array<{ path: string; status: CoverageStatus; shardId: string }>,
): ReviewCoverage {
  return {
    files,
    totals: { files: files.length, byStatus: {} as never },
  };
}

function job(
  round: number,
  shardId: string | undefined,
  status: RetryJobState['status'],
): RetryJobState {
  return { round, shardId, status };
}

describe('retry target selection', () => {
  it('retries only shards whose files failed, not pending or completed shards', () => {
    const targets = retryTargetShardIds({
      plan: plan(['shard_001', 'shard_002', 'shard_003']),
      round: 1,
      reportedShardIds: new Set(['shard_001']),
      coverage: coverage([
        { path: 'one.ts', status: 'deep-reviewed', shardId: 'shard_001' },
        { path: 'two.ts', status: 'failed', shardId: 'shard_002' },
        { path: 'three.ts', status: 'pending', shardId: 'shard_003' },
      ]),
      jobs: [],
    });

    expect(targets).toEqual(['shard_002']);
  });

  it('treats a failed job as failed while its coverage is still pending', () => {
    const targets = retryTargetShardIds({
      plan: plan(['shard_001', 'shard_002', 'shard_003']),
      round: 1,
      reportedShardIds: new Set(['shard_001']),
      coverage: coverage([
        { path: 'one.ts', status: 'deep-reviewed', shardId: 'shard_001' },
        { path: 'two.ts', status: 'pending', shardId: 'shard_002' },
        { path: 'three.ts', status: 'pending', shardId: 'shard_003' },
      ]),
      jobs: [job(1, 'shard_002', 'failed')],
    });

    expect(targets).toEqual(['shard_002']);
  });

  it('falls back to unreported shards when no failure is known yet', () => {
    const targets = retryTargetShardIds({
      plan: plan(['shard_001', 'shard_002']),
      round: 1,
      reportedShardIds: new Set(['shard_001']),
      coverage: coverage([
        { path: 'one.ts', status: 'deep-reviewed', shardId: 'shard_001' },
        { path: 'two.ts', status: 'pending', shardId: 'shard_002' },
      ]),
      jobs: [],
    });

    expect(targets).toEqual(['shard_002']);
  });
});
