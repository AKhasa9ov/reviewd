/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { extractReviewerReport, runWorkerLoop } from '../src/worker.js';

const config = {
  daemonUrl: 'http://d',
  token: 't'.repeat(32),
  worker: true,
  reviewerBackend: 'worker' as const,
  pollMs: 1,
  deliveryPollMs: 1,
  heartbeatMs: 1000,
  requestTimeoutMs: 1000,
  reviewerTimeoutMs: 600_000,
  cwd: '/repo',
};

function reviewerAgent(options: {
  events?: unknown[];
  cancel?: (cause: unknown) => void;
  onDispose?: () => void;
  whenIdle?: () => Promise<void>;
  restrict?: (filter: unknown) => void;
}): { agent: any; dispose: () => Promise<void> } {
  return {
    agent: {
      followup: () => undefined,
      whenIdle: options.whenIdle ?? (async () => undefined),
      cancel: options.cancel ?? (() => undefined),
      snapshotEvents: () => options.events ?? [],
      ctx: {
        tools: {
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
  signal: AbortSignal;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  await runWorkerLoop(
    {
      config: overrides.config ?? config,
      api: overrides.api,
      agents: overrides.agents,
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
    let restricted: unknown;
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
          restrict: (filter) => {
            restricted = filter;
          },
          onDispose: () => {
            disposed += 1;
          },
        }),
    };
    await runWorkerLoop({ config, api, agents, sleep: async () => undefined }, controller.signal);
    expect(calls[0]).toMatchObject({ path: '/api/workers/register' });
    expect(restricted).toEqual({
      deny: [
        'bash',
        'write',
        'edit',
        'apply_patch',
        'workflow',
        'subagent_fork',
        'subagent',
        'review_start',
        'review_refresh',
      ],
    });
    expect(calls.some((call) => call.path.endsWith('/findings'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/ack'))).toBe(true);
    expect(disposed).toBe(1);
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
