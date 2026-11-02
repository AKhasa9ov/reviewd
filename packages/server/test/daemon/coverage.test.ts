import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo } from '../../../core/test/helpers/repo.js';
import type { TestRepo } from '../../../core/test/helpers/repo.js';
import type { Snapshot } from '@sir_yami/reviewd-core';
import { coverageForSnapshot } from '../../src/daemon/routes.js';
import { startDaemon } from '../../src/daemon/server.js';
import type { ReviewDaemon } from '../../src/daemon/types.js';

const TOKEN = 'test-token-0123456789abcdef0123456789';
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .reverse()
      .map(async (cleanup) => cleanup()),
  );
});

interface Running {
  daemonUrl: string;
}

async function running(): Promise<Running> {
  const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-coverage-'));
  const daemon: ReviewDaemon = await startDaemon({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token: TOKEN,
    longPollMs: 120,
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

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...extra };
}

function bigFile(): string {
  return [
    'one',
    ...Array.from({ length: 1200 }, (_, index) => `const value${index} = "${'x'.repeat(80)}";`),
  ].join('\n');
}

async function truncatedRepo(): Promise<TestRepo> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/big.ts', 'one\n');
  await repo.write('src/small.ts', 'one\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/big.ts', `${bigFile()}\n`);
  await repo.write('src/small.ts', 'one\ntwo\n');
  await repo.commit('feature');
  return repo;
}

async function smallRepo(): Promise<TestRepo> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'one\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo\n');
  await repo.commit('feature');
  return repo;
}

interface ReviewViewBody {
  review: {
    id: string;
    agent?: {
      status: string;
      round?: number;
      coverage?: {
        files: Array<{ path: string; status: string; reason?: string; shardId?: string }>;
        totals: {
          files: number;
          byStatus: Record<string, number>;
        };
      };
    };
  };
}

async function createReview(daemonUrl: string, repoRoot: string): Promise<string> {
  const response = await fetch(`${daemonUrl}/api/reviews`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repoRoot,
      title: 'Coverage review',
      scope: { kind: 'range', baseRef: 'main', headRef: 'HEAD' },
      reviewer: { backend: 'worker' },
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { review: ReviewViewBody };
  return body.review.review.id;
}

async function reviewView(daemonUrl: string, id: string): Promise<ReviewViewBody> {
  const response = await fetch(`${daemonUrl}/api/reviews/${id}`, { headers: headers() });
  expect(response.status).toBe(200);
  return (await response.json()) as ReviewViewBody;
}

async function leaseWorker(daemonUrl: string): Promise<{
  job: { id: string; attemptId: string; round: number };
  bundle: { prompt: string };
}> {
  const registered = await fetch(`${daemonUrl}/api/workers/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'coverage-worker', harness: 'dsh' }),
  });
  expect(registered.status).toBe(201);
  const worker = (await registered.json()) as { id: string };
  const leased = await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=2`, {
    headers: headers(),
  });
  expect(leased.status).toBe(200);
  return (await leased.json()) as {
    job: { id: string; attemptId: string; round: number };
    bundle: { prompt: string };
  };
}

async function report(daemonUrl: string, lease: Awaited<ReturnType<typeof leaseWorker>>) {
  const response = await fetch(`${daemonUrl}/api/jobs/${lease.job.id}/report`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      attemptId: lease.job.attemptId,
      report: {
        schemaVersion: 1,
        summary: 'No issues',
        riskLevel: 'low',
        findings: [],
        questions: [],
        tests: { ran: false, commands: [] },
        verification: [],
      },
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ accepted: true });
}

async function sseText(response: Response, token: string): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('missing SSE body');
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (!text.includes(token)) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

