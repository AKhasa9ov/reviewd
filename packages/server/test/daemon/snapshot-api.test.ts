import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from '../../src/daemon/server.js';
import type { ReviewDaemon } from '../../src/daemon/types.js';
import { makeRepo } from '../../../core/test/helpers/repo.js';

const TOKEN = 'test-token-0123456789abcdef0123456789';
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

interface SnapshotBody {
  round: number;
  file?: string;
  snapshot: {
    schemaVersion: number;
    files: Array<{ path: string }>;
    manifest?: {
      files: Array<{ path: string; reason?: string }>;
      totals: { files: number };
    };
    totals: { files: number };
  };
}

async function running(): Promise<{ daemonUrl: string }> {
  const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-snapshot-'));
  const daemon: ReviewDaemon = await startDaemon({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token: TOKEN,
    longPollMs: 120,
    heartbeatMs: 50,
    jobLeaseMs: 200,
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

async function threeFileRepo(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'one\n');
  await repo.write('src/b.ts', 'one\n');
  await repo.write('src/c.ts', 'one\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo\n');
  await repo.write('src/b.ts', 'one\ntwo\n');
  await repo.write('src/c.ts', 'one\ntwo\n');
  await repo.commit('feature');
  return repo;
}

describe('snapshot API manifest', () => {
  it('serves a v2 snapshot whose file-filtered view keeps the complete manifest', async () => {
    const { daemonUrl } = await running();
    const checkout = await threeFileRepo();

    const created = await fetch(`${daemonUrl}/api/reviews`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        repoRoot: checkout.root,
        title: 'Snapshot manifest',
        scope: { kind: 'range', baseRef: 'main', headRef: 'HEAD' },
        reviewer: { backend: 'none' },
      }),
    });
    expect(created.status).toBe(201);
    const reviewId = ((await created.json()) as { review: { review: { id: string } } }).review
      .review.id;

    const snapshotResponse = await fetch(`${daemonUrl}/api/reviews/${reviewId}/snapshot?round=1`, {
      headers: headers(),
    });
    expect(snapshotResponse.status).toBe(200);
    const body = (await snapshotResponse.json()) as SnapshotBody;

    expect(body.snapshot.schemaVersion).toBe(2);
    expect(body.snapshot.files.map((file) => file.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
    expect(body.snapshot.manifest?.files.map((file) => file.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
    expect(body.snapshot.manifest?.totals.files).toBe(3);

    // Selecting one file bounds the render payload but must not shrink the manifest.
    const filteredResponse = await fetch(
      `${daemonUrl}/api/reviews/${reviewId}/snapshot?round=1&file=src/a.ts`,
      { headers: headers() },
    );
    expect(filteredResponse.status).toBe(200);
    const filtered = (await filteredResponse.json()) as SnapshotBody;

    expect(filtered.file).toBe('src/a.ts');
    expect(filtered.snapshot.files.map((file) => file.path)).toEqual(['src/a.ts']);
    expect(filtered.snapshot.manifest?.files).toHaveLength(3);
    expect(filtered.snapshot.totals.files).toBe(3);
  });
});
