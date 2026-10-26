import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as GitRun from '../src/git/run.js';

const control = vi.hoisted(() => ({
  truncate: false,
  truncateUntracked: false,
  statusBytes: null as Uint8Array | null,
  diffBytes: null as Uint8Array | null,
}));

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
      if (control.statusBytes !== null && args[0] === 'status') {
        return {
          code: 0,
          stdout: Buffer.from(control.statusBytes).toString('utf8'),
          stdoutBytes: Buffer.from(control.statusBytes),
          stderr: '',
        } satisfies GitRun.GitResult;
      }
      if (control.diffBytes !== null && args[0] === 'diff') {
        return {
          code: 0,
          stdout: Buffer.from(control.diffBytes).toString('utf8'),
          stdoutBytes: Buffer.from(control.diffBytes),
          stderr: '',
        } satisfies GitRun.GitResult;
      }
      if (control.truncateUntracked && args[0] === 'ls-files' && args[1] === '--others') {
        return {
          code: 0,
          stdout: 'partial-untracked',
          stdoutBytes: Buffer.from('partial-untracked'),
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

describe('worktree digest framing', () => {
  it('frames status and diff by bytes, lengths and tags', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    const baseSha = await repo.commit('base');

    control.statusBytes = Buffer.from('a\0b');
    control.diffBytes = Buffer.from('c');
    const boundaryOne = await worktreeDigest(repo.root, baseSha);
    control.statusBytes = Buffer.from('a');
    control.diffBytes = Buffer.from('b\0c');
    const boundaryTwo = await worktreeDigest(repo.root, baseSha);
    control.statusBytes = Uint8Array.from([0xff, 0xfe]);
    control.diffBytes = new Uint8Array(0);
    const rawBytes = await worktreeDigest(repo.root, baseSha);

    expect(new Set([boundaryOne, boundaryTwo, rawBytes]).size).toBe(3);
  });
});

describe('worktree digest truncation', () => {
  it('exposes truncation when the untracked path listing overflows', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.write('untracked.txt', 'content\n');
    control.truncateUntracked = true;

    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });

    expect(scope.worktreeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(scope.worktreeDigestTruncated).toBe(true);
    const snapshot = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    expect(snapshot.warnings).toContain('worktree-digest-truncated');
  });

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
