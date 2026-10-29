/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { createReviewCommand } from '../src/command.js';

function setup(overrides: Record<string, unknown> = {}) {
  let handler: any;
  const ctx: any = {
    tools: { register: () => () => undefined },
    commands: {
      register: (definition: Record<string, unknown>) => {
        handler = definition.handler;
        return () => undefined;
      },
    },
  };
  const api = {
    post: async () => ({
      review: { review: { id: 'rev_1' } },
      url: 'http://127.0.0.1:45123/review/rev_1',
    }),
  } as any;
  const config = {
    embedded: false,
    uiBase: '/code-review',
    daemonUrl: 'http://daemon',
    token: 't'.repeat(32),
    worker: false,
    workerConcurrency: 1,
    repoHint: '/repo',
    reviewerBackend: 'worker' as const,
    pollMs: 1,
    deliveryPollMs: 1,
    heartbeatMs: 1,
    requestTimeoutMs: 1000,
    reviewerTimeoutMs: 600_000,
    ...overrides,
  };
  createReviewCommand(ctx, config as any, api);
  return {
    invoke: () =>
      handler({
        agent: { id: 'a', session: { id: 's1' } },
        rawInput: '',
        signal: new AbortController().signal,
      }),
  };
}

describe('review command', () => {
  it('prints the DSH-hosted SPA path in embedded mode, not the loopback daemon URL', async () => {
    const { invoke } = setup({ embedded: true, uiBase: '/code-review' });
    await expect(invoke()).resolves.toMatchObject({
      kind: 'success',
      text: 'Review rev_1 started: /code-review/review/rev_1',
    });
  });

  it('keeps the daemon URL in external mode', async () => {
    const { invoke } = setup();
    await expect(invoke()).resolves.toMatchObject({
      kind: 'success',
      text: 'Review rev_1 started: http://127.0.0.1:45123/review/rev_1',
    });
  });
});
