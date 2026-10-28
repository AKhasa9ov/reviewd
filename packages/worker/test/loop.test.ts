import { describe, expect, it } from 'vitest';
import { runWorkerLoop, WorkerRunError } from '../src/index.js';
import type { JobLease, WorkerApi, WorkerLoopOptions } from '../src/index.js';

interface Call {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

function lease(): JobLease {
  return {
    id: 'job_1',
    reviewId: 'rev_1',
    round: 1,
    kind: 'initial',
    backend: 'worker',
    attempt: 1,
    attemptId: 'att_1',
    leaseUntil: '2026-10-28T00:00:00.000Z',
    bundle: { prompt: 'Review this diff', meta: { cwd: '/repo' } },
  };
}

function apiFor(controller: AbortController, calls: Call[], job: JobLease | null): WorkerApi {
  let served = false;
  return {
    async get<T>(path: string): Promise<T> {
      calls.push({ method: 'GET', path });
      if (!path.includes('/api/jobs/next')) return null as T;
      if (served) {
        controller.abort();
        return null as T;
      }
      served = true;
      return job as T;
    },
    async post<T>(path: string, body: unknown): Promise<T> {
      calls.push({ method: 'POST', path, body });
      if (path === '/api/workers/register') {
        return { id: (body as { id: string }).id } as T;
      }
      return {} as T;
    },
  };
}

function options(api: WorkerApi, runner: WorkerLoopOptions['runner']): WorkerLoopOptions {
  return {
    api,
    runner,
    identity: { harness: 'codex', name: 'test-worker' },
    pollMs: 1,
    heartbeatMs: 1_000,
    randomId: () => 'wkr_test',
    sleep: async () => undefined,
  };
}

describe('runWorkerLoop', () => {
  it('does not call the daemon when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    await runWorkerLoop(
      options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
      controller.signal,
    );
    expect(calls).toEqual([]);
  });

  it('registers, leases, submits findings/report, and acks', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    const seen: JobLease[] = [];
    await runWorkerLoop(
      options(api, {
        async run(received) {
          seen.push(received);
          return {
            findings: [{ id: 'f1', title: 'found' }],
            report: {
              schemaVersion: 1,
              summary: 'ok',
              findings: [{ id: 'f1', title: 'found' }],
            },
          };
        },
      }),
      controller.signal,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.bundle.prompt).toBe('Review this diff');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/api/workers/register',
      body: { id: 'wkr_test', name: 'test-worker', harness: 'codex' },
    });
    expect(calls.some((call) => call.path.includes('/api/jobs/next?workerId=wkr_test'))).toBe(true);
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/findings',
      body: { attemptId: 'att_1', findings: [{ id: 'f1', title: 'found' }] },
    });
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/report',
      body: {
        attemptId: 'att_1',
        report: {
          schemaVersion: 1,
          summary: 'ok',
          findings: [{ id: 'f1', title: 'found' }],
        },
      },
    });
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/ack',
      body: { attemptId: 'att_1' },
    });
  });

  it('reports a retryable runner failure without posting a report', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    await runWorkerLoop(
      options(api, {
        run: async () => {
          throw new WorkerRunError('timeout', 'reviewer timed out', true);
        },
      }),
      controller.signal,
    );

    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/fail',
      body: {
        attemptId: 'att_1',
        code: 'timeout',
        message: 'reviewer timed out',
        retryable: true,
      },
    });
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(false);
  });

  it('rejects an invalid report as non-retryable', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    await runWorkerLoop(
      options(api, {
        run: async () => ({ report: { schemaVersion: 2, summary: 'wrong' } }),
      }),
      controller.signal,
    );

    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/fail',
      body: {
        attemptId: 'att_1',
        code: 'invalid-output',
        message: 'runner report must use schemaVersion 1 (received 2)',
        retryable: false,
      },
    });
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(false);
  });

  it('re-registers after a stale worker error', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    let nextCalls = 0;
    let registrations = 0;
    const api: WorkerApi = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        if (!path.includes('/api/jobs/next')) return null as T;
        nextCalls += 1;
        if (nextCalls === 1) {
          throw Object.assign(new Error('unknown worker'), {
            status: 401,
            code: 'unauthorized',
          });
        }
        controller.abort();
        return null as T;
      },
      async post<T>(path: string, body: unknown): Promise<T> {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') {
          registrations += 1;
          return { id: (body as { id: string }).id } as T;
        }
        return {} as T;
      },
    };

    await runWorkerLoop(
      options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
      controller.signal,
    );

    expect(registrations).toBe(2);
    expect(nextCalls).toBe(2);
  });

  it('stops instead of re-registering forever when a fresh registration is stale again', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const warnings: string[] = [];
    let nextCalls = 0;
    let registrations = 0;
    const api: WorkerApi = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        if (!path.includes('/api/jobs/next')) return null as T;
        nextCalls += 1;
        if (nextCalls > 2) {
          // Safety valve: an unbounded re-register loop must fail the assertions
          // below rather than hanging the test suite.
          controller.abort();
          return null as T;
        }
        throw Object.assign(new Error('forbidden'), { status: 403, code: 'forbidden' });
      },
      async post<T>(path: string, body: unknown): Promise<T> {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') {
          registrations += 1;
          return { id: (body as { id: string }).id } as T;
        }
        return {} as T;
      },
    };

    await runWorkerLoop(
      {
        ...options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
        logger: { warn: (message) => warnings.push(message) },
      },
      controller.signal,
    );

    expect(registrations).toBe(2);
    expect(nextCalls).toBe(2);
    expect(warnings.some((message) => /stale/i.test(message) && /stop/i.test(message))).toBe(true);
  });
});
