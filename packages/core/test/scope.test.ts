import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_TREE_SHA,
  GitError,
  resolveDefaultBase,
  resolveScope,
  worktreeDigest,
} from '../src/index.js';

const execFileAsync = promisify(execFile);
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

async function repoWithFeature(): Promise<
  Awaited<ReturnType<typeof makeRepo>> & {
    baseSha: string;
    featureSha: string;
  }
> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'one\ntwo\n');
  const baseSha = await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo changed\nthree\n');
  const featureSha = await repo.commit('feature');
  return { ...repo, baseSha, featureSha };
}

describe('resolveScope', () => {
  it('resolves a range to merge-base and head commits', async () => {
    const repo = await repoWithFeature();
    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
    });

    expect(scope.kind).toBe('range');
    expect(scope.baseSha).toBe(repo.baseSha);
    expect(scope.headSha).toBe(repo.featureSha);
    expect(scope.label).toBe('main...feature');
  });

  it('resolves a commit to its parent', async () => {
    const repo = await repoWithFeature();
    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: repo.featureSha },
    });

    expect(scope.baseSha).toBe(repo.baseSha);
    expect(scope.headSha).toBe(repo.featureSha);
  });

  it('uses the empty tree for a root commit', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'root\n');
    const rootSha = await repo.commit('root');

    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: rootSha },
    });
    expect(scope.baseSha).toBe(EMPTY_TREE_SHA);
  });

  it('rejects a commit whose parent is missing in a shallow clone', async () => {
    const origin = await makeRepo();
    cleanups.push(origin.cleanup);
    await origin.write('a.txt', 'a\n');
    await origin.commit('one');
    await origin.write('b.txt', 'b\n');
    await origin.commit('two');
    await origin.write('c.txt', 'c\n');
    await origin.commit('three');

    const parent = await mkdtemp(join(tmpdir(), 'cr-shallow-'));
    cleanups.push(async () => rm(parent, { recursive: true, force: true }));
    const cloneRoot = join(parent, 'clone');
    await execFileAsync('git', ['clone', '--depth', '1', `file://${origin.root}`, cloneRoot]);
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: cloneRoot });

    const error: unknown = await resolveScope({
      repoRoot: cloneRoot,
      scope: { kind: 'commit', sha: stdout.trim() },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitError);
    expect(error).toMatchObject({
      code: 'git-failed',
      message: expect.stringContaining('parent that is not available'),
    });
  });

  it('resolves a worktree base without a head commit', async () => {
    const repo = await repoWithFeature();
    await repo.git('checkout', 'main');
    await repo.write('src/a.ts', 'one\ntwo changed in worktree\n');

    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    expect(scope.baseSha).toBe(repo.baseSha);
    expect(scope.headSha).toBeNull();
    expect(scope.worktreeDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the worktree digest when tracked content changes', async () => {
    const repo = await repoWithFeature();
    await repo.git('checkout', 'main');
    await repo.write('src/a.ts', 'one\ntwo\n');

    const first = await worktreeDigest(repo.root, repo.baseSha);
    await repo.write('src/a.ts', 'one\ntwo plus\n');
    const second = await worktreeDigest(repo.root, repo.baseSha);

    expect(first).not.toBe(second);
  });
});

describe('resolveDefaultBase', () => {
  it('prefers main', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.commit('base');

    await expect(resolveDefaultBase(repo.root)).resolves.toBe('main');
  });
});
