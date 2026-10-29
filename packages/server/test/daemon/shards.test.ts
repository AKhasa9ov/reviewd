import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo } from '../../../core/test/helpers/repo.js';
import { startDaemon } from '../../src/daemon/server.js';
import type { ReviewDaemon } from '../../src/daemon/types.js';

const TOKEN = 'test-token-0123456789abcdef0123456789';
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .reverse()
      .map(async (cleanup) => await cleanup()),
  );
});

function headers(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
}

async function running(): Promise<{ daemonUrl: string }> {
  const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-shards-'));
  const daemon: ReviewDaemon = await startDaemon({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token: TOKEN,
    longPollMs: 50,
    heartbeatMs: 50,
    jobLeaseMs: 5000,
    rateLimit: { mutations: 100, reads: 1000, windowMs: 60_000 },
  });
  cleanups.push(async () => {
    await daemon.close();
    await rm(storeDir, { recursive: true, force: true });
  });
  return { daemonUrl: daemon.url };
}

interface LeaseBody {
  job: {
    id: string;
    attemptId: string;
    shardId: string;
    shardIndex: number;
    shardCount: number;
  };
  bundle: { meta: { paths: string[] } };
}

interface ReviewBody {
  review: {
    agent?: {
      status: string;
      coverage?: {
        files: Array<{ path: string; status: string; reason?: string; shardId?: string }>;
        totals: { byStatus: Record<string, number> };
      };
      shards?: Array<{ shardId: string }>;
    };
    report?: {
      findings: Array<{ id: string }>;
      warnings: string[];
    };
  };
}

async function createReview(daemonUrl: string, repoRoot: string): Promise<string> {
  const response = await fetch(`${daemonUrl}/api/reviews`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repoRoot,
      title: 'Two shards',
      scope: { kind: 'range', baseRef: 'main', headRef: 'HEAD' },
      reviewer: { backend: 'worker' },
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { review: { review: { id: string } } };
  return body.review.review.id;
}

async function reviewView(daemonUrl: string, id: string): Promise<ReviewBody> {
  const response = await fetch(`${daemonUrl}/api/reviews/${id}`, { headers: headers() });
  expect(response.status).toBe(200);
  return (await response.json()) as ReviewBody;
}

async function leaseNext(daemonUrl: string, workerId: string): Promise<LeaseBody | null> {
  const response = await fetch(`${daemonUrl}/api/jobs/next?workerId=${workerId}&wait=1`, {
    headers: headers(),
  });
  if (response.status === 204) return null;
  expect(response.status).toBe(200);
  return (await response.json()) as LeaseBody;
}

describe('shard aggregation', () => {
  it('keeps a failed shard failed and namespaces findings from the completed shard', async () => {
    const { daemonUrl } = await running();
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    for (let index = 0; index < 13; index += 1) {
      await repo.write(
        `src/file-${String(index).padStart(3, '0')}.ts`,
        `export const value${index} = ${index};\n`,
      );
    }
    await repo.commit('feature');

    const reviewId = await createReview(daemonUrl, repo.root);
    const registered = await fetch(`${daemonUrl}/api/workers/register`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: 'shard-worker', harness: 'dsh' }),
    });
    expect(registered.status).toBe(201);
    const worker = (await registered.json()) as { id: string };

    const first = await leaseNext(daemonUrl, worker.id);
    expect(first).not.toBeNull();
    if (first === null) throw new Error('expected first shard');
    expect(first.job.shardCount).toBe(2);
    const findingPath = first.bundle.meta.paths[0];
    expect(findingPath).toBeDefined();
    const reported = await fetch(`${daemonUrl}/api/jobs/${first.job.id}/report`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        attemptId: first.job.attemptId,
        report: {
          schemaVersion: 1,
          summary: 'first shard done',
          riskLevel: 'medium',
          findings: [
            {
              id: 'f1',
              severity: 'major',
              category: 'correctness',
              confidence: 'high',
              kind: 'issue',
              file: findingPath,
              lineStart: 1,
              lineEnd: 1,
              title: 'a finding',
              rationale: 'because',
              evidence: 'export const',
            },
          ],
          questions: [],
          tests: { ran: false, commands: [] },
          verification: [],
        },
      }),
    });
    expect(reported.status).toBe(200);

    const afterFirst = await reviewView(daemonUrl, reviewId);
    expect(afterFirst.review.agent?.status).toBe('running');
    expect(afterFirst.review.agent?.shards).toHaveLength(1);
    expect(afterFirst.review.agent?.coverage?.totals.byStatus).toMatchObject({
      pending: 1,
      'deep-reviewed': 12,
    });

    const second = await leaseNext(daemonUrl, worker.id);
    expect(second).not.toBeNull();
    if (second === null) throw new Error('expected second shard');
    const failed = await fetch(`${daemonUrl}/api/jobs/${second.job.id}/fail`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        attemptId: second.job.attemptId,
        retryable: false,
        code: 'crash',
        message: 'reviewer crashed',
      }),
    });
    expect(failed.status).toBe(200);

    const final = await reviewView(daemonUrl, reviewId);
    const agent = final.review.agent;
    expect(agent?.status).toBe('partial');
    expect(agent?.shards).toHaveLength(1);
    expect(agent?.coverage?.totals.byStatus).toMatchObject({
      'deep-reviewed': 12,
      failed: 1,
      pending: 0,
    });
    const failedFile = agent?.coverage?.files.find((file) => file.status === 'failed');
    expect(failedFile).toMatchObject({ reason: 'shard-failed' });
    expect(final.review.report?.findings[0]?.id).toBe(`${first.job.shardId}:f1`);
    expect(final.review.report?.warnings).toContain(`shard-failed:${second.job.shardId}`);
  }, 30_000);
});
