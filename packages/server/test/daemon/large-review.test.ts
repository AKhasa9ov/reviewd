import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo } from '../../../core/test/helpers/repo.js';
import {
  LARGE_REVIEW_FILE_COUNT,
  seedLargeReview,
} from '../../../core/test/helpers/large-review-fixture.js';
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

async function running(): Promise<{ daemonUrl: string }> {
  const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-large-review-'));
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

function headers(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
}

interface CoverageFile {
  path: string;
  status: string;
  reason?: string;
  shardId?: string;
}

interface Coverage {
  files: CoverageFile[];
  totals: {
    files: number;
    byStatus: Record<string, number>;
  };
  incomplete?: boolean;
}

interface ReviewBody {
  review: {
    id: string;
    agent?: {
      status: string;
      round?: number;
      coverage?: Coverage;
      shards?: Array<{ shardId: string; shardIndex: number; shardCount: number }>;
    };
  };
}

interface LeaseBody {
  job: {
    id: string;
    reviewId: string;
    round: number;
    kind: string;
    attemptId: string;
    protocolVersion: number;
    promptVersion: number;
    shardId: string;
    shardIndex: number;
    shardCount: number;
    effort: 'deep' | 'light';
    moduleId: string;
  };
  bundle: {
    protocolVersion: number;
    promptVersion: number;
    prompt: string;
    manifest: {
      schemaVersion: number;
      files: Array<{ path: string; reason?: string }>;
      totals: { files: number };
    };
    meta: { paths: string[]; shardId: string };
  };
}

async function createReview(daemonUrl: string, repoRoot: string): Promise<string> {
  const response = await fetch(`${daemonUrl}/api/reviews`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repoRoot,
      title: 'Large review',
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

async function registerWorker(daemonUrl: string): Promise<string> {
  const registered = await fetch(`${daemonUrl}/api/workers/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'large-review-worker', harness: 'dsh' }),
  });
  expect(registered.status).toBe(201);
  const worker = (await registered.json()) as { id: string };
  return worker.id;
}

async function leaseNext(daemonUrl: string, workerId: string): Promise<LeaseBody | null> {
  const leased = await fetch(`${daemonUrl}/api/jobs/next?workerId=${workerId}&wait=1`, {
    headers: headers(),
  });
  if (leased.status === 204) return null;
  expect(leased.status).toBe(200);
  return (await leased.json()) as LeaseBody;
}

async function acceptEmptyReport(daemonUrl: string, lease: LeaseBody): Promise<void> {
  const response = await fetch(`${daemonUrl}/api/jobs/${lease.job.id}/report`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      attemptId: lease.job.attemptId,
      report: {
        schemaVersion: 1,
        summary: 'No issues found',
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

/** Paths whose complete header was rendered into the prompt. */
function promptPaths(prompt: string): string[] {
  const lines = prompt.split('\n');
  const paths: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (match === null) continue;
    for (let look = index + 1; look < Math.min(index + 4, lines.length); look += 1) {
      const next = lines[look] ?? '';
      if (next.startsWith('diff --git ')) break;
      if (next.startsWith('+++ ') || next.startsWith('Binary files ')) {
        const path = match[2] ?? match[1];
        if (path !== undefined) paths.push(path);
        break;
      }
    }
  }
  return paths;
}

describe('large review sharding', () => {
  it('reviews every one of the 882 paths through bounded shard jobs', async () => {
    const { daemonUrl } = await running();
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    const expectedPaths = await seedLargeReview(repo);
    expect(expectedPaths).toHaveLength(LARGE_REVIEW_FILE_COUNT);

    const reviewId = await createReview(daemonUrl, repo.root);

    const queued = await reviewView(daemonUrl, reviewId);
    const queuedCoverage = queued.review.agent?.coverage;
    expect(queued.review.agent?.status).toBe('queued');
    expect(queued.review.agent?.round).toBe(1);
    expect(queuedCoverage?.files).toHaveLength(LARGE_REVIEW_FILE_COUNT);
    expect(queuedCoverage?.totals.files).toBe(LARGE_REVIEW_FILE_COUNT);
    expect(new Set(queuedCoverage?.files.map((file) => file.path))).toEqual(new Set(expectedPaths));
    expect(queuedCoverage?.totals.byStatus).toMatchObject({
      pending: LARGE_REVIEW_FILE_COUNT,
      'deep-reviewed': 0,
      'light-reviewed': 0,
      skipped: 0,
      'manifest-only': 0,
      failed: 0,
    });

    const workerId = await registerWorker(daemonUrl);
    let leases = 0;
    let shardCount: number | undefined;
    const leasedShardIds = new Set<string>();
    const coveredPaths = new Set<string>();

    for (;;) {
      const lease = await leaseNext(daemonUrl, workerId);
      if (lease === null) break;
      leases += 1;
      expect(leases).toBeLessThan(200);
      expect(lease.job.reviewId).toBe(reviewId);
      expect(lease.job.round).toBe(1);
      expect(lease.job.kind).toBe('initial');
      expect(lease.job.shardId).toMatch(/^shard_\d{3}$/);
      expect(lease.job.shardIndex).toBeGreaterThanOrEqual(0);
      shardCount ??= lease.job.shardCount;
      expect(lease.job.shardCount).toBe(shardCount);
      expect(lease.job.shardIndex).toBeLessThan(lease.job.shardCount);
      expect(lease.job.effort).toBe('deep');
      expect(lease.job.moduleId).toBe('src');
      expect(leasedShardIds.has(lease.job.shardId)).toBe(false);
      leasedShardIds.add(lease.job.shardId);

      expect(lease.bundle.protocolVersion).toBe(1);
      expect(lease.bundle.promptVersion).toBe(1);
      expect(lease.bundle.manifest.schemaVersion).toBe(1);
      expect(lease.bundle.manifest.files.length).toBe(lease.bundle.meta.paths.length);
      expect(lease.bundle.manifest.totals.files).toBe(lease.bundle.meta.paths.length);
      expect(lease.bundle.meta.shardId).toBe(lease.job.shardId);
      expect(lease.bundle.meta.paths.length).toBeGreaterThan(0);
      expect(lease.bundle.meta.paths.length).toBeLessThanOrEqual(12);
      expect(lease.bundle.prompt).toContain(
        `Shard: ${lease.job.shardIndex + 1}/${lease.job.shardCount} (deep, module src)`,
      );

      // The prompt is a complete shard: every file assigned to it is present,
      // and no file from another shard leaks in.
      const included = new Set(promptPaths(lease.bundle.prompt));
      expect(included).toEqual(new Set(lease.bundle.meta.paths));
      expect(lease.bundle.prompt.length).toBeLessThan(200_000);
      for (const path of included) coveredPaths.add(path);

      await acceptEmptyReport(daemonUrl, lease);
    }

    expect(leases).toBeGreaterThan(1);
    expect(shardCount).toBe(leases);
    expect(coveredPaths).toEqual(new Set(expectedPaths));

    const reported = await reviewView(daemonUrl, reviewId);
    const agent = reported.review.agent;
    const coverage = agent?.coverage;
    expect(agent?.status).toBe('done');
    expect(coverage?.files).toHaveLength(LARGE_REVIEW_FILE_COUNT);
    expect(coverage?.incomplete).toBeUndefined();
    expect(coverage?.totals.byStatus).toMatchObject({
      pending: 0,
      'deep-reviewed': LARGE_REVIEW_FILE_COUNT,
      'light-reviewed': 0,
      skipped: 0,
      'manifest-only': 0,
      failed: 0,
    });
    expect(agent?.shards).toHaveLength(leases);
    expect(new Set(agent?.shards?.map((shard) => shard.shardId))).toEqual(leasedShardIds);
    for (const file of coverage?.files ?? []) {
      expect(file.status).toBe('deep-reviewed');
      expect(file.shardId).toMatch(/^shard_\d{3}$/);
      expect(file.reason).toBeUndefined();
    }

    // Snapshot v2 keeps the complete manifest alongside its bounded render set.
    const snapshotResponse = await fetch(`${daemonUrl}/api/reviews/${reviewId}/snapshot?round=1`, {
      headers: headers(),
    });
    expect(snapshotResponse.status).toBe(200);
    const snapshot = (await snapshotResponse.json()) as {
      snapshot: {
        schemaVersion: number;
        files: Array<{ path: string }>;
        manifest: { files: Array<{ path: string }> };
        totals: { truncated: boolean };
      };
    };
    expect(snapshot.snapshot.schemaVersion).toBe(2);
    expect(snapshot.snapshot.manifest.files).toHaveLength(LARGE_REVIEW_FILE_COUNT);
    expect(snapshot.snapshot.files.length).toBeLessThanOrEqual(500);
    expect(snapshot.snapshot.files.length).toBeGreaterThan(0);
    expect(snapshot.snapshot.totals.truncated).toBe(true);

    // A path omitted from the bounded render set is still retrievable lazily.
    const lazy = await fetch(
      `${daemonUrl}/api/reviews/${reviewId}/snapshot/1/file?path=${encodeURIComponent('src/file-881.ts')}`,
      { headers: headers() },
    );
    expect(lazy.status).toBe(200);
    const lazyBody = (await lazy.json()) as {
      file: string;
      side: string;
      lineCount: number;
      lines: string[];
    };
    expect(lazyBody).toMatchObject({ file: 'src/file-881.ts', side: 'new', lineCount: 96 });
    expect(lazyBody.lines).toHaveLength(96);
  }, 120_000);
});
