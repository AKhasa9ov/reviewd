import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReviewManifest,
  buildSnapshot,
  manifestFromSnapshot,
  patchBytesFromHunks,
  readBlob,
} from '../src/index.js';
import { manifestEntry } from '../src/diff/snapshot.js';
import type * as ContentModule from '../src/git/content.js';
import type { DiffHunk, FileDiff, ResolvedScope, Snapshot } from '../src/index.js';
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

    expect(result.schemaVersion).toBe(2);
    expect(result.manifest?.files.map((file) => file.path)).toEqual(['src/a.ts']);
    expect(result.manifest?.totals.files).toBe(1);
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
    expect(result.files[0]?.contentHash).toBeNull();
  });

  it('does not fall back to the base hash when only the head is oversized', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('src/a.ts', 'a\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('src/a.ts', 'a\nb\nc\n');
    await repo.commit('feature');

    const result = await snapshot(repo.root, { maxFileLines: 2 });
    const file = result.files.find((entry) => entry.path === 'src/a.ts');
    expect(file?.oversized).toBe(true);
    expect(file?.newLines).toBeUndefined();
    expect(file?.contentHash).toBeNull();
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
    expect(result.manifest?.files).toHaveLength(4);
    expect(result.totals.files).toBe(4);
    expect(result.totals.truncated).toBe(true);
    const renderPaths = new Set(result.files.map((file) => file.path));
    const omitted = result.manifest?.files.filter((file) => !renderPaths.has(file.path)) ?? [];
    expect(omitted).toHaveLength(3);
    expect(omitted.every((file) => file.reason === 'render-budget')).toBe(true);
    const readPaths = vi.mocked(readBlob).mock.calls.map(([, , path]) => path);
    expect(readPaths).toEqual(['src/a.ts', 'src/a.ts']);
  });

  it('keeps a synthetic oversized entry when one file exceeds the diff cap', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('src/a.ts', 'a\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('src/a.ts', `a\n${'x'.repeat(5000)}\n`);
    await repo.commit('large');

    const result = await snapshot(repo.root, { maxDiffBytes: 1024 });

    expect(result.files).toHaveLength(1);
    const file = result.files[0];
    expect(file?.path).toBe('src/a.ts');
    expect(file?.status).toBe('modified');
    expect(file?.oversized).toBe(true);
    expect(file?.binary).toBe(false);
    expect(file?.hunks).toEqual([]);
    expect(file?.added).toBe(0);
    expect(file?.deleted).toBe(0);
    expect(file?.contentHash).toBeNull();
    expect(result.totals.truncated).toBe(true);
    expect(result.warnings).toContain('diff-truncated');
    expect(result.warnings).toContain('diff-file-truncated:src/a.ts');
  });

  it('ignores local diff prefix configuration', async () => {
    const repo = await featureRepo();
    await repo.git('config', 'diff.noprefix', 'true');
    await repo.git('config', 'diff.mnemonicPrefix', 'true');
    await repo.git('config', 'core.quotePath', 'true');

    const result = await snapshot(repo.root);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe('src/a.ts');
    expect(result.files[0]?.status).toBe('modified');
  });

  it('treats invalid UTF-8 as binary-like and keeps the raw hash', async () => {
    const repo = await featureRepo();
    const raw = Buffer.from([0xff, 0xfe, 0x41]);
    await repo.writeBytes('src/bad.txt', raw);
    await repo.commit('invalid utf-8');

    const result = await snapshot(repo.root);
    const bad = result.files.find((file) => file.path === 'src/bad.txt');

    expect(bad?.status).toBe('added');
    expect(bad?.binary).toBe(true);
    expect(bad?.encoding).toBe('unknown');
    expect(bad?.newLines).toBeUndefined();
    expect(bad?.oldLines).toBeUndefined();
    expect(bad?.hunks).toEqual([]);
    expect(bad?.contentHash).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('marks a file over maxContentBytes as oversized without content or hash', async () => {
    const repo = await featureRepo();
    await repo.write('src/large.txt', '0123456789\n');
    await repo.commit('large');

    const result = await snapshot(repo.root, { maxContentBytes: 4 });
    const large = result.files.find((file) => file.path === 'src/large.txt');

    expect(large?.status).toBe('added');
    expect(large?.oversized).toBe(true);
    expect(large?.newLines).toBeUndefined();
    expect(large?.contentHash).toBeNull();
  });

  it('enforces the total content budget and keeps later files visible', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.write('b.txt', 'b\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('a.txt', 'aa\n');
    await repo.write('b.txt', 'bb\n');
    await repo.commit('feature');

    const result = await snapshot(repo.root, { maxTotalContentBytes: 8 });
    const first = result.files.find((file) => file.path === 'a.txt');
    const second = result.files.find((file) => file.path === 'b.txt');

    expect(result.files).toHaveLength(2);
    expect(first?.truncated).toBeUndefined();
    expect(first?.newLines).toEqual(['aa']);
    expect(first?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second?.truncated).toBe(true);
    expect(second?.newLines).toBeUndefined();
    expect(second?.oldLines).toBeUndefined();
    expect(second?.contentHash).toBeNull();
    expect(
      result.warnings.filter((warning) => warning === 'content-budget-truncated'),
    ).toHaveLength(1);
    expect(result.totals.truncated).toBe(true);
  });

  it('keeps a later file that is cut by the diff cap', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('a.txt', 'small\n');
    await repo.write('z.txt', `${'x'.repeat(3 * 1024 * 1024)}\n`);
    await repo.commit('small and large');

    const result = await snapshot(repo.root);
    const first = result.files.find((file) => file.path === 'a.txt');
    const last = result.files.find((file) => file.path === 'z.txt');

    expect(result.files.map((file) => file.path)).toEqual(['a.txt', 'z.txt']);
    expect(first?.status).toBe('added');
    expect(first?.oversized).toBe(false);
    expect(last?.status).toBe('added');
    expect(last?.oversized).toBe(true);
    expect(last?.added).toBe(0);
    expect(last?.deleted).toBe(0);
    expect(last?.hunks).toEqual([]);
    expect(last?.contentHash).toBeNull();
    expect(result.totals.truncated).toBe(true);
    expect(result.warnings).toContain('diff-truncated');
    expect(result.warnings).toContain('diff-file-truncated:z.txt');
  });

  it('backfills a file wholly beyond the diff cap', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('a.txt', 'small\n');
    await repo.write('z.txt', `${'x'.repeat(3 * 1024 * 1024)}\n`);
    await repo.commit('small and large');

    const result = await snapshot(repo.root);
    const last = result.files.find((file) => file.path === 'z.txt');

    expect(result.files.map((file) => file.path)).toEqual(['a.txt', 'z.txt']);
    expect(last?.status).toBe('added');
    expect(last?.binary).toBe(false);
    expect(last?.truncated).toBe(true);
    expect(last?.reason).toBe('diff-truncated');
    expect(last?.hunks).toEqual([]);
    expect(last?.contentHash).toBeNull();
    expect(result.warnings).toContain('diff-truncated');
    expect(result.warnings).toContain('diff-file-skipped:z.txt');
    expect(result.warnings).not.toContain('diff-file-skipped:a.txt');
  });

  it('backfills a large middle file and a later file without duplicates', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('a.txt', 'small\n');
    await repo.write('m.txt', `${'x'.repeat(3 * 1024 * 1024)}\n`);
    await repo.write('z.txt', 'later\n');
    await repo.commit('small, large and later');

    const result = await snapshot(repo.root);
    const middle = result.files.filter((file) => file.path === 'm.txt');
    const last = result.files.find((file) => file.path === 'z.txt');

    expect(result.files.map((file) => file.path)).toEqual(['a.txt', 'm.txt', 'z.txt']);
    expect(middle).toHaveLength(1);
    expect(middle[0]?.oversized).toBe(true);
    expect(last?.truncated).toBe(true);
    expect(last?.reason).toBe('diff-truncated');
    expect(result.warnings).toContain('diff-file-skipped:z.txt');
  });

  it('backfills a rename beyond the diff cap with its old path', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('old.txt', `${'old'.repeat(30)}\n`);
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('a.txt', 'small\n');
    await repo.write('m.txt', `${'x'.repeat(5000)}\n`);
    await repo.git('mv', 'old.txt', 'new.txt');
    await repo.commit('large and rename');

    const result = await snapshot(repo.root, { maxDiffBytes: 1024 });
    const renamed = result.files.find((file) => file.path === 'new.txt');

    expect(renamed?.status).toBe('renamed');
    expect(renamed?.oldPath).toBe('old.txt');
    expect(renamed?.truncated).toBe(true);
    expect(renamed?.reason).toBe('diff-truncated');
    expect(result.warnings).toContain('diff-file-skipped:new.txt');
  });

  it('backfills a submodule type change beyond the diff cap', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.write('vendor/lib', 'regular\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('m.txt', `${'x'.repeat(5000)}\n`);
    await repo.git('rm', 'vendor/lib');
    await repo.git('add', 'm.txt');
    await repo.git(
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,1111111111111111111111111111111111111111,vendor/lib',
    );
    await repo.commitStaged('type change and large file');

    const result = await snapshot(repo.root, { maxDiffBytes: 1024 });
    const submodule = result.files.find((file) => file.path === 'vendor/lib');

    expect(submodule?.status).toBe('submodule');
    expect(submodule?.truncated).toBe(true);
    expect(submodule?.reason).toBe('diff-truncated');
    expect(result.warnings).toContain('diff-file-skipped:vendor/lib');
  });

  it('keeps an ignored backfilled path visible without consuming maxFiles', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('a.txt', 'small\n');
    await repo.write('m.txt', `${'x'.repeat(3 * 1024 * 1024)}\n`);
    await repo.write('zzz/000.txt', 'ignored\n');
    await repo.commit('small, large and ignored');

    const result = await snapshot(repo.root, {
      maxFiles: 1,
      ignore: ['m.txt', 'zzz/**'],
    });
    const ignored = result.files.find((file) => file.path === 'zzz/000.txt');

    expect(result.files.map((file) => file.path)).toEqual(['a.txt', 'm.txt', 'zzz/000.txt']);
    expect(result.files.find((file) => file.path === 'a.txt')).toBeDefined();
    expect(ignored?.ignored).toBe(true);
    expect(ignored?.truncated).toBe(true);
    expect(ignored?.reason).toBe('diff-truncated');
    const ignoredManifest = result.manifest?.files.find((file) => file.path === 'zzz/000.txt');
    expect(ignoredManifest?.ignored).toBe(true);
    expect(ignoredManifest?.reason).toBe('diff-truncated');
    expect(result.warnings).toContain('diff-file-skipped:zzz/000.txt');
    expect(result.warnings).not.toContain('files-truncated');
  });

  it('sorts paths by UTF-8 bytes rather than UTF-16 code units', async () => {
    const repo = await featureRepo();
    await repo.write('\u{1f600}.txt', 'emoji\n');
    await repo.write('\uf8ff.txt', 'bmp\n');
    await repo.commit('unicode paths');

    const result = await snapshot(repo.root);

    expect(result.files.map((file) => file.path)).toEqual([
      'src/a.ts',
      '\uf8ff.txt',
      '\u{1f600}.txt',
    ]);
  });

  it('sorts files by path', async () => {
    const repo = await featureRepo();
    await repo.write('src/z.ts', 'z\n');
    await repo.commit('z');
    const result = await snapshot(repo.root);
    const paths = result.files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('emits a complete 882-path manifest while the render subset stays capped', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    for (let index = 0; index < 882; index += 1) {
      const path = `src/file-${String(index).padStart(3, '0')}.ts`;
      const lines = Array.from(
        { length: 96 },
        (_, line) => `file ${index} line ${line} ${'x'.repeat(24)}`,
      );
      await repo.write(path, `${lines.join('\n')}\n`);
    }
    await repo.commit('882 files');

    const result = await snapshot(repo.root, { includeContent: false });
    const expectedPaths = Array.from(
      { length: 882 },
      (_, index) => `src/file-${String(index).padStart(3, '0')}.ts`,
    );
    const manifestPaths = result.manifest?.files.map((file) => file.path) ?? [];
    const renderPaths = new Set(result.files.map((file) => file.path));

    expect(result.schemaVersion).toBe(2);
    expect(result.manifest?.files).toHaveLength(882);
    expect(manifestPaths).toEqual(expectedPaths);
    expect(new Set(manifestPaths).size).toBe(882);
    expect(result.totals.files).toBe(882);
    expect(result.totals.added).toBe(882 * 96);
    expect(result.files.length).toBeLessThanOrEqual(500);
    const manifestSet = new Set(manifestPaths);
    expect(result.files.every((file) => manifestSet.has(file.path))).toBe(true);
    const omitted = result.manifest?.files.filter((file) => !renderPaths.has(file.path)) ?? [];
    expect(omitted.length).toBeGreaterThan(0);
    expect(omitted.every((file) => file.reason !== undefined)).toBe(true);
    expect(omitted.every((file) => file.reason === 'render-budget')).toBe(true);
    expect(result.totals.truncated).toBe(true);
  });

  it('records a single file cut by the byte cap as per-file-cap', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.write('huge.txt', `${'x'.repeat(6 * 1024 * 1024)}\n`);
    await repo.commit('6 MiB file');

    const result = await snapshot(repo.root);
    const entry = result.manifest?.files.find((file) => file.path === 'huge.txt');

    expect(result.schemaVersion).toBe(2);
    expect(result.manifest?.files).toHaveLength(1);
    expect(result.files).toHaveLength(1);
    expect(entry).toMatchObject({
      path: 'huge.txt',
      status: 'added',
      reason: 'per-file-cap',
      hunkCount: 0,
      patchBytes: 0,
    });
    expect(entry?.added).toBe(1);
    expect(result.totals.files).toBe(1);
    expect(result.totals.truncated).toBe(true);
  });

  it('merges rename numstat metadata by new path in the manifest', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('old-name.ts', 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n');
    await repo.commit('base');
    await repo.git('checkout', '-b', 'feature');
    await repo.git('mv', 'old-name.ts', 'new-name.ts');
    await repo.write('new-name.ts', 'one\ntwo\nthree\nfour changed\nfive\nsix\nseven\neight\n');
    await repo.commit('rename with edit');

    const result = await snapshot(repo.root);
    const entry = result.manifest?.files.find((file) => file.path === 'new-name.ts');

    expect(result.manifest?.files).toHaveLength(1);
    expect(entry).toMatchObject({
      path: 'new-name.ts',
      oldPath: 'old-name.ts',
      status: 'renamed',
      added: 1,
      deleted: 1,
    });
    expect(result.manifest?.files.some((file) => file.path === 'old-name.ts')).toBe(false);
  });
});

