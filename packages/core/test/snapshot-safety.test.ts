import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PathEscapeError, buildSnapshot, readBlob, safeJoin } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
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
});
