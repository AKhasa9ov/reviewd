import type { ReviewCoverage, ReviewPlan } from '@dsh-code-review/core';

export interface RetryJobState {
  round: number;
  status: 'queued' | 'leased' | 'done' | 'failed' | 'canceled';
  shardId?: string | undefined;
}

export interface RetryTargetInput {
  plan: Pick<ReviewPlan, 'shards'>;
  round: number;
  reportedShardIds: ReadonlySet<string>;
  coverage?: ReviewCoverage | undefined;
  jobs: readonly RetryJobState[];
}

/**
 * Picks the shards that a retry should run.
 *
 * Files already in the report are authoritative and must not be reviewed
 * again. Among the rest, prefer shards with an explicit failure (coverage or a
 * failed/canceled job). Pending-but-not-failed shards are only used as a
 * fallback when no failure was recorded at all, which keeps recovery after a
 * daemon restart possible without turning a partial review into a full rerun.
 */
export function retryTargetShardIds(input: RetryTargetInput): string[] {
  const reported = input.reportedShardIds;
  const failed = new Set<string>();
  let knownFailure = false;

  for (const file of input.coverage?.files ?? []) {
    if (file.status !== 'failed' || file.shardId === undefined) continue;
    knownFailure = true;
    if (!reported.has(file.shardId)) failed.add(file.shardId);
  }

  for (const job of input.jobs) {
    if (
      job.round !== input.round ||
      (job.status !== 'failed' && job.status !== 'canceled') ||
      job.shardId === undefined
    ) {
      continue;
    }
    knownFailure = true;
    if (!reported.has(job.shardId)) failed.add(job.shardId);
  }

  if (knownFailure) {
    return input.plan.shards.filter((shard) => failed.has(shard.id)).map((shard) => shard.id);
  }

  return input.plan.shards.filter((shard) => !reported.has(shard.id)).map((shard) => shard.id);
}
