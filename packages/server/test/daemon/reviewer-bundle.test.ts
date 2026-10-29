/* eslint-disable @typescript-eslint/no-explicit-any */
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
      .map((cleanup) => cleanup()),
  );
});

function headers(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
}

async function daemonForRepo(): Promise<{
  daemon: ReviewDaemon;
  repo: Awaited<ReturnType<typeof makeRepo>>;
}> {
  const storeDir = await mkdtemp(join(tmpdir(), 'cr-reviewer-bundle-'));
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'one\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo\n');
  await repo.commit('feature');
  const daemon = await startDaemon({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token: TOKEN,
    longPollMs: 60,
    heartbeatMs: 40,
    jobLeaseMs: 5000,
    rateLimit: { mutations: 100, reads: 1000, windowMs: 60_000 },
  });
  cleanups.push(async () => {
    await daemon.close();
    await rm(storeDir, { recursive: true, force: true });
  });
  return { daemon, repo };
}

async function createReview(
  daemon: ReviewDaemon,
  repo: Awaited<ReturnType<typeof makeRepo>>,
  title: string,
): Promise<string> {
  const response = await fetch(`${daemon.url}/api/reviews`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repoRoot: repo.root,
      title,
      scope: { kind: 'range', baseRef: 'main', headRef: 'HEAD' },
      reviewer: { backend: 'worker' },
      initiator: { harness: 'dsh', sessionId: 'session_42', cwd: repo.root },
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as any;
  return body.review.review.id as string;
}

async function leaseForNewJob(daemon: ReviewDaemon): Promise<any> {
  const registered = await fetch(`${daemon.url}/api/workers/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'bundle-test', harness: 'dsh' }),
  });
  expect(registered.status).toBe(201);
  const worker = (await registered.json()) as any;
  const lease = await fetch(`${daemon.url}/api/jobs/next?workerId=${worker.id}&wait=1`, {
    headers: headers(),
  });
  expect(lease.status).toBe(200);
  return lease.json();
}

describe('worker job bundle', () => {
  it('renders a bounded unified diff and carries the initiator and cwd', async () => {
    const { daemon, repo } = await daemonForRepo();
    const reviewId = await createReview(daemon, repo, 'Bundle diff');
    const lease = await leaseForNewJob(daemon);
    const bundle = lease.bundle as any;

    expect(bundle.meta).toMatchObject({
      reviewId,
      round: 1,
      cwd: repo.root,
      kind: 'initial',
      initiator: { harness: 'dsh', sessionId: 'session_42', cwd: repo.root },
    });
    expect(bundle.prompt).toContain('--- a/src/a.ts');
    expect(bundle.prompt).toContain('+++ b/src/a.ts');
    expect(bundle.prompt).toContain('+two');
    expect(bundle.prompt).toContain('Read-only review');
    expect(bundle.prompt.length).toBeLessThan(70_000);
    expect(bundle.prompt).not.toContain('"oldLines"');
  }, 30_000);

  it('puts a very large file in its own still-bounded shard', async () => {
    const { daemon, repo } = await daemonForRepo();
    const lines = Array.from(
      { length: 4000 },
      (_, index) => `line ${index} ${'x'.repeat(40)}`,
    ).join('\n');
    await repo.write('src/big.ts', `${lines}\n`);
    await repo.commit('big file');
    await createReview(daemon, repo, 'Bundle cap');

    const first = await leaseForNewJob(daemon);
    expect(first.job.shardCount).toBe(2);
    expect(first.bundle.prompt).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(first.bundle.prompt).not.toContain('src/big.ts');

    const second = await leaseForNewJob(daemon);
    expect(second.job.shardId).not.toBe(first.job.shardId);
    const prompt = second.bundle.prompt as string;
    expect(prompt.length).toBeLessThanOrEqual(230_000);
    expect(prompt).not.toContain('[diff truncated');
    expect(prompt).toContain('diff --git a/src/big.ts b/src/big.ts');
    expect(prompt).toContain('line 3999');
  }, 30_000);
});
