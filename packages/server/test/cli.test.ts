import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Snapshot } from '@dsh-code-review/core';
import { makeRepo } from '../../core/test/helpers/repo.js';
import { runCli } from '../src/cli/run.js';
import type { CliDeps } from '../src/cli/run.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

const failingDeps: CliDeps = {
  resolveRepoRoot: async () => '/whatever',
  resolveDefaultBase: async () => 'main',
  buildSnapshot: async () => {
    throw new Error('secret internals');
  },
  debug: false,
};

function capture(): {
  io: {
    stdout: { write: (text: string) => boolean };
    stderr: { write: (text: string) => boolean };
  };
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: {
        write: (text: string) => {
          out.push(text);
          return true;
        },
      },
      stderr: {
        write: (text: string) => {
          err.push(text);
          return true;
        },
      },
    },
  };
}

function parseSnapshot(out: string[]): Snapshot {
  return JSON.parse(out.join('')) as Snapshot;
}

async function featureRepo(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'one\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo\n');
  await repo.commit('feature');
  return repo;
}

async function twoFileRepo(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('a.ts', 'a\n');
  await repo.write('b.ts', 'b\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('a.ts', 'a2\n');
  await repo.write('b.ts', 'b2\n');
  await repo.commit('feature');
  return repo;
}

async function nonRepoDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cr-nonrepo-'));
  cleanups.push(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

describe('review diff', () => {
  it('prints a JSON snapshot', async () => {
    const repo = await featureRepo();
    const { io, out, err } = capture();

    const code = await runCli(
      ['diff', '--repo', repo.root, '--base', 'main', '--head', 'feature', '--json'],
      io,
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const snapshot = parseSnapshot(out);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.files[0]?.path).toBe('src/a.ts');
    expect(snapshot.files[0]?.added).toBe(1);
  });

  it('prints a human summary', async () => {
    const repo = await featureRepo();
    const { io, out } = capture();

    const code = await runCli(
      ['diff', '--repo', repo.root, '--base', 'main', '--head', 'feature'],
      io,
    );

    expect(code).toBe(0);
    expect(out.join('')).toContain('main...feature');
    expect(out.join('')).toContain('src/a.ts');
  });

  it('returns 5 for a non-repository path', async () => {
    const dir = await nonRepoDir();
    const { io, err } = capture();
    const code = await runCli(['diff', '--repo', dir, '--json'], io);

    expect(code).toBe(5);
    expect(err.join('')).toContain('not a git repository');
  });

  it('prints help and version with exit code 0', async () => {
    const help = capture();
    expect(await runCli(['help'], help.io)).toBe(0);
    expect(help.out.join('')).toContain('review diff');
    expect(help.out.join('')).toContain('--flag=value');
    expect(help.out.join('')).toContain(
      'exit codes: 0 success, 1 internal failure, 5 usage or git validation',
    );

    const version = capture();
    expect(await runCli(['version'], version.io)).toBe(0);
    expect(version.out.join('')).toContain('review 0.1.0');
  });

  it('diffs a commit against its parent', async () => {
    const repo = await featureRepo();
    const sha = await repo.git('rev-parse', 'HEAD');
    const { io, out } = capture();

    const code = await runCli(['diff', '--repo', repo.root, '--commit', sha, '--json'], io);

    expect(code).toBe(0);
    const snapshot = parseSnapshot(out);
    expect(snapshot.scope.kind).toBe('commit');
    expect(snapshot.scope.headSha).toBe(sha);
    expect(snapshot.files[0]?.path).toBe('src/a.ts');
    expect(snapshot.files[0]?.added).toBe(1);
  });

  it('diffs the working tree against the base', async () => {
    const repo = await featureRepo();
    await repo.write('src/a.ts', 'one\ntwo\nthree\n');
    const { io, out } = capture();

    const code = await runCli(
      ['diff', '--repo', repo.root, '--base', 'main', '--worktree', '--json'],
      io,
    );

    expect(code).toBe(0);
    const snapshot = parseSnapshot(out);
    expect(snapshot.scope.kind).toBe('worktree');
    expect(snapshot.scope.headSha).toBeNull();
    expect(snapshot.files[0]?.path).toBe('src/a.ts');
    expect(snapshot.files[0]?.added).toBe(2);
  });

  it('uses two-dot semantics when requested', async () => {
    const repo = await featureRepo();
    const { io, out } = capture();

    const code = await runCli(
      ['diff', '--repo', repo.root, '--base', 'main', '--head', 'feature', '--two-dot', '--json'],
      io,
    );

    expect(code).toBe(0);
    const snapshot = parseSnapshot(out);
    expect(snapshot.scope.kind).toBe('range');
    expect(snapshot.scope.label).toBe('main..feature');
  });

  it('omits content with --no-content', async () => {
    const repo = await featureRepo();
    const { io, out } = capture();

    const code = await runCli(
      [
        'diff',
        '--repo',
        repo.root,
        '--base',
        'main',
        '--head',
        'feature',
        '--no-content',
        '--json',
      ],
      io,
    );

    expect(code).toBe(0);
    const file = parseSnapshot(out).files[0];
    expect(file?.newLines).toBeUndefined();
    expect(file?.oldLines).toBeUndefined();
    expect(file?.contentHash).toBeNull();
  });

  it('excludes untracked files with --no-untracked', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('tracked.txt', 'base\n');
    await repo.commit('base');
    await repo.write('notes.txt', 'untracked\n');

    const baseline = capture();
    expect(
      await runCli(
        ['diff', '--repo', repo.root, '--base', 'main', '--worktree', '--json'],
        baseline.io,
      ),
    ).toBe(0);
    expect(parseSnapshot(baseline.out).files.some((file) => file.path === 'notes.txt')).toBe(true);

    const filtered = capture();
    expect(
      await runCli(
        ['diff', '--repo', repo.root, '--base', 'main', '--worktree', '--no-untracked', '--json'],
        filtered.io,
      ),
    ).toBe(0);
    expect(parseSnapshot(filtered.out).files.some((file) => file.path === 'notes.txt')).toBe(false);
  });

  it('empties the snapshot with --ignore', async () => {
    const repo = await featureRepo();
    const { io, out } = capture();

    const code = await runCli(
      [
        'diff',
        '--repo',
        repo.root,
        '--base',
        'main',
        '--head',
        'feature',
        '--ignore',
        'src/**',
        '--json',
      ],
      io,
    );

    expect(code).toBe(0);
    const snapshot = parseSnapshot(out);
    expect(snapshot.files).toEqual([]);
    expect(snapshot.totals.files).toBe(0);
  });

  it('truncates with --max-files', async () => {
    const repo = await twoFileRepo();
    const { io, out } = capture();

    const code = await runCli(
      [
        'diff',
        '--repo',
        repo.root,
        '--base',
        'main',
        '--head',
        'feature',
        '--max-files',
        '1',
        '--json',
      ],
      io,
    );

    expect(code).toBe(0);
    const snapshot = parseSnapshot(out);
    expect(snapshot.files).toHaveLength(1);
    expect(snapshot.totals.truncated).toBe(true);
    expect(snapshot.warnings).toContain('files-truncated');
  });

  it('marks oversized files with --max-lines', async () => {
    const repo = await featureRepo();
    const { io, out } = capture();

    const code = await runCli(
      [
        'diff',
        '--repo',
        repo.root,
        '--base',
        'main',
        '--head',
        'feature',
        '--max-lines',
        '1',
        '--json',
      ],
      io,
    );

    expect(code).toBe(0);
    const file = parseSnapshot(out).files[0];
    expect(file?.oversized).toBe(true);
    expect(file?.newLines).toBeUndefined();
    expect(file?.contentHash).toBeNull();
  });

  it('returns 5 for an unknown flag', async () => {
    const { io, err } = capture();
    const code = await runCli(['diff', '--bogus'], io);

    expect(code).toBe(5);
    expect(err.join('')).toContain('unknown flag: --bogus');
  });

  it('returns 5 when a flag is missing its value', async () => {
    const { io, err } = capture();
    const code = await runCli(['diff', '--repo'], io);

    expect(code).toBe(5);
    expect(err.join('')).toContain('--repo requires a value');
  });

  const incompatible = [
    {
      name: 'commit with base',
      args: ['diff', '--commit', 'HEAD', '--base', 'main'],
      flags: ['--commit', '--base'],
    },
    {
      name: 'commit with head',
      args: ['diff', '--commit', 'HEAD', '--head', 'feature'],
      flags: ['--commit', '--head'],
    },
    {
      name: 'commit with two-dot',
      args: ['diff', '--commit', 'HEAD', '--two-dot'],
      flags: ['--commit', '--two-dot'],
    },
    {
      name: 'worktree with head',
      args: ['diff', '--worktree', '--head', 'feature'],
      flags: ['--worktree', '--head'],
    },
    {
      name: 'worktree with two-dot',
      args: ['diff', '--worktree', '--two-dot'],
      flags: ['--worktree', '--two-dot'],
    },
  ];

  for (const conflict of incompatible) {
    it(`rejects ${conflict.name}`, async () => {
      const { io, err } = capture();
      const code = await runCli(conflict.args, io);

      expect(code).toBe(5);
      expect(err.join('')).toContain(conflict.flags[0]);
      expect(err.join('')).toContain(conflict.flags[1]);
    });
  }

  it('returns 1 for unexpected errors and hides details unless debug is set', async () => {
    const normal = capture();
    const normalCode = await runCli(['diff', '--repo', '/whatever'], normal.io, failingDeps);

    expect(normalCode).toBe(1);
    expect(normal.err.join('')).toBe('error: internal failure\n');
    expect(normal.err.join('')).not.toContain('secret internals');

    const debug = capture();
    const debugCode = await runCli(['diff', '--repo', '/whatever'], debug.io, {
      ...failingDeps,
      debug: true,
    });

    expect(debugCode).toBe(1);
    expect(debug.err.join('')).toContain('secret internals');
  });
});
