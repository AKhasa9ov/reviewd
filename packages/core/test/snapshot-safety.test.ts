import { createHash } from 'node:crypto';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PathEscapeError, buildSnapshot, readBlob, safeJoin } from '../src/index.js';
import type * as GitRun from '../src/git/run.js';
import { makeRepo } from './helpers/repo.js';

const control = vi.hoisted(() => ({ failModeListings: false }));

vi.mock('../src/git/run.js', async (importOriginal) => {
  const actual = await importOriginal<typeof GitRun>();
  return {
    ...actual,
    runGit: async (cwd: string, args: readonly string[], options?: GitRun.GitRunOptions) => {
      if (
        control.failModeListings &&
        (args[0] === 'ls-tree' || (args[0] === 'ls-files' && args[1] === '-s'))
      ) {
        return {
          stdout: '',
          stdoutBytes: Buffer.alloc(0),
          stderr: 'mode listing unavailable',
          code: 1,
          truncated: false,
        } satisfies GitRun.GitResult;
      }
      return actual.runGit(cwd, args, options);
    },
  };
});

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  control.failModeListings = false;
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe('safeJoin', () => {
  it('rejects parent traversal and absolute paths', () => {
    const root = '/tmp/example-root';
    expect(() => safeJoin(root, '../outside.txt')).toThrow(PathEscapeError);
    expect(() => safeJoin(root, '/etc/passwd')).toThrow(PathEscapeError);
    expect(safeJoin(root, 'src/a.ts')).toBe('/tmp/example-root/src/a.ts');
  });
});

describe('symlinks', () => {
  it('does not follow an untracked symlink outside the repository', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('src/a.ts', 'a\n');
    await repo.commit('base');

    const outside = await mkdtemp(join(tmpdir(), 'cr-outside-'));
    cleanups.push(async () => rm(outside, { recursive: true, force: true }));
    await symlink(join(outside, 'secret.txt'), join(repo.root, 'link.txt'));

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });

    expect(result.files.map((file) => file.path)).not.toContain('link.txt');
    expect(result.warnings).toContain('symlink-not-followed:link.txt');
  });

  it('does not read a worktree file through a symlinked parent directory', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('src/a.ts', 'a\n');
    await repo.commit('base');

    const outside = await mkdtemp(join(tmpdir(), 'cr-outside-'));
    cleanups.push(async () => rm(outside, { recursive: true, force: true }));
    await writeFile(join(outside, 'secret.txt'), 'secret\n');
    await symlink(outside, join(repo.root, 'linked'));

    const read = await readBlob(repo.root, null, 'linked/secret.txt', 100);

    expect(read.lines).toBeNull();
    expect(read.symlink).toBe(true);
  });

  it('reads the new target of a tracked worktree symlink without following it', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await symlink('old.txt', join(repo.root, 'link'));
    await repo.git('add', 'link');
    await repo.commit('base');

    await rm(join(repo.root, 'link'));
    await symlink('new.txt', join(repo.root, 'link'));

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const link = result.files.find((file) => file.path === 'link');

    expect(link?.oldLines).toEqual(['old.txt']);
    expect(link?.newLines).toEqual(['new.txt']);
    expect(link?.contentHash).toBe(createHash('sha256').update('new.txt').digest('hex'));
  });
});

