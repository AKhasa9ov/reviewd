/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { runDeliveryLoop } from '../src/delivery.js';
import type { DeliveryRecord } from '../src/delivery.js';

const config = {
  embedded: false,
  uiBase: '/code-review',
  daemonUrl: 'http://d',
  token: 't'.repeat(32),
  worker: false,
  workerConcurrency: 1,
  reviewerBackend: 'worker' as const,
  pollMs: 1,
  deliveryPollMs: 1,
  heartbeatMs: 1,
  requestTimeoutMs: 1000,
  reviewerTimeoutMs: 600_000,
};
type DeliveryRecordWithFeedbackVerdict = DeliveryRecord & {
  feedback: DeliveryRecord['feedback'] & {
    json: { verdict: 'approve' | 'request-changes' | 'comment' };
  };
};

function record(
  overrides: Partial<DeliveryRecordWithFeedbackVerdict> = {},
): DeliveryRecordWithFeedbackVerdict {
  return {
    id: 'dlv_1',
    deliveryKey: 'review:1:sub',
    reviewId: 'rev_1',
    round: 1,
    submissionId: 'sub',
    harness: 'dsh',
    initiator: { harness: 'dsh', sessionId: 'session-1', cwd: '/repo' },
    feedback: { markdown: '# Feedback\n\nFix it.', json: { verdict: 'request-changes' } },
    ...overrides,
  };
}

describe('delivery bridge', () => {
  it('prompts the initiating session with a stable request id and acks', async () => {
    const prompts: any[] = [];
    const acks: string[] = [];
    const controller = new AbortController();
    const api = {
      get: async () => ({ deliveries: [record()] }),
      post: async (path: string) => {
        acks.push(path);
        controller.abort();
        return {};
      },
    } as any;
    await runDeliveryLoop(
      {
        config,
        api,
        sessionController: {
          resolveAgent: async () => ({ agent: {} }),
          prompt: async (request) => {
            prompts.push(request);
          },
        },
        sleep: async () => undefined,
      },
      controller.signal,
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({
      sessionId: 'session-1',
      mode: 'queue',
      requestId: 'cr:review:1:sub',
    });
    const text = prompts[0].content[0].text as string;
    const header = text.slice(0, text.indexOf('# Feedback'));
    expect(text).toContain('Feedback');
    expect(header).toContain('Start the fix round');
    expect(header).toContain('call review_refresh');
    expect(header).not.toContain('review_fix_status');
    expect(header).toContain('review_resolve_comment');
    expect(acks[0]).toBe('/api/deliveries/dlv_1/ack');
  });

  it('does not ask for a fix round when the review was approved', async () => {
    const prompts: any[] = [];
    const controller = new AbortController();
    const api = {
      get: async () => ({
        deliveries: [
          record({
            feedback: { markdown: '# Feedback\n\nApproved.', json: { verdict: 'approve' } },
          }),
        ],
      }),
      post: async () => {
        controller.abort();
        return {};
      },
    } as any;
    await runDeliveryLoop(
      {
        config,
        api,
        sessionController: {
          resolveAgent: async () => ({ agent: {} }),
          prompt: async (request) => {
            prompts.push(request);
          },
        },
        sleep: async () => undefined,
      },
      controller.signal,
    );
    expect(prompts).toHaveLength(1);
    const text = prompts[0].content[0].text as string;
    expect(text).toContain('No fix round is required');
    expect(text).not.toContain('Start the fix round');
    expect(text).not.toContain('# Feedback');
  });

  it('leaves a delivery without an initiator pending and does not prompt', async () => {
    const prompts: any[] = [];
    const controller = new AbortController();
    const api = {
      get: async () => {
        controller.abort();
        return { deliveries: [record({ initiator: undefined })] };
      },
      post: async () => ({}),
    } as any;
    await runDeliveryLoop(
      {
        config,
        api,
        sessionController: {
          prompt: async (request) => {
            prompts.push(request);
          },
        },
        sleep: async () => undefined,
      },
      controller.signal,
    );
    expect(prompts).toEqual([]);
  });

  it('retries a failed session prompt without acknowledging', async () => {
    let attempts = 0;
    const acks: string[] = [];
    const controller = new AbortController();
    const api = {
      get: async () => ({ deliveries: [record()] }),
      post: async (path: string) => {
        acks.push(path);
        controller.abort();
        return {};
      },
    } as any;
    await runDeliveryLoop(
      {
        config,
        api,
        sessionController: {
          prompt: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('closed');
          },
        },
        sleep: async () => undefined,
      },
      controller.signal,
    );
    expect(attempts).toBe(2);
    expect(acks).toEqual(['/api/deliveries/dlv_1/ack']);
  });

  it('stops after three failed prompts and marks the delivery failed', async () => {
    let attempts = 0;
    let failed = false;
    const posts: string[] = [];
    const controller = new AbortController();
    const api = {
      get: async () => {
        if (attempts >= 5) controller.abort();
        return { deliveries: failed || attempts >= 5 ? [] : [record()] };
      },
      post: async (path: string) => {
        posts.push(path);
        if (path.endsWith('/fail')) {
          failed = true;
          controller.abort();
        }
        return {};
      },
    } as any;
    await runDeliveryLoop(
      {
        config,
        api,
        sessionController: {
          prompt: async () => {
            attempts += 1;
            throw new Error('session closed');
          },
        },
        sleep: async () => undefined,
      },
      controller.signal,
    );
    expect(attempts).toBe(3);
    expect(posts).toEqual(['/api/deliveries/dlv_1/fail']);
  });
});
