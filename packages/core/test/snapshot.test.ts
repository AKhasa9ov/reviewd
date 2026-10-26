import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSnapshot, readBlob } from '../src/index.js';
import type * as ContentModule from '../src/git/content.js';
import type { Snapshot } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

vi.mock('../src/git/content.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ContentModule>();
  return { ...actual, readBlob: vi.fn(actual.readBlob) };
});

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

async function featureRepo(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'line1\nline2\nline3\n');
  await repo.write('src/keep.ts', 'keep\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'line1\nline2 changed\nline3\nline4\n');
  await repo.commit('feature');
  return repo;
}

async function snapshot(
  repoRoot: string,
  options: Partial<Parameters<typeof buildSnapshot>[0]> = {},
): Promise<Snapshot> {
  return await buildSnapshot({
    repoRoot,
    scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
    ...options,
  });
}

describe('buildSnapshot', () => {
  it('builds a range snapshot with stats, hunks and file content', async () => {
    const repo = await featureRepo();
    const result = await snapshot(repo.root);

    expect(result.schemaVersion).toBe(1);
    expect(result.scope.kind).toBe('range');
    expect(result.scope.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.totals.files).toBe(1);
    expect(result.totals.added).toBe(2);
    expect(result.totals.deleted).toBe(1);
    expect(result.totals.truncated).toBe(false);

    const file = result.files[0];
    expect(file?.path).toBe('src/a.ts');
    expect(file?.status).toBe('modified');
    expect(file?.added).toBe(2);
    expect(file?.deleted).toBe(1);
    expect(file?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(file?.oldLines).toEqual(['line1', 'line2', 'line3']);
    expect(file?.newLines).toEqual(['line1', 'line2 changed', 'line3', 'line4']);
    expect(file?.hunks).toHaveLength(1);
  });

  it('includes an added file and a deleted file', async () => {
    const repo = await featureRepo();
    await repo.write('src/added.ts', 'new\n');
    await repo.git('rm', 'src/keep.ts');
    await repo.commit('add and remove');

    const result = await snapshot(repo.root);
    const added = result.files.find((file) => file.path === 'src/added.ts');
    const deleted = result.files.find((file) => file.path === 'src/keep.ts');

    expect(added?.status).toBe('added');
    expect(added?.newLines).toEqual(['new']);
    expect(added?.oldLines).toBeUndefined();
    expect(added?.contentHash).toBe(createHash('sha256').update('new\n').digest('hex'));
    expect(deleted?.status).toBe('deleted');
    expect(deleted?.oldLines).toEqual(['keep']);
    expect(deleted?.newLines).toBeUndefined();
    expect(deleted?.contentHash).toBe(createHash('sha256').update('keep\n').digest('hex'));
  });

  it('snapshots uncommitted worktree changes', async () => {
    const repo = await featureRepo();
    await repo.git('checkout', 'main');
    await repo.write('src/a.ts', 'line1\nline2 worktree\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    expect(result.scope.headSha).toBeNull();
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.newLines).toEqual(['line1', 'line2 worktree']);
  });

  it('marks files over maxFileLines as oversized and skips their content', async () => {
    const repo = await featureRepo();
    const result = await snapshot(repo.root, { maxFileLines: 2 });
    expect(result.files[0]?.oversized).toBe(true);
    expect(result.files[0]?.newLines).toBeUndefined();
  });

  it('hashes committed binary bytes without decoding them', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.writeBytes('img.bin', Uint8Array.from([0xff, 0xfe, 0x00, 0x01]));
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    const headBytes = Uint8Array.from([0xff, 0xfe, 0x00, 0x02]);
    await repo.writeBytes('img.bin', headBytes);
    await repo.commit('binary change');

    const result = await snapshot(repo.root);
    const file = result.files.find((entry) => entry.path === 'img.bin');
    expect(file?.binary).toBe(true);
    expect(file?.contentHash).toBe(
      createHash('sha256').update(Buffer.from(headBytes)).digest('hex'),
    );
  });

  it('omits content when includeContent is false', async () => {
    const repo = await featureRepo();
    const result = await snapshot(repo.root, { includeContent: false });
    expect(result.files[0]?.newLines).toBeUndefined();
    expect(result.files[0]?.oldLines).toBeUndefined();
    expect(result.files[0]?.contentHash).toBeNull();
  });

  it('marks the snapshot truncated when maxFiles is exceeded', async () => {
    const repo = await featureRepo();
    for (const name of ['b', 'c', 'd']) {
      await repo.write(`src/${name}.ts`, `${name}\n`);
    }
    await repo.commit('more files');

    vi.mocked(readBlob).mockClear();
    const result = await snapshot(repo.root, { maxFiles: 1 });
    expect(result.files).toHaveLength(1);
    expect(result.totals.truncated).toBe(true);
    const readPaths = vi.mocked(readBlob).mock.calls.map(([, , path]) => path);
    expect(readPaths).toEqual(['src/a.ts', 'src/a.ts']);
  });

  it('sorts files by path', async () => {
    const repo = await featureRepo();
    await repo.write('src/z.ts', 'z\n');
    await repo.commit('z');
    const result = await snapshot(repo.root);
    const paths = result.files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
  });
});
