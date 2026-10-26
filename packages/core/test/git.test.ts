import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitError, resolveRepoRoot, runGit } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe('runGit', () => {
  it('runs git without a shell and returns stdout', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'hello\n');
    await repo.commit('base');

    const result = await runGit(repo.root, ['rev-parse', 'HEAD']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('throws a GitError with stderr for a failed command', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);

    await expect(runGit(repo.root, ['rev-parse', 'HEAD'])).rejects.toMatchObject({
      name: 'GitError',
      code: 'git-failed',
    });
  });

  it('returns a non-zero result when allowFailure is set', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);

    const result = await runGit(repo.root, ['rev-parse', 'HEAD'], { allowFailure: true });
    expect(result.code).not.toBe(0);
  });

  it('rejects when stderr exceeds the configured cap', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);

    const error: unknown = await runGit(repo.root, ['rev-parse', 'HEAD'], {
      maxStderrBytes: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitError);
    expect(error).toMatchObject({ name: 'GitError', code: 'git-failed' });
    expect((error as Error).message).toContain('stderr exceeded');
  });
});

describe('resolveRepoRoot', () => {
  it('finds the root from a subdirectory', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('sub/file.txt', 'x\n');
    await repo.commit('base');

    await expect(resolveRepoRoot(join(repo.root, 'sub'))).resolves.toBe(repo.root);
  });

  it('rejects a directory that is not a git repository', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cr-not-repo-'));
    cleanups.push(async () => rm(directory, { recursive: true, force: true }));

    await expect(resolveRepoRoot(directory)).rejects.toBeInstanceOf(GitError);
    await expect(resolveRepoRoot(directory)).rejects.toMatchObject({ code: 'not-a-repo' });
  });
});
