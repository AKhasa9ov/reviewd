import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as GitRun from '../src/git/run.js';
import type * as Paths from '../src/paths.js';

const control = vi.hoisted(() => ({
  truncate: false,
  truncateUntracked: false,
  truncateSnapshotUntracked: false,
  statusBytes: null as Uint8Array | null,
  diffBytes: null as Uint8Array | null,
  untrackedPaths: null as Uint8Array | null,
  lsFilesCalls: 0,
  disableParentCheck: false,
}));

vi.mock('../src/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Paths>();
  return {
    ...actual,
    hasSymlinkParent: async (repoRoot: string, path: string) =>
      control.disableParentCheck ? false : actual.hasSymlinkParent(repoRoot, path),
  };
});

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
      if (control.untrackedPaths !== null && args[0] === 'ls-files' && args[1] === '--others') {
        return {
          code: 0,
          stdout: Buffer.from(control.untrackedPaths).toString('utf8'),
          stdoutBytes: Buffer.from(control.untrackedPaths),
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
      if (control.truncateSnapshotUntracked && args[0] === 'ls-files' && args[1] === '--others') {
        control.lsFilesCalls += 1;
        const result = await actual.runGit(cwd, args, options);
        if (control.lsFilesCalls >= 2) return { ...result, truncated: true };
        return result;
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
  control.truncateUntracked = false;
  control.truncateSnapshotUntracked = false;
  control.statusBytes = null;
  control.diffBytes = null;
  control.untrackedPaths = null;
  control.lsFilesCalls = 0;
  control.disableParentCheck = false;
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

describe('snapshot untracked listing truncation', () => {
  it('warns and marks totals without aborting, leaving the digest call intact', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    await repo.commit('base');
    await repo.write('untracked.txt', 'content\n');
    control.truncateSnapshotUntracked = true;

    const snapshot = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });

    expect(snapshot.files.find((file) => file.path === 'untracked.txt')).toBeDefined();
    expect(snapshot.warnings).toContain('untracked-list-truncated');
    expect(snapshot.warnings).not.toContain('worktree-digest-truncated');
    expect(snapshot.totals.truncated).toBe(true);
  });
});

describe('parent symlink guard', () => {
  it('does not incorporate outside content through a parent symlink after open', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('base.txt', 'base\n');
    const baseSha = await repo.commit('base');
    const outside = await mkdtemp(join(tmpdir(), 'cr-parent-outside-'));
    cleanups.push(async () => rm(outside, { recursive: true, force: true }));
    await writeFile(join(outside, 'secret.txt'), 'outside one\n');
    await symlink(outside, join(repo.root, 'linked'));
    control.untrackedPaths = Buffer.from('linked/secret.txt\0');
    control.disableParentCheck = true;

    const first = await worktreeDigest(repo.root, baseSha);
    await writeFile(join(outside, 'secret.txt'), 'outside two\n');
    const second = await worktreeDigest(repo.root, baseSha);

    expect(second).toBe(first);
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
