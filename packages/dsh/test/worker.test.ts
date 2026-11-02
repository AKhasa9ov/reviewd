/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { ReviewApiError } from '../src/api.js';
import { extractReviewerReport, runWorkerLoop } from '../src/worker.js';

const config = {
  embedded: false,
  uiBase: '/code-review',
  daemonUrl: 'http://d',
  token: 't'.repeat(32),
  worker: true,
  workerConcurrency: 1,
  reviewerBackend: 'worker' as const,
  pollMs: 1,
  deliveryPollMs: 1,
  heartbeatMs: 1000,
  requestTimeoutMs: 1000,
  reviewerTimeoutMs: 600_000,
  cwd: '/repo',
  reviewerModel: undefined as Record<string, unknown> | undefined,
};

function reviewerAgent(options: {
  events?: unknown[];
  cancel?: (cause: unknown) => void;
  onDispose?: () => void;
  whenIdle?: () => Promise<void>;
  restrict?: (filter: unknown) => void;
  guard?: (guard: (execution: { name: string }) => string | undefined) => void;
  register?: (definition: any) => void;
}): { agent: any; dispose: () => Promise<void> } {
  return {
    agent: {
      followup: () => undefined,
      whenIdle: options.whenIdle ?? (async () => undefined),
      cancel: options.cancel ?? (() => undefined),
      session: { snapshotEvents: () => options.events ?? [] },
      ctx: {
        tools: {
          guard: (guard: (execution: { name: string }) => string | undefined) => {
            options.guard?.(guard);
            return () => undefined;
          },
          register: (definition: any) => {
            options.register?.(definition);
            return () => undefined;
          },
          restrict: (filter: unknown) => {
            options.restrict?.(filter);
            return () => undefined;
          },
        },
      },
    },
    dispose: async () => options.onDispose?.(),
  };
}

