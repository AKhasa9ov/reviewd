import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo } from '../../core/test/helpers/repo.js';
import type { Snapshot } from '@dsh-code-review/core';
import { runCli } from '../src/cli/run.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

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
    const snapshot = JSON.parse(out.join('')) as Snapshot;
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
    const { io, err } = capture();
    const code = await runCli(['diff', '--repo', '/tmp', '--json'], io);

    expect(code).toBe(5);
    expect(err.join('')).toContain('not a git repository');
  });

  it('prints help and version with exit code 0', async () => {
    const help = capture();
    expect(await runCli(['help'], help.io)).toBe(0);
    expect(help.out.join('')).toContain('review diff');

    const version = capture();
    expect(await runCli(['version'], version.io)).toBe(0);
    expect(version.out.join('')).toContain('review 0.1.0');
  });
});
