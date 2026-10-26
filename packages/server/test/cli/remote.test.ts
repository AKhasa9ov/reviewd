import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { CliDeps } from '../../src/cli/run.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

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
      stdout: { write: (text) => (out.push(text), true) },
      stderr: { write: (text) => (err.push(text), true) },
    },
  };
}

function fakeFetch(
  handler: (
    call: Call,
  ) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>,
): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(init.headers ?? {}))
      headers[key.toLowerCase()] = String(value);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
    };
    calls.push(call);
    const result = await handler(call);
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: impl as typeof fetch, calls };
}

function deps(fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = {}): CliDeps {
  return {
    resolveRepoRoot: async () => '/repo',
    resolveDefaultBase: async () => 'main',
    buildSnapshot: async () => {
      throw new Error('unused');
    },
    fetch: fetchImpl,
    env,
    cwd: '/repo',
  };
}

describe('remote CLI', () => {
  it('starts a review and prints stable JSON', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 201,
      body: { review: { review: { id: 'rev_1' } }, url: 'http://ui/review/rev_1', warnings: [] },
    }));
    const { io, out } = capture();
    const code = await runCli(
      [
        'start',
        '--daemon',
        'http://reviewd:3100',
        '--repo',
        '/repo',
        '--title',
        'T',
        '--reviewer',
        'worker',
        '--json',
      ],
      io,
      deps(fetch, { CODE_REVIEW_TOKEN: 't'.repeat(32) }),
    );
    expect(code).toBe(0);
    expect(JSON.parse(out.join(''))).toEqual({
      review: { review: { id: 'rev_1' } },
      url: 'http://ui/review/rev_1',
      warnings: [],
    });
    expect(calls[0]?.url).toBe('http://reviewd:3100/api/reviews');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${'t'.repeat(32)}`);
    expect(calls[0]?.body).toMatchObject({
      repoRoot: '/repo',
      title: 'T',
      reviewer: { backend: 'worker' },
    });
  });

  it('reads status, comments, feedback and submits', async () => {
    const { fetch } = fakeFetch((call) => {
      if (call.method === 'GET' && call.url.endsWith('/api/reviews/rev_1')) {
        return {
          body: { review: { id: 'rev_1', title: 'T', status: 'open', rounds: [{}], comments: [] } },
        };
      }
      if (call.method === 'GET' && call.url.endsWith('/feedback')) {
        return { body: { feedback: { markdown: '# Feedback' }, deliveryKey: 'k' } };
      }
      return { body: { comment: { id: 'cmt_1' }, submission: { deliveryKey: 'k' } } };
    });
    const config = deps(fetch, {
      CODE_REVIEW_URL: 'http://reviewd:3100',
      CODE_REVIEW_TOKEN: 't'.repeat(32),
    });
    const status = capture();
    expect(await runCli(['status', 'rev_1', '--json'], status.io, config)).toBe(0);
    expect(JSON.parse(status.out.join('')).review.id).toBe('rev_1');

    const add = capture();
    expect(
      await runCli(
        ['comments', 'add', 'rev_1', '--file', 'src/a.ts', '--line', '2', '--body', 'x', '--json'],
        add.io,
        config,
      ),
    ).toBe(0);
    expect(JSON.parse(add.out.join('')).comment.id).toBe('cmt_1');

    const feedback = capture();
    expect(await runCli(['feedback', 'rev_1', '--format', 'md'], feedback.io, config)).toBe(0);
    expect(feedback.out.join('')).toContain('# Feedback');

    const submit = capture();
    expect(
      await runCli(['submit', 'rev_1', '--request-changes', '--summary', 'fix'], submit.io, config),
    ).toBe(0);
    expect(submit.out.join('')).toContain('submitted');
  });

  it('maps HTTP and network failures to documented exit codes', async () => {
    const cases: Array<[number, number]> = [
      [401, 3],
      [400, 5],
      [409, 6],
      [429, 6],
    ];
    for (const [status, expected] of cases) {
      const { fetch } = fakeFetch(() => ({
        status,
        body: { error: { code: 'x', message: 'nope' } },
      }));
      const { io } = capture();
      expect(
        await runCli(
          ['status', 'rev_1'],
          io,
          deps(fetch, { CODE_REVIEW_URL: 'http://d', CODE_REVIEW_TOKEN: 't'.repeat(32) }),
        ),
      ).toBe(expected);
    }
    const broken = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const { io } = capture();
    expect(
      await runCli(
        ['health'],
        io,
        deps(broken, { CODE_REVIEW_URL: 'http://d', CODE_REVIEW_TOKEN: 't'.repeat(32) }),
      ),
    ).toBe(4);
  });

  it('prints serve help without starting a daemon', async () => {
    const { io, out } = capture();
    const code = await runCli(['serve', '--help'], io, deps(fetch, {}));
    expect(code).toBe(0);
    expect(out.join('')).toContain('review serve');
    expect(out.join('')).toContain('CODE_REVIEW_TOKEN');
  });
});

describe('review serve', () => {
  it('starts and shuts down on abort', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'review-serve-'));
    cleanups.push(async () => {
      await rm(dir, { recursive: true, force: true });
    });
    const controller = new AbortController();
    const { io, out } = capture();
    const config = deps(fetch, { CODE_REVIEW_TOKEN: 't'.repeat(32) });
    config.signal = controller.signal;
    const running = runCli(['serve', '--store', dir, '--port', '0'], io, config);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(out.join('')).toContain('reviewd listening on http://');
    controller.abort();
    expect(await running).toBe(0);
  });
});

describe('remote maintenance commands', () => {
  it('refreshes, posts fix claims from a file and garbage-collects', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'review-cli-'));
    cleanups.push(async () => {
      await rm(dir, { recursive: true, force: true });
    });
    const claimsFile = join(dir, 'claims.json');
    await writeFile(
      claimsFile,
      JSON.stringify({ items: [{ commentId: 'cmt_1', status: 'fixed' }] }),
    );
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/refresh')) return { body: { review: { id: 'rev_1' } } };
      if (call.url.endsWith('/fix-status')) return { body: { ok: true } };
      return { body: { removedReviews: [], removedSnapshots: 0 } };
    });
    const config = deps(fetch, { CODE_REVIEW_URL: 'http://d', CODE_REVIEW_TOKEN: 't'.repeat(32) });

    const refresh = capture();
    expect(await runCli(['refresh', 'rev_1'], refresh.io, config)).toBe(0);
    expect(calls.at(-1)?.url).toBe('http://d/api/reviews/rev_1/refresh');

    const fix = capture();
    expect(await runCli(['fix-status', 'rev_1', '--json', `@${claimsFile}`], fix.io, config)).toBe(
      0,
    );
    expect(calls.at(-1)?.body).toEqual({ items: [{ commentId: 'cmt_1', status: 'fixed' }] });

    const gc = capture();
    expect(await runCli(['gc', '--older-than', '0d'], gc.io, config)).toBe(0);
    expect(calls.at(-1)?.url).toBe('http://d/api/gc');
    expect(calls.at(-1)?.body).toEqual({ olderThanDays: 0 });
  });
});
