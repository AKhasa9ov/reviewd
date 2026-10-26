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
  it('applies ignore patterns to tracked and untracked files', async () => {
    const repo = await repoAtMain();
    await repo.write('dist/bundle.js', 'built\n');
    await repo.write('notes.md', 'note\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      ignore: ['dist/**', '*.md'],
    });
    expect(result.files).toEqual([]);
  });

  it('marks an untracked binary file without content', async () => {
    const repo = await repoAtMain();
    await repo.write('image.bin', 'abc\u0000def');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const image = result.files.find((file) => file.path === 'image.bin');

    expect(image?.binary).toBe(true);
    expect(image?.newLines).toBeUndefined();
  });

  it('marks an oversized untracked file without content', async () => {
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

    expect(big?.oversized).toBe(true);
    expect(big?.newLines).toBeUndefined();
  });
});