describe('submodules', () => {
  it('detects a gitlink from the index when the head is a worktree', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.git('add', 'a.txt');
    await repo.git(
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,1111111111111111111111111111111111111111,vendor/lib',
    );
    await repo.commitStaged('base');

    await repo.git(
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,2222222222222222222222222222222222222222,vendor/lib',
    );
    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const submodule = result.files.find((file) => file.path === 'vendor/lib');

    expect(submodule?.status).toBe('submodule');
    expect(submodule?.contentHash).toBeNull();
    expect(submodule?.newLines).toBeUndefined();
    expect(submodule?.oldLines).toBeUndefined();
  });

  it('marks gitlink entries as submodules and skips content reads', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.git('add', 'a.txt');
    await repo.git(
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,1111111111111111111111111111111111111111,vendor/lib',
    );
    await repo.commitStaged('base');

    await repo.git(
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,2222222222222222222222222222222222222222,vendor/lib',
    );
    const head = await repo.commitStaged('bump submodule');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: head },
    });
    const submodule = result.files.find((file) => file.path === 'vendor/lib');

    expect(submodule?.status).toBe('submodule');
    expect(submodule?.contentHash).toBeNull();
    expect(submodule?.newLines).toBeUndefined();
    expect(submodule?.oldLines).toBeUndefined();
  });

  it('does not read a deleted gitlink whose target is a real commit object', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.git('add', 'a.txt');
    const target = await repo.commitStaged('base');

    await repo.git('update-index', '--add', '--cacheinfo', `160000,${target},vendor/lib`);
    await repo.commitStaged('add submodule');
    await repo.git('rm', '--cached', 'vendor/lib');
    const head = await repo.commitStaged('delete submodule');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: head },
    });
    const entries = result.files.filter((file) => file.path === 'vendor/lib');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('submodule');
    expect(entries[0]?.oldLines).toBeUndefined();
    expect(entries[0]?.newLines).toBeUndefined();
    expect(entries[0]?.contentHash).toBeNull();
  });

  it('does not read a gitlink introduced by a file-to-submodule transition', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('x', 'file\n');
    await repo.git('add', 'x');
    const target = await repo.commitStaged('base file');

    await repo.git('update-index', '--add', '--cacheinfo', `160000,${target},x`);
    const head = await repo.commitStaged('file to submodule');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: head },
    });
    const submodules = result.files.filter(
      (file) => file.path === 'x' && file.status === 'submodule',
    );

    expect(submodules).toHaveLength(1);
    expect(submodules[0]?.oldLines).toBeUndefined();
    expect(submodules[0]?.newLines).toBeUndefined();
    expect(submodules[0]?.contentHash).toBeNull();
  });

  it('does not read the old gitlink after a submodule-to-file transition', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.git('add', 'a.txt');
    const target = await repo.commitStaged('base');
    await repo.git('update-index', '--add', '--cacheinfo', `160000,${target},x`);
    await repo.commitStaged('add submodule');

    await repo.git('rm', '--cached', 'x');
    await repo.write('x', 'newfile\n');
    await repo.git('add', 'x');
    const head = await repo.commitStaged('submodule to file');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: head },
    });
    const oldSide = result.files.find((file) => file.path === 'x' && file.status === 'submodule');
    const newSide = result.files.find((file) => file.path === 'x' && file.status === 'added');

    expect(oldSide?.oldLines).toBeUndefined();
    expect(oldSide?.newLines).toBeUndefined();
    expect(oldSide?.contentHash).toBeNull();
    expect(newSide?.newLines).toEqual(['newfile']);
  });

  it('warns and still detects a modified gitlink when mode listings are unavailable', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.git('add', 'a.txt');
    const target1 = await repo.commitStaged('base');

    await repo.git('update-index', '--add', '--cacheinfo', `160000,${target1},vendor/lib`);
    await repo.commitStaged('add submodule');

    await repo.write('b.txt', 'b\n');
    const target2 = await repo.commit('second commit');
    await repo.git('update-index', '--add', '--cacheinfo', `160000,${target2},vendor/lib`);
    const head = await repo.commitStaged('bump submodule');

    control.failModeListings = true;
    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: head },
    });
    const submodule = result.files.find((file) => file.path === 'vendor/lib');

    expect(result.warnings).toContain('submodule-modes-unavailable');
    expect(submodule?.status).toBe('submodule');
    expect(submodule?.oldLines).toBeUndefined();
    expect(submodule?.newLines).toBeUndefined();
    expect(submodule?.contentHash).toBeNull();
  });
});