async function drive(overrides: {
  config?: typeof config;
  api: any;
  agents: any;
  defaultModel?: { currentSelection(): Record<string, unknown> };
  signal: AbortSignal;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  await runWorkerLoop(
    {
      config: overrides.config ?? config,
      api: overrides.api,
      agents: overrides.agents,
      ...(overrides.defaultModel === undefined ? {} : { defaultModel: overrides.defaultModel }),
      sleep: overrides.sleep ?? (async () => undefined),
    },
    overrides.signal,
  );
}

describe('reviewer output', () => {
  it('extracts the last fenced JSON report from assistant messages', () => {
    const events = [
      {
        type: 'assistant/message',
        data: { message: { content: [{ type: 'text', text: 'thinking' }] } },
      },
      {
        type: 'assistant/message',
        data: {
          message: {
            content: [
              {
                type: 'text',
                text: 'Here:\n```json\n{"schemaVersion":1,"summary":"ok","findings":[]}\n```',
              },
            ],
          },
        },
      },
    ];
    expect(extractReviewerReport(events)).toMatchObject({ schemaVersion: 1, summary: 'ok' });
  });

  it('falls back to an earlier report when the final message is prose', () => {
    const events = [
      {
        type: 'assistant/message',
        data: {
          message: {
            content: [
              { type: 'text', text: '```json\n{"schemaVersion":1,"summary":"early"}\n```' },
            ],
          },
        },
      },
      {
        type: 'assistant/message',
        data: { message: { content: [{ type: 'text', text: 'I ran out of time.' }] } },
      },
    ];
    expect(extractReviewerReport(events)).toMatchObject({ summary: 'early' });
  });

  it('returns undefined for non-JSON output', () => {
    expect(
      extractReviewerReport([
        {
          type: 'assistant/message',
          data: { message: { content: [{ type: 'text', text: 'no json' }] } },
        },
      ]),
    ).toBeUndefined();
  });
});

describe('worker loop', () => {
  it('does not register or poll when disposal already aborted the signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(`GET ${path}`);
        return null;
      },
      post: async (path: string) => {
        calls.push(`POST ${path}`);
        return {};
      },
    } as any;
    await runWorkerLoop(
      {
        config,
        api,
        agents: { create: async () => reviewerAgent({}) },
      },
      controller.signal,
    );
    // The host disposes loops before closing the daemon; a loop started after
    // that point must stay silent instead of polling a closing port.
    expect(calls).toEqual([]);
  });

  it('registers, creates a read-only reviewer agent, submits findings/report and acks', async () => {
    const controller = new AbortController();
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    let leaseServed = false;
    const api = {
      get: async (path: string) => {
        calls.push({ method: 'GET', path });
        if (path.includes('/api/jobs/next')) {
          if (leaseServed) {
            controller.abort();
            return null;
          }
          leaseServed = true;
          return {
            job: { id: 'job_1', attemptId: 'att_1', reviewId: 'rev_1', round: 1 },
            bundle: { prompt: 'Review this diff', meta: { cwd: '/repo' } },
          };
        }
        return null;
      },
      post: async (path: string, body: any) => {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') return { id: body.id };
        return {};
      },
    } as any;
    let guardFn: ((execution: { name: string }) => string | undefined) | undefined;
    let disposed = 0;
    const agents = {
      create: async () =>
        reviewerAgent({
          events: [
            {
              type: 'assistant/message',
              data: {
                message: {
                  content: [
                    {
                      type: 'text',
                      text: '```json\n{"schemaVersion":1,"summary":"ok","findings":[{"id":"f1"}]}\n```',
                    },
                  ],
                },
              },
            },
          ],
          guard: (guard) => {
            guardFn = guard;
          },
          onDispose: () => {
            disposed += 1;
          },
        }),
    };
    await runWorkerLoop({ config, api, agents, sleep: async () => undefined }, controller.signal);
    expect(calls[0]).toMatchObject({ path: '/api/workers/register' });
    expect(guardFn?.({ name: 'read' })).toBeUndefined();
    expect(guardFn?.({ name: 'grep' })).toBeUndefined();
    expect(guardFn?.({ name: 'write' })).toContain('read-only');
    expect(guardFn?.({ name: 'bash' })).toContain('read-only');
    expect(guardFn?.({ name: 'review_comments_list' })).toContain('read-only');
    expect(guardFn?.({ name: 'review_resolve_comment' })).toContain('read-only');
    expect(calls.some((call) => call.path.endsWith('/findings'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/ack'))).toBe(true);
    expect(disposed).toBe(1);
  });

  it('submits a structured review_report tool call without a fenced JSON message', async () => {
    const controller = new AbortController();
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    let served = false;
    const api = {
      get: async (path: string) => {
        calls.push({ method: 'GET', path });
        if (path.includes('/api/jobs/next')) {
          if (served) {
            controller.abort();
            return null;
          }
          served = true;
          return {
            job: { id: 'job_1', attemptId: 'att_1', reviewId: 'rev_1', round: 1 },
            bundle: { prompt: 'Review this diff' },
          };
        }
        return null;
      },
      post: async (path: string, body: any) => {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') return { id: body.id };
        return {};
      },
    } as any;
    let reportTool: any;
    let guardFn: ((execution: { name: string }) => string | undefined) | undefined;
    const agents = {
      create: async () =>
        reviewerAgent({
          events: [
            {
              type: 'assistant/message',
              data: {
                message: { content: [{ type: 'text', text: 'The report tool was used.' }] },
              },
            },
          ],
          register: (definition) => {
            reportTool = definition;
          },
          guard: (guard) => {
            guardFn = guard;
          },
          whenIdle: async () => {
            await reportTool.execute(
              {
                summary: 'Structured report',
                riskLevel: 'low',
                findings: [],
              },
              { signal: controller.signal },
            );
          },
        }),
    };
    await drive({ api, agents, signal: controller.signal });

    expect(guardFn?.({ name: 'review_report' })).toBeUndefined();
    const report = calls.find((call) => call.path.endsWith('/report'));
    expect(report?.body).toMatchObject({
      report: {
        schemaVersion: 1,
        summary: 'Structured report',
        riskLevel: 'low',
        findings: [],
      },
    });
    expect(calls.some((call) => call.path.endsWith('/ack'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/fail'))).toBe(false);
  });

  it('passes the host default model to the reviewer agent', async () => {
    const controller = new AbortController();
    let served = false;
    const createOptions: Array<Record<string, unknown>> = [];
    const api = {
      get: async (path: string) => {
        if (path.includes('/api/jobs/next')) {
          if (served) {
            controller.abort();
            return null;
          }
          served = true;
          return {
            job: { id: 'job_1', attemptId: 'att_1', reviewId: 'rev_1', round: 1 },
            bundle: { prompt: 'Review this diff' },
          };
        }
        return null;
      },
      post: async (path: string, body: any) =>
        path === '/api/workers/register' ? { id: body.id } : {},
    } as any;
    const agents = {
      create: async (options: Record<string, unknown>) => {
        createOptions.push(options);
        return reviewerAgent({
          events: [
            {
              type: 'assistant/message',
              data: {
                message: {
                  content: [
                    {
                      type: 'text',
                      text: '```json\n{"schemaVersion":1,"summary":"ok","findings":[]}\n```',
                    },
                  ],
                },
              },
            },
          ],
        });
      },
    };
    await drive({
      api,
      agents,
      defaultModel: {
        currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }),
      },
      signal: controller.signal,
    });
    expect(createOptions[0]?.agentOptions).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-flash',
    });
  });

  it('prefers an explicit reviewerModel over the host default', async () => {
    const controller = new AbortController();
    let served = false;
    const createOptions: Array<Record<string, unknown>> = [];
    const api = {
      get: async (path: string) => {
        if (path.includes('/api/jobs/next')) {
          if (served) {
            controller.abort();
            return null;
          }
          served = true;
          return {
            job: { id: 'job_1', attemptId: 'att_1', reviewId: 'rev_1', round: 1 },
            bundle: { prompt: 'Review this diff' },
          };
        }
        return null;
      },
      post: async (path: string, body: any) =>
        path === '/api/workers/register' ? { id: body.id } : {},
    } as any;
    const agents = {
      create: async (options: Record<string, unknown>) => {
        createOptions.push(options);
        return reviewerAgent({
          events: [
            {
              type: 'assistant/message',
              data: {
                message: {
                  content: [
                    {
                      type: 'text',
                      text: '```json\n{"schemaVersion":1,"summary":"ok","findings":[]}\n```',
                    },
                  ],
                },
              },
            },
          ],
        });
      },
    };
    await drive({
      config: {
        ...config,
        reviewerModel: { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash-1017' },
      },
      api,
      agents,
      defaultModel: {
        currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }),
      },
      signal: controller.signal,
    });
    expect(createOptions[0]?.agentOptions).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4.1-flash-1017',
    });
  });

  it('fails the job retryably when host model selection throws', async () => {
    const controller = new AbortController();
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    let served = false;
    const api = {
      get: async (path: string) => {
        calls.push({ method: 'GET', path });
        if (path.includes('/api/jobs/next')) {
          if (served) {
            controller.abort();
            return null;
          }
          served = true;
          return {
            job: { id: 'job_1', attemptId: 'att_1', reviewId: 'rev_1', round: 1 },
            bundle: { prompt: 'Review this diff' },
          };
        }
        return null;
      },
      post: async (path: string, body: any) => {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') return { id: body.id };
        return {};
      },
    } as any;
    await drive({
      api,
      agents: { create: async () => reviewerAgent({}) },
      defaultModel: {
        currentSelection: () => {
          throw new Error('model service unavailable');
        },
      },
      signal: controller.signal,
    });
    const failure = calls.find((call) => call.path.endsWith('/fail'));
    expect(failure?.body).toMatchObject({
      code: 'agent-create-failed',
      message: 'model service unavailable',
      retryable: true,
    });
  });

  it('cancels, disposes and fails retryably when the reviewer times out', async () => {
    const controller = new AbortController();
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    const cancels: unknown[] = [];
    let disposed = 0;
    let served = false;
    const api = {
      get: async (path: string) => {
        calls.push({ method: 'GET', path });
        if (path.includes('/api/jobs/next')) {
          if (served) {
            controller.abort();
            return null;
          }
          served = true;
          return {
            job: { id: 'job_1', attemptId: 'att_1', reviewId: 'rev_1', round: 1 },
            bundle: { prompt: 'Review this diff' },
          };
        }
        return null;
      },
      post: async (path: string, body: any) => {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') return { id: body.id };
        return {};
      },
    } as any;
    const agents = {
      create: async () =>
        reviewerAgent({
          whenIdle: () => new Promise<void>(() => undefined),
          cancel: (cause) => {
            cancels.push(cause);
          },
          onDispose: () => {
            disposed += 1;
          },
        }),
    };
    await drive({
      config: { ...config, reviewerTimeoutMs: 20 },
      api,
      agents,
      signal: controller.signal,
    });
    expect(cancels).toEqual([{ kind: 'timeout' }]);
    expect(disposed).toBe(1);
    const failure = calls.find((call) => call.path.endsWith('/fail'));
    expect(failure?.body).toMatchObject({ code: 'reviewer-timeout', retryable: true });
    expect(calls.some((call) => call.path.endsWith('/ack'))).toBe(false);
  });

  it('retries registration with exponential backoff until the daemon answers', async () => {
    const controller = new AbortController();
    const sleeps: number[] = [];
    const ids: string[] = [];
    let attempts = 0;
    const api = {
      get: async () => {
        controller.abort();
        return null;
      },
      post: async (path: string, body: any) => {
        if (path === '/api/workers/register') {
          attempts += 1;
          ids.push(body.id);
          if (attempts <= 2) throw new Error('daemon offline');
          return { id: body.id };
        }
        return {};
      },
    } as any;
    const agents = { create: async () => reviewerAgent({}) };
    await drive({
      api,
      agents,
      signal: controller.signal,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(attempts).toBe(3);
    expect(new Set(ids).size).toBe(1);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('registers again when a daemon restarted and forgot the worker id', async () => {
    const controller = new AbortController();
    let registrations = 0;
    let polls = 0;
    const api = {
      get: async () => {
        polls += 1;
        if (polls === 1) {
          throw new ReviewApiError('unauthorized', 401, 'unknown worker; register again');
        }
        controller.abort();
        return null;
      },
      post: async (path: string, body: any) => {
        if (path === '/api/workers/register') {
          registrations += 1;
          return { id: body.id };
        }
        return {};
      },
    } as any;
    await drive({
      api,
      agents: { create: async () => reviewerAgent({}) },
      signal: controller.signal,
      sleep: async () => undefined,
    });
    expect(registrations).toBe(2);
  });

  it('rejects a report that does not carry schemaVersion 1', async () => {
    const controller = new AbortController();
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    let served = false;
    const api = {
      get: async (path: string) => {
        calls.push({ method: 'GET', path });
        if (path.includes('/api/jobs/next')) {
          if (served) {
            controller.abort();
            return null;
          }
          served = true;
          return {
            job: { id: 'job_1', attemptId: 'att_1', reviewId: 'rev_1', round: 1 },
            bundle: { prompt: 'Review this diff' },
          };
        }
        return null;
      },
      post: async (path: string, body: any) => {
        calls.push({ method: 'POST', path, body });
        if (path === '/api/workers/register') return { id: body.id };
        return {};
      },
    } as any;
    const agents = {
      create: async () =>
        reviewerAgent({
          events: [
            {
              type: 'assistant/message',
              data: {
                message: {
                  content: [
                    { type: 'text', text: '```json\n{"schemaVersion":2,"summary":"ok"}\n```' },
                  ],
                },
              },
            },
          ],
        }),
    };
    await drive({ api, agents, signal: controller.signal });
    const failure = calls.find((call) => call.path.endsWith('/fail'));
    expect(failure?.body).toMatchObject({ code: 'invalid-output', retryable: false });
    expect(calls.some((call) => call.path.endsWith('/findings'))).toBe(false);
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(false);
    expect(calls.some((call) => call.path.endsWith('/ack'))).toBe(false);
  });
});
