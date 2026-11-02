/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReviewManifest } from '@sir_yami/reviewd-core';
import { makeRepo } from '../../../core/test/helpers/repo.js';
import { JobQueue } from '../../src/daemon/jobs.js';
import { startDaemon } from '../../src/daemon/server.js';
import { PROMPT_VERSION, PROTOCOL_VERSION } from '../../src/daemon/types.js';
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

function manifest(): ReviewManifest {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/repo',
      baseRef: 'main',
      headRef: 'HEAD',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      label: 'main..HEAD',
      worktreeDigest: 'digest',
    },
    files: [
      {
        path: 'src/a.ts',
        status: 'modified',
        binary: false,
        ignored: false,
        oversized: false,
        added: 1,
        deleted: 0,
        hunkCount: 1,
        patchBytes: 33,
      },
    ],
    totals: { files: 1, added: 1, deleted: 0, patchBytes: 33 },
    warnings: [],
  };
}

async function daemonForRepo(): Promise<{
  daemon: ReviewDaemon;
  repo: Awaited<ReturnType<typeof makeRepo>>;
}> {
  const storeDir = await mkdtemp(join(tmpdir(), 'cr-jobs-protocol-'));
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
): Promise<string> {
  const response = await fetch(`${daemon.url}/api/reviews`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repoRoot: repo.root,
      title: 'Protocol v1',
      scope: { kind: 'range', baseRef: 'main', headRef: 'HEAD' },
      reviewer: { backend: 'worker' },
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
    body: JSON.stringify({ name: 'protocol-test', harness: 'dsh' }),
  });
  expect(registered.status).toBe(201);
  const worker = (await registered.json()) as any;
  const lease = await fetch(`${daemon.url}/api/jobs/next?workerId=${worker.id}&wait=1`, {
    headers: headers(),
  });
  expect(lease.status).toBe(200);
  return lease.json();
}

describe('worker protocol v1', () => {
  it('leases protocol v1 on the job and inside the bundle, keeping the { job, bundle } envelope', async () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(PROMPT_VERSION).toBe(1);
    const { daemon, repo } = await daemonForRepo();
    await createReview(daemon, repo);
    const payload = await leaseForNewJob(daemon);

    expect(Object.keys(payload).sort()).toEqual(['bundle', 'job']);
    expect(payload.job.protocolVersion).toBe(1);
    expect(payload.job.promptVersion).toBe(1);
    expect(payload.bundle.protocolVersion).toBe(1);
    expect(payload.bundle.promptVersion).toBe(1);
    expect(payload.job.bundle).toBeUndefined();
    // The v2 snapshot manifest is transported on the bundle, not just in bundle.diff.
    expect(payload.bundle.manifest?.schemaVersion).toBe(1);
    expect(Array.isArray(payload.bundle.manifest?.files)).toBe(true);
    expect(payload.bundle.manifest.files).not.toHaveLength(0);
    expect(payload.bundle.manifest.files.map((file: any) => file.path)).toContain('src/a.ts');
    // The bundled contract is harness-neutral: it must not carry model or token policy.
    expect(payload.job).not.toHaveProperty('model');
    expect(payload.bundle).not.toHaveProperty('model');
    expect(payload.bundle).not.toHaveProperty('maxTokens');
    expect(payload.bundle).not.toHaveProperty('token');
  }, 30_000);
});

describe('JobQueue protocol fields', () => {
  it('persists enqueued versions and manifest and returns them on the lease', async () => {
    const queue = new JobQueue({ leaseMs: 60_000 });
    try {
      const worker = queue.register({ name: 'queue-test', harness: 'dsh' });
      const reviewManifest = manifest();
      const job = queue.enqueue({
        reviewId: 'rev_1',
        round: 1,
        kind: 'initial',
        backend: 'worker',
        prompt: 'Review this diff',
        diff: null,
        protocolVersion: 1,
        promptVersion: 1,
        manifest: reviewManifest,
      });

      expect(job.protocolVersion).toBe(1);
      expect(job.promptVersion).toBe(1);
      expect(job.manifest).toEqual(reviewManifest);
      expect(queue.job(job.id)?.manifest).toEqual(reviewManifest);

      const lease = await queue.next(worker.id, 0);
      expect(lease).not.toBeNull();
      expect(lease?.protocolVersion).toBe(1);
      expect(lease?.promptVersion).toBe(1);
      expect(lease?.bundle.protocolVersion).toBe(1);
      expect(lease?.bundle.promptVersion).toBe(1);
      expect(lease?.bundle.manifest).toEqual(reviewManifest);
    } finally {
      queue.close();
    }
  });

  it('defaults an enqueue without versions to protocol v1', () => {
    const queue = new JobQueue({ leaseMs: 60_000 });
    try {
      const job = queue.enqueue({
        reviewId: 'rev_1',
        round: 1,
        kind: 'initial',
        backend: 'worker',
        prompt: 'Review this diff',
        diff: null,
      });

      expect(job.protocolVersion).toBe(1);
      expect(job.promptVersion).toBe(1);
      expect(job.manifest).toBeUndefined();
    } finally {
      queue.close();
    }
  });
});
