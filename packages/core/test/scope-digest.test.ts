import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as GitRun from '../src/git/run.js';

const control = vi.hoisted(() => ({ truncate: false }));

vi.mock('../src/git/run.js', async (importOriginal) => {
  const actual = await importOriginal<typeof GitRun>();
  return {
    ...actual,
    runGit: async (cwd: string, args: readonly string[], options?: GitRun.GitRunOptions) => {
      if (control.truncate && (args[0] === 'status' || args[0] === 'diff')) {
        return {
          code: 0,
          stdout: 'partial',
          stdoutBytes: Buffer.from('partial'),
          stderr: '',
          truncated: true,
        } satisfies GitRun.GitResult;
      }
      return await actual.runGit(cwd, args, options);
    },
  };
});

const { buildSnapshot } = await import('../src/index.js');
const { resolveScope, worktreeDigest } = await import('../src/index.js');
const { makeRepo } = await import('./helpers/repo.js');

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  control.truncate = false;
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe('worktree digest truncation', () => {
  it('exposes truncation instead of failing and warns in the snapshot', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.commit('base');
    await repo.write('a.txt', 'changed\n');
    control.truncate = true;

    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });

    expect(scope.worktreeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(scope.worktreeDigestTruncated).toBe(true);
    await expect(worktreeDigest(repo.root, scope.baseSha)).resolves.toMatch(/^[0-9a-f]{64}$/);

    const snapshot = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    expect(snapshot.warnings).toContain('worktree-digest-truncated');
  });
});
