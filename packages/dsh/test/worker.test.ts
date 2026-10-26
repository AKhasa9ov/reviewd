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
  cwd: '/repo',
};

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
      post: async (path: string, body: unknown) => {
        calls.push({ method: 'POST', path, body });
        return {};
      },
    } as any;
    let restricted: unknown;
    const events: unknown[] = [];
    const agents = {
      create: async () => {
        events.push({
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
        });
        return {
          agent: {
            followup: () => undefined,
            whenIdle: async () => undefined,
            cancel: () => undefined,
            snapshotEvents: () => events,
            ctx: {
              tools: {
                restrict: (filter: unknown) => {
                  restricted = filter;
                  return () => undefined;
                },
              },
            },
          },
        };
      },
    };
    await runWorkerLoop({ config, api, agents, sleep: async () => undefined }, controller.signal);
    expect(calls[0]).toMatchObject({ path: '/api/workers/register' });
    expect(restricted).toEqual({ deny: ['write', 'edit', 'apply_patch'] });
    expect(calls.some((call) => call.path.endsWith('/findings'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/report'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/ack'))).toBe(true);
  });
});