describe('daemon review coverage', () => {
  it('persists enqueue coverage and completes it after every shard reports', async () => {
    const { daemonUrl } = await running();
    const repo = await truncatedRepo();
    const reviewId = await createReview(daemonUrl, repo.root);

    const queued = await reviewView(daemonUrl, reviewId);
    expect(queued.review.agent?.status).toBe('queued');
    expect(queued.review.agent?.round).toBe(1);
    expect(queued.review.agent?.coverage?.files.map((file) => file.path)).toEqual([
      'src/big.ts',
      'src/small.ts',
    ]);
    expect(queued.review.agent?.coverage?.files.every((file) => file.status === 'pending')).toBe(
      true,
    );
    const shardIds = queued.review.agent?.coverage?.files.map((file) => file.shardId);
    expect(new Set(shardIds).size).toBe(2);
    expect(queued.review.agent?.coverage?.totals).toMatchObject({
      files: 2,
      byStatus: { pending: 2, skipped: 0, 'light-reviewed': 0 },
    });

    const persisted = await fetch(`${daemonUrl}/api/events?after=0&wait=0`, {
      headers: headers(),
    });
    expect(persisted.status).toBe(200);
    const globalEvents = (await persisted.json()) as {
      events: Array<{
        event: { type: string; data: { coverage?: { totals: { files: number } } } };
      }>;
    };
    const coverageEvents = globalEvents.events.filter(
      (entry) => entry.event.type === 'agent/coverage',
    );
    expect(coverageEvents).toHaveLength(1);
    expect(coverageEvents[0]?.event.data.coverage?.totals.files).toBe(2);

    const sse = await fetch(`${daemonUrl}/api/reviews/${reviewId}/events?after=0`, {
      headers: headers({ accept: 'text/event-stream' }),
    });
    expect(sse.status).toBe(200);
    expect(await sseText(sse, 'event: agent/coverage')).toContain('event: agent/coverage');

    const first = await leaseWorker(daemonUrl);
    expect(first.job.round).toBe(1);
    expect(first.bundle.prompt).toContain('src/big.ts');
    expect(first.bundle.prompt).not.toContain('src/small.ts');
    await report(daemonUrl, first);

    const midway = await reviewView(daemonUrl, reviewId);
    expect(midway.review.agent?.status).toBe('running');
    expect(midway.review.agent?.coverage?.totals.byStatus.pending).toBe(1);

    const second = await leaseWorker(daemonUrl);
    expect(second.bundle.prompt).toContain('src/small.ts');
    expect(second.bundle.prompt).not.toContain('src/big.ts');
    await report(daemonUrl, second);

    const reported = await reviewView(daemonUrl, reviewId);
    expect(reported.review.agent?.status).toBe('done');
    expect(reported.review.agent?.coverage?.totals.byStatus).toMatchObject({
      pending: 0,
      skipped: 0,
      'deep-reviewed': 2,
      'light-reviewed': 0,
    });
  });

  it('keeps a small fully included review done after the report', async () => {
    const { daemonUrl } = await running();
    const repo = await smallRepo();
    const reviewId = await createReview(daemonUrl, repo.root);

    const queued = await reviewView(daemonUrl, reviewId);
    expect(queued.review.agent?.coverage?.files).toMatchObject([
      { path: 'src/a.ts', status: 'pending' },
    ]);
    expect(queued.review.agent?.coverage?.files[0]?.shardId).toMatch(/^shard_\d{3}$/);
    expect(queued.review.agent?.coverage?.totals.byStatus.skipped).toBe(0);

    const lease = await leaseWorker(daemonUrl);
    expect(lease.bundle.prompt).toContain('src/a.ts');
    await report(daemonUrl, lease);

    const reported = await reviewView(daemonUrl, reviewId);
    expect(reported.review.agent?.status).toBe('done');
    expect(reported.review.agent?.coverage?.totals.byStatus).toMatchObject({
      pending: 0,
      'deep-reviewed': 1,
      'light-reviewed': 0,
      skipped: 0,
    });
  });

  it('does not attach coverage to legacy v1 snapshots', () => {
    const manifest = {
      schemaVersion: 1 as const,
      scope: {
        kind: 'range' as const,
        repoRoot: '/tmp/repo',
        baseSha: 'a'.repeat(40),
        headSha: 'b'.repeat(40),
        label: 'aaaaaaa..bbbbbbb',
        worktreeDigest: 'b'.repeat(40),
      },
      files: [
        {
          path: 'src/a.ts',
          status: 'modified' as const,
          binary: false,
          ignored: false,
          oversized: false,
          added: 1,
          deleted: 0,
          hunkCount: 1,
          patchBytes: 10,
        },
      ],
      totals: { files: 1, added: 1, deleted: 0, patchBytes: 10 },
      warnings: [],
    };

    expect(
      coverageForSnapshot({ schemaVersion: 1 } as unknown as Snapshot, ['src/a.ts']),
    ).toBeUndefined();
    expect(
      coverageForSnapshot({ schemaVersion: 2 } as unknown as Snapshot, ['src/a.ts']),
    ).toBeUndefined();
    expect(
      coverageForSnapshot({ schemaVersion: 2, manifest } as unknown as Snapshot, ['src/a.ts'])
        ?.files,
    ).toEqual([{ path: 'src/a.ts', status: 'pending' }]);
  });
});
