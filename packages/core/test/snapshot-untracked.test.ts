import { createHash } from 'node:crypto';
import { chmod } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

async function repoAtMain(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'a\n');
  await repo.commit('base');
  return repo;
}

describe('untracked files', () => {
  it('includes an untracked text file in a worktree snapshot', async () => {
    const repo = await repoAtMain();
    await repo.write('notes.md', 'one\ntwo\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const notes = result.files.find((file) => file.path === 'notes.md');

    expect(notes?.status).toBe('untracked');
    expect(notes?.added).toBe(2);
    expect(notes?.deleted).toBe(0);
    expect(notes?.newLines).toEqual(['one', 'two']);
    expect(notes?.hunks).toHaveLength(1);
    expect(notes?.hunks[0]?.lines.every((line) => line.kind === 'add')).toBe(true);
  });

  it.skipIf(process.getuid?.() === 0)(
    'reports an unreadable untracked file and continues with other files',
    async () => {
      const repo = await repoAtMain();
      await repo.write('secret.txt', 'hidden\n');
      await repo.write('notes.md', 'visible\n');
      const secret = `${repo.root}/secret.txt`;
      await chmod(secret, 0o000);
      try {
        const result = await buildSnapshot({
          repoRoot: repo.root,
          scope: { kind: 'worktree', baseRef: 'main' },
        });
        const unreadable = result.files.find((file) => file.path === 'secret.txt');

        expect(unreadable?.status).toBe('untracked');
        expect(unreadable?.reason).toBe('unreadable');
        expect(unreadable?.newLines).toBeUndefined();
        expect(unreadable?.contentHash).toBeNull();
        expect(result.warnings).toContain('unreadable:secret.txt');
        expect(result.files.some((file) => file.path === 'notes.md')).toBe(true);
      } finally {
        await chmod(secret, 0o644);
      }
    },
  );

  it('does not emit a hunk for an empty untracked file', async () => {
    const repo = await repoAtMain();
    await repo.write('empty.txt', '');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const empty = result.files.find((file) => file.path === 'empty.txt');

    expect(empty?.status).toBe('untracked');
    expect(empty?.added).toBe(0);
    expect(empty?.hunks).toEqual([]);
    expect(empty?.newLines).toEqual([]);
  });

  it('can exclude untracked files', async () => {
    const repo = await repoAtMain();
    await repo.write('notes.md', 'one\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      includeUntracked: false,
    });
    expect(result.files.map((file) => file.path)).not.toContain('notes.md');
  });
});

describe('ignores, binary and limits', () => {
  it('keeps ignored tracked and untracked files visible without content', async () => {
    const repo = await repoAtMain();
    await repo.write('src/a.ts', 'a\nchanged\n');
    await repo.write('dist/bundle.js', 'built\n');
    await repo.write('notes.md', 'note\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      ignore: ['src/**', 'dist/**', '*.md'],
    });

    expect(result.files.map((file) => file.path)).toEqual([
      'dist/bundle.js',
      'notes.md',
      'src/a.ts',
    ]);
    for (const file of result.files) {
      expect(file.ignored).toBe(true);
      expect(file.hunks).toEqual([]);
      expect(file.oldLines).toBeUndefined();
      expect(file.newLines).toBeUndefined();
      expect(file.contentHash).toBeNull();
    }
    expect(result.files.find((file) => file.path === 'src/a.ts')).toMatchObject({
      status: 'modified',
      added: 1,
      deleted: 0,
    });
    expect(result.files.find((file) => file.path === 'dist/bundle.js')).toMatchObject({
      status: 'untracked',
      added: 1,
    });
    expect(result.totals.files).toBe(3);
  });

  it('marks an untracked binary file without content but with its raw hash', async () => {
    const repo = await repoAtMain();
    await repo.write('image.bin', 'abc\u0000def');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const image = result.files.find((file) => file.path === 'image.bin');

    expect(image?.status).toBe('untracked');
    expect(image?.binary).toBe(true);
    expect(image?.newLines).toBeUndefined();
    expect(image?.contentHash).toBe(
      createHash('sha256').update(Buffer.from('abc\u0000def')).digest('hex'),
    );
  });

  it('marks an oversized untracked file without content or a hash', async () => {
    const repo = await repoAtMain();
    await repo.write(
      'big.txt',
      Array.from({ length: 50 }, (_, index) => `line ${index}`).join('\n'),
    );

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      maxFileLines: 10,
    });
    const big = result.files.find((file) => file.path === 'big.txt');

    expect(big?.status).toBe('untracked');
    expect(big?.oversized).toBe(true);
    expect(big?.newLines).toBeUndefined();
    expect(big?.contentHash).toBeNull();
  });

  it('does not let ignored files consume maxFiles', async () => {
    const repo = await repoAtMain();
    await repo.write('src/a.ts', 'a\nchanged\n');
    await repo.write('dist/000.txt', 'built\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      maxFiles: 1,
      ignore: ['dist/**'],
    });

    expect(result.files.map((file) => file.path)).toEqual(['dist/000.txt', 'src/a.ts']);
    expect(result.files.find((file) => file.path === 'dist/000.txt')?.ignored).toBe(true);
    expect(result.warnings).not.toContain('files-truncated');
    expect(result.totals.truncated).toBe(false);
  });

  it('caps reviewable files while retaining every ignored file', async () => {
    const repo = await repoAtMain();
    await repo.write('src/a.ts', 'a\nchanged\n');
    await repo.write('src/b.ts', 'new b\n');
    await repo.write('dist/000.txt', 'built\n');
    await repo.write('dist/001.txt', 'built too\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      maxFiles: 1,
      ignore: ['dist/**'],
    });

    expect(result.files.map((file) => file.path)).toEqual([
      'dist/000.txt',
      'dist/001.txt',
      'src/a.ts',
    ]);
    expect(result.files.filter((file) => file.ignored === true)).toHaveLength(2);
    expect(result.warnings.filter((warning) => warning === 'files-truncated')).toHaveLength(1);
    expect(result.totals.truncated).toBe(true);
  });

  it('re-sorts and slices after appending untracked entries', async () => {
    const repo = await repoAtMain();
    await repo.write('src/a.ts', 'a\nchanged\n');
    await repo.write('0-notes.md', 'n1\nn2\n');
    await repo.write('z-notes.md', 'z\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      maxFiles: 2,
    });

    expect(result.files.map((file) => file.path)).toEqual(['0-notes.md', 'src/a.ts']);
    expect(result.totals).toEqual({ files: 2, added: 3, deleted: 0, truncated: true });
    expect(result.warnings.filter((warning) => warning === 'files-truncated')).toHaveLength(1);
  });

  it('omits untracked content but keeps stats when includeContent is false', async () => {
    const repo = await repoAtMain();
    await repo.write('notes.md', 'one\ntwo\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      includeContent: false,
    });
    const notes = result.files.find((file) => file.path === 'notes.md');

    expect(notes?.added).toBe(2);
    expect(notes?.newLines).toBeUndefined();
    expect(notes?.contentHash).toBeNull();
  });
});