const manifestScope: ResolvedScope = {
  kind: 'range',
  repoRoot: '/tmp/repo',
  baseRef: 'main',
  headRef: 'feature',
  baseSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  label: 'aaaaaaa..bbbbbbb',
  worktreeDigest: 'b'.repeat(40),
};

function changedFile(index: number): FileDiff {
  const hasHunks = index % 3 !== 0;
  const hunk: DiffHunk = {
    oldStart: 1,
    oldLines: 1,
    newStart: 1,
    newLines: 2,
    header: '',
    lines: [
      { kind: 'add', oldNo: null, newNo: 1, text: `line ${index}` },
      { kind: 'context', oldNo: 1, newNo: 2, text: 'context' },
    ],
  };
  return {
    path: `src/file-${String(index).padStart(3, '0')}.ts`,
    status: 'modified',
    binary: false,
    oversized: false,
    added: hasHunks ? 1 : 0,
    deleted: 0,
    hunks: hasHunks ? [hunk] : [],
    contentHash: null,
  };
}

describe('review manifest', () => {
  it('keeps all 600 changed files, including files beyond the render cap and files without hunks', () => {
    const files = Array.from({ length: 600 }, (_, index) => changedFile(index));

    const manifest = buildReviewManifest({ scope: manifestScope, files });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.files).toHaveLength(600);
    expect(manifest.files.map((file) => file.path)).toEqual(files.map((file) => file.path));
    expect(manifest.files[500]?.path).toBe('src/file-500.ts');
    expect(manifest.files.at(-1)?.path).toBe('src/file-599.ts');
    expect(manifest.files.filter((file) => file.hunkCount === 0)).toHaveLength(200);
    expect(manifest.totals).toEqual({
      files: 600,
      added: 400,
      deleted: 0,
      patchBytes: expect.any(Number),
    });
    expect(manifest.totals.patchBytes).toBeGreaterThan(0);
    expect(manifest.warnings).toEqual([]);
  });

  it('records file metadata and why a patch is absent', () => {
    const files: FileDiff[] = [
      { ...changedFile(1), oldPath: 'src/old.ts', status: 'renamed' },
      {
        path: 'img.bin',
        status: 'modified',
        binary: true,
        oversized: false,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
      },
      {
        path: 'vendor/generated.ts',
        status: 'modified',
        binary: false,
        oversized: false,
        ignored: true,
        added: 3,
        deleted: 2,
        hunks: [],
        contentHash: null,
      },
      {
        path: 'assets/large.txt',
        status: 'added',
        binary: false,
        oversized: true,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
      },
      {
        path: 'src/lost.ts',
        status: 'modified',
        binary: false,
        oversized: false,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
        truncated: true,
        reason: 'diff-truncated',
      },
    ];

    const manifest = buildReviewManifest({ scope: manifestScope, files });

    expect(manifest.files[0]).toMatchObject({
      path: 'src/file-001.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
      binary: false,
      ignored: false,
      oversized: false,
      added: 1,
      deleted: 0,
      hunkCount: 1,
    });
    expect(manifest.files[0]?.reason).toBeUndefined();
    expect(manifest.files[0]?.patchBytes).toBeGreaterThan(0);
    expect(manifest.files.find((file) => file.path === 'img.bin')?.reason).toBe('binary');
    expect(manifest.files.find((file) => file.path === 'vendor/generated.ts')?.reason).toBe(
      'ignored',
    );
    expect(manifest.files.find((file) => file.path === 'assets/large.txt')?.reason).toBe(
      'per-file-cap',
    );
    expect(manifest.files.find((file) => file.path === 'src/lost.ts')?.reason).toBe(
      'diff-truncated',
    );
    expect(manifest.files.every((file) => file.contentBytes === undefined)).toBe(true);
  });

  it('prefers the explicit reason, then ignored, over other no-patch flags', () => {
    const files: FileDiff[] = [
      {
        path: 'assets/ignored-large.bin',
        status: 'modified',
        binary: false,
        oversized: true,
        ignored: true,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
      },
      {
        path: 'src/unreadable-ignored.ts',
        status: 'modified',
        binary: false,
        oversized: false,
        ignored: true,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
        reason: 'unreadable',
      },
      {
        path: 'assets/ignored-binary.bin',
        status: 'modified',
        binary: true,
        oversized: false,
        ignored: true,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
      },
      {
        path: 'assets/large-binary.bin',
        status: 'modified',
        binary: true,
        oversized: true,
        added: 0,
        deleted: 0,
        hunks: [],
        contentHash: null,
      },
    ];

    const manifest = buildReviewManifest({ scope: manifestScope, files });

    expect(manifest.files.find((file) => file.path === 'assets/ignored-large.bin')?.reason).toBe(
      'ignored',
    );
    expect(manifest.files.find((file) => file.path === 'src/unreadable-ignored.ts')?.reason).toBe(
      'unreadable',
    );
    expect(manifest.files.find((file) => file.path === 'assets/ignored-binary.bin')?.reason).toBe(
      'ignored',
    );
    expect(manifest.files.find((file) => file.path === 'assets/large-binary.bin')?.reason).toBe(
      'binary',
    );
  });

  it('prefers ignored over render-budget for an ignored manifest-only path', () => {
    const entry = manifestEntry({
      seed: {
        path: 'dist/bundle.js',
        status: 'modified',
        binary: false,
        added: 4,
        deleted: 1,
        ignored: true,
        oversized: false,
        fromNumstat: true,
      },
      renderExcluded: true,
    });

    expect(entry).toMatchObject({
      path: 'dist/bundle.js',
      ignored: true,
      reason: 'ignored',
      patchBytes: 0,
      hunkCount: 0,
      added: 4,
      deleted: 1,
    });
  });

  it('uses render-budget for an ordinary manifest-only path', () => {
    const entry = manifestEntry({
      seed: {
        path: 'src/file-501.ts',
        status: 'modified',
        binary: false,
        added: 1,
        deleted: 0,
        ignored: false,
        oversized: false,
        fromNumstat: true,
      },
      renderExcluded: true,
    });

    expect(entry).toMatchObject({ reason: 'render-budget', patchBytes: 0, hunkCount: 0 });
  });

  it('uses binary for an omitted binary manifest-only seed', () => {
    const entry = manifestEntry({
      seed: {
        path: 'assets/logo.png',
        status: 'added',
        binary: true,
        added: 0,
        deleted: 0,
        ignored: false,
        oversized: false,
        fromNumstat: true,
      },
      renderExcluded: true,
    });

    expect(entry).toMatchObject({ binary: true, reason: 'binary', patchBytes: 0 });
  });

  it('keeps per-file-cap for a render-excluded oversized entry', () => {
    const seed = {
      path: 'assets/large.txt',
      status: 'modified' as const,
      binary: false,
      added: 0,
      deleted: 0,
      ignored: false,
      oversized: true,
      fromNumstat: true,
    };
    const file: FileDiff = {
      path: seed.path,
      status: seed.status,
      binary: false,
      oversized: true,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: null,
    };

    expect(manifestEntry({ seed, file, renderExcluded: true }).reason).toBe('per-file-cap');
    expect(manifestEntry({ seed, renderExcluded: true }).reason).toBe('per-file-cap');
  });

  it('measures patch bytes as a hunk-body lower bound', () => {
    const file = changedFile(1);

    expect(patchBytesFromHunks(file.hunks)).toBe(33);
    const manifest = buildReviewManifest({ scope: manifestScope, files: [file] });
    expect(manifest.files[0]?.patchBytes).toBe(33);
  });

  it('synthesizes a manifest from a legacy v1 snapshot with a legacy-truncated warning', () => {
    const legacy: Snapshot = {
      schemaVersion: 1,
      scope: manifestScope,
      files: [changedFile(1), changedFile(2)],
      totals: { files: 2, added: 2, deleted: 0, truncated: true },
      warnings: ['files-truncated'],
    };

    const manifest = manifestFromSnapshot(legacy);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.scope).toEqual(manifestScope);
    expect(manifest.files.map((file) => file.path)).toEqual(['src/file-001.ts', 'src/file-002.ts']);
    expect(manifest.files.map((file) => file.hunkCount)).toEqual([1, 1]);
    expect(manifest.totals.files).toBe(2);
    expect(manifest.warnings).toEqual(['files-truncated', 'legacy-truncated']);
    expect(legacy.warnings).toEqual(['files-truncated']);
  });

  it('keeps legacy-truncated when a whole-file-set legacy snapshot truncated content', () => {
    const legacy: Snapshot = {
      schemaVersion: 1,
      scope: manifestScope,
      files: [changedFile(1)],
      totals: { files: 1, added: 1, deleted: 0, truncated: true },
      warnings: ['content-budget-truncated'],
    };

    const manifest = manifestFromSnapshot(legacy);

    expect(manifest.totals.files).toBe(1);
    expect(manifest.warnings).toEqual(['content-budget-truncated', 'legacy-truncated']);
  });

  it('does not mark a complete v1 snapshot as legacy-truncated', () => {
    const complete: Snapshot = {
      schemaVersion: 1,
      scope: manifestScope,
      files: [changedFile(1)],
      totals: { files: 1, added: 1, deleted: 0, truncated: false },
      warnings: [],
    };

    const manifest = manifestFromSnapshot(complete);

    expect(manifest.files.map((file) => file.path)).toEqual(['src/file-001.ts']);
    expect(manifest.warnings).toEqual([]);
  });

  it('keeps the manifest carried by a v2 snapshot', () => {
    const explicit = buildReviewManifest({ scope: manifestScope, files: [changedFile(1)] });
    const current: Snapshot = {
      schemaVersion: 2,
      scope: manifestScope,
      files: [],
      manifest: explicit,
      totals: { files: 1, added: 1, deleted: 0, truncated: false },
      warnings: [],
    };

    const manifest = manifestFromSnapshot(current);

    expect(manifest).toBe(explicit);
    expect(manifest.warnings).not.toContain('legacy-truncated');
  });
});
