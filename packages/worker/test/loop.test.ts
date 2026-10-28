import { getEventListeners } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { runWorkerLoop, WorkerRunError } from '../src/index.js';
import type { JobLease, RunnerResult, WorkerApi, WorkerLoopOptions } from '../src/index.js';

interface Call {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

function lease(overrides: Partial<JobLease> = {}): JobLease {
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
    ...overrides,
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

  it('releases the abort listener when the default poll backoff times out', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const listenerCounts: number[] = [];
    let nextCalls = 0;
    const api: WorkerApi = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        if (!path.includes('/api/jobs/next')) return null as T;
        nextCalls += 1;
        if (nextCalls === 1) return null as T;
        // Reaching the second poll proves the first default wait resolved through
        // its timer; the timeout path must have removed its abort listener.
        listenerCounts.push(getEventListeners(controller.signal, 'abort').length);
        controller.abort();
        return null as T;
      },
      async post<T>(path: string, body: unknown): Promise<T> {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') {
          return { id: (body as { id: string }).id } as T;
        }
        return {} as T;
      },
    };

    await runWorkerLoop(
      {
        ...options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
        pollMs: 1,
        sleep: undefined,
      },
      controller.signal,
    );

    expect(listenerCounts).toEqual([0]);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('aborts a pending default poll backoff promptly and removes its listener', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    let markPolled: () => void = () => undefined;
    const firstPoll = new Promise<void>((resolve) => {
      markPolled = resolve;
    });
    const api: WorkerApi = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        if (!path.includes('/api/jobs/next')) return null as T;
        markPolled();
        return null as T;
      },
      async post<T>(path: string, body: unknown): Promise<T> {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') {
          return { id: (body as { id: string }).id } as T;
        }
        return {} as T;
      },
    };

    const loop = runWorkerLoop(
      {
        ...options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
        pollMs: 60_000,
        sleep: undefined,
      },
      controller.signal,
    );

    await firstPoll;
    await vi.waitFor(() => {
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
    });
    controller.abort();
    await loop;

    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  }, 2_000);

  it('posts report-only findings to both the findings event and the report', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    const findings = [{ id: 'f2', title: 'from report' }];
    await runWorkerLoop(
      options(api, {
        run: async () => ({ report: { schemaVersion: 1, summary: 'ok', findings } }),
      }),
      controller.signal,
    );

    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/findings',
      body: { attemptId: 'att_1', findings },
    });
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/report',
      body: { attemptId: 'att_1', report: { schemaVersion: 1, summary: 'ok', findings } },
    });
  });

  it('rejects divergent result/report findings as non-retryable invalid output', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    await runWorkerLoop(
      options(api, {
        run: async () => ({
          findings: [{ id: 'from-result' }],
          report: { schemaVersion: 1, findings: [{ id: 'from-report' }] },
        }),
      }),
      controller.signal,
    );

    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/fail',
      body: {
        attemptId: 'att_1',
        code: 'invalid-output',
        message:
          'runner returned findings in both the result and the report, and they differ; return one source or make them identical',
        retryable: false,
      },
    });
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(false);
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

  it('re-registers again when a successful poll resets the stale guard', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const steps: Array<'stale' | 'ok'> = ['stale', 'ok', 'stale', 'ok'];
    let nextCalls = 0;
    let registrations = 0;
    const api: WorkerApi = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        if (!path.includes('/api/jobs/next')) return null as T;
        const step = steps[nextCalls];
        nextCalls += 1;
        if (step === undefined) {
          // Safety valve: an unbounded re-register loop must fail the assertions
          // below rather than hanging the test suite.
          controller.abort();
          return null as T;
        }
        if (step === 'ok') return null as T;
        throw Object.assign(new Error('unknown worker'), {
          status: 401,
          code: 'unauthorized',
        });
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

    // stale -> register #2 -> successful poll -> stale -> register #3.
    expect(registrations).toBe(3);
    expect(nextCalls).toBe(5);
  });

  it('heartbeats on the configured interval and stops after abort', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const calls: Call[] = [];
      const api: WorkerApi = {
        async get<T>(path: string): Promise<T> {
          calls.push({ method: 'GET', path });
          if (!path.includes('/api/jobs/next')) return null as T;
          // Model a long poll that only settles when the abort signal fires.
          return new Promise<T>((resolve) => {
            if (controller.signal.aborted) {
              resolve(null as T);
              return;
            }
            controller.signal.addEventListener('abort', () => resolve(null as T), { once: true });
          });
        },
        async post<T>(path: string, body: unknown): Promise<T> {
          calls.push({ method: 'POST', path, body });
          if (path === '/api/workers/register') {
            return { id: (body as { id: string }).id } as T;
          }
          return {} as T;
        },
      };
      const heartbeats = (): Call[] =>
        calls.filter((call) => call.path === '/api/workers/wkr_test/heartbeat');

      const loop = runWorkerLoop(
        options(api, { run: async () => ({ report: { schemaVersion: 1 } }) }),
        controller.signal,
      );
      await vi.advanceTimersByTimeAsync(1);
      expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/workers/register' });
      expect(heartbeats()).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(heartbeats()).toHaveLength(1);

      controller.abort();
      await loop;
      await vi.advanceTimersByTimeAsync(3_000);
      expect(heartbeats()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops without posting a failure when a non-cooperative runner ignores the abort', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    let cancelCalls = 0;
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const api: WorkerApi = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        if (!path.includes('/api/jobs/next')) return null as T;
        return lease() as T;
      },
      async post<T>(path: string, body: unknown): Promise<T> {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') {
          return { id: (body as { id: string }).id } as T;
        }
        return {} as T;
      },
    };
    const runner: WorkerLoopOptions['runner'] = {
      run: async () => {
        markStarted();
        // Ignores the signal on purpose: only the loop's own abort race can end this.
        return new Promise<RunnerResult>(() => undefined);
      },
      cancel: () => {
        cancelCalls += 1;
        throw new Error('cancel blew up');
      },
    };

    const loop = runWorkerLoop(options(api, runner), controller.signal);
    await started;
    controller.abort();
    await loop;

    expect(cancelCalls).toBe(1);
    expect(calls.some((call) => call.path.endsWith('/fail'))).toBe(false);
  }, 2_000);

  it('rejects an unsupported lease protocol version before running the runner', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(
      controller,
      calls,
      lease({ protocolVersion: 2, promptVersion: 1, bundle: { prompt: 'Review this diff' } }),
    );
    let runs = 0;
    await runWorkerLoop(
      options(api, {
        run: async () => {
          runs += 1;
          return { report: { schemaVersion: 1 } };
        },
      }),
      controller.signal,
    );

    expect(runs).toBe(0);
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/jobs/job_1/fail',
      body: {
        attemptId: 'att_1',
        code: 'protocol-mismatch',
        message: expect.stringMatching(/protocol version 1/),
        retryable: false,
      },
    });
    expect(
      calls.some((call) => call.path.endsWith('/findings') || call.path.endsWith('/report')),
    ).toBe(false);
  });

  it('runs a legacy v0 lease and warns about the migration', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(controller, calls, lease());
    const warnings: string[] = [];
    let runs = 0;
    await runWorkerLoop(
      {
        ...options(api, {
          run: async () => {
            runs += 1;
            return { report: { schemaVersion: 1 } };
          },
        }),
        logger: { warn: (message) => warnings.push(message) },
      },
      controller.signal,
    );

    expect(runs).toBe(1);
    expect(warnings.some((message) => /v0/.test(message))).toBe(true);
    expect(warnings.some((message) => /protocol version 1/.test(message))).toBe(true);
  });

  it('accepts an explicit v1 lease without a migration warning', async () => {
    const controller = new AbortController();
    const calls: Call[] = [];
    const api = apiFor(
      controller,
      calls,
      lease({ protocolVersion: 1, promptVersion: 1, bundle: { prompt: 'Review this diff' } }),
    );
    const warnings: string[] = [];
    let runs = 0;
    await runWorkerLoop(
      {
        ...options(api, {
          run: async () => {
            runs += 1;
            return { report: { schemaVersion: 1 } };
          },
        }),
        logger: { warn: (message) => warnings.push(message) },
      },
      controller.signal,
    );

    expect(runs).toBe(1);
    expect(warnings).toEqual([]);
  });
});
