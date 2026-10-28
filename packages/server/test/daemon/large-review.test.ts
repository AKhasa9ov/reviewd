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
      .map(async (cleanup) => cleanup()),
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
}

interface Coverage {
  files: CoverageFile[];
  totals: {
    files: number;
    byStatus: Record<string, number>;
  };
}

interface ReviewBody {
  review: {
    id: string;
    agent?: {
      status: string;
      round?: number;
      coverage?: Coverage;
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

async function leaseWorker(daemonUrl: string): Promise<LeaseBody> {
  const registered = await fetch(`${daemonUrl}/api/workers/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'large-review-worker', harness: 'dsh' }),
  });
  expect(registered.status).toBe(201);
  const worker = (await registered.json()) as { id: string };
  const leased = await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=2`, {
    headers: headers(),
  });
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

/**
 * Paths whose complete header was rendered into the prompt. This mirrors the
 * header the daemon emits (`diff --git`, `---`, `+++` for text; the `Binary
 * files` line for binaries), so a header cut by the budget is not counted.
 */
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

describe('large review coverage', () => {
  it('exposes all 882 manifest paths and stays partial after an accepted report', async () => {
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
    const coveragePaths = queuedCoverage?.files.map((file) => file.path) ?? [];
    expect(new Set(coveragePaths)).toEqual(new Set(expectedPaths));

    const lease = await leaseWorker(daemonUrl);
    expect(lease.job.reviewId).toBe(reviewId);
    expect(lease.job.round).toBe(1);
    expect(lease.job.kind).toBe('initial');
    expect(lease.job.attemptId.length).toBeGreaterThan(0);
    expect(lease.job.protocolVersion).toBe(1);
    expect(lease.job.promptVersion).toBe(1);
    expect(lease.bundle.protocolVersion).toBe(1);
    expect(lease.bundle.promptVersion).toBe(1);
    expect(lease.bundle.manifest.schemaVersion).toBe(1);
    expect(lease.bundle.manifest.files).toHaveLength(LARGE_REVIEW_FILE_COUNT);
    expect(lease.bundle.manifest.totals.files).toBe(LARGE_REVIEW_FILE_COUNT);
    const manifestPaths = lease.bundle.manifest.files.map((file) => file.path);
    expect(new Set(manifestPaths)).toEqual(new Set(expectedPaths));

    // The prompt is bounded: only a small prefix of the 882 files was rendered.
    const includedPaths = new Set(promptPaths(lease.bundle.prompt));
    expect(includedPaths.size).toBeGreaterThan(0);
    expect(includedPaths.size).toBeLessThan(100);
    const omittedPaths = expectedPaths.filter((path) => !includedPaths.has(path));
    expect(omittedPaths.length).toBeGreaterThan(700);

    // Every rendered file is pending; every omitted path is explicitly skipped
    // with the manifest/prompt reason, never silently pending or done.
    const pendingPaths = new Set(
      (queuedCoverage?.files ?? [])
        .filter((file) => file.status === 'pending')
        .map((file) => file.path),
    );
    expect(pendingPaths).toEqual(includedPaths);
    const omitted = (queuedCoverage?.files ?? []).filter((file) => !includedPaths.has(file.path));
    expect(new Set(omitted.map((file) => file.path))).toEqual(new Set(omittedPaths));
    for (const file of omitted) {
      expect(file.status).toBe('skipped');
      expect(['render-budget', 'diff-truncated', 'per-file-cap']).toContain(file.reason);
    }
    expect(omitted.some((file) => file.reason === 'render-budget')).toBe(true);
    expect(queuedCoverage?.totals.byStatus).toMatchObject({
      pending: includedPaths.size,
      skipped: omittedPaths.length,
      'deep-reviewed': 0,
      'light-reviewed': 0,
      'manifest-only': 0,
      deferred: 0,
      failed: 0,
    });

    await acceptEmptyReport(daemonUrl, lease);

    const reported = await reviewView(daemonUrl, reviewId);
    const agent = reported.review.agent;
    const coverage = agent?.coverage;
    expect(agent?.status).toBe('partial');
    expect(agent?.status).not.toBe('done');
    expect(coverage?.files).toHaveLength(LARGE_REVIEW_FILE_COUNT);
    expect(coverage?.totals.byStatus).toMatchObject({
      pending: 0,
      'light-reviewed': includedPaths.size,
      skipped: omittedPaths.length,
      'deep-reviewed': 0,
      'manifest-only': 0,
      deferred: 0,
      failed: 0,
    });
    for (const file of coverage?.files ?? []) {
      if (!includedPaths.has(file.path)) {
        expect(file.status).toBe('skipped');
        expect(file.reason).toBeDefined();
      }
    }

    // The snapshot API keeps the full manifest alongside the bounded render set.
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
  });
});
