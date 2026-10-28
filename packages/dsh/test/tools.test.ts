/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { createReviewTools } from '../src/tools.js';
import type { PluginContext } from '../src/tools.js';

function setup(overrides: Record<string, unknown> = {}) {
  const definitions: Array<Record<string, any>> = [];
  const ctx: PluginContext = {
    tools: {
      register: (definition) => {
        definitions.push(definition as Record<string, any>);
        return () => undefined;
      },
    },
  };
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const api = {
    get: async (path: string) => {
      calls.push({ method: 'GET', path });
      return {
        review: { id: 'rev_1', title: 'T', status: 'open', rounds: [1], comments: [] },
        report: null,
      };
    },
    post: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      return { review: { review: { id: 'rev_1' } }, url: 'http://review/review/rev_1' };
    },
  } as any;
  const config = {
    embedded: false,
    uiBase: '/code-review',
    daemonUrl: 'http://daemon',
    token: 't'.repeat(32),
    worker: false,
    repoHint: '/repo',
    reviewerBackend: 'worker' as const,
    pollMs: 1,
    deliveryPollMs: 1,
    heartbeatMs: 1,
    requestTimeoutMs: 1000,
    reviewerTimeoutMs: 600_000,
  };
  createReviewTools(ctx, { ...config, ...overrides } as any, api);
  return { definitions, calls };
}

describe('review tools', () => {
  it('creates a review for the current session and returns stable JSON', async () => {
    const { definitions, calls } = setup();
    const start = definitions.find((definition) => definition.name === 'review_start');
    expect(start).toBeDefined();
    const value = await start!.execute(
      {},
      { agent: { id: 'a', session: { id: 's1' } }, signal: new AbortController().signal },
    );
    expect(value).toMatchObject({ ok: true, reviewId: 'rev_1', status: 'open' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/reviews' });
    expect((calls[0]!.body as any).initiator).toEqual({
      harness: 'dsh',
      sessionId: 's1',
      cwd: '/repo',
    });
    const rendered = start!.output.render({}, value) as Array<{ text: string }>;
    expect(JSON.parse(rendered[0]!.text)).toEqual(value);
  });

  it('returns the DSH-hosted SPA path in embedded mode instead of the loopback daemon URL', async () => {
    const { definitions } = setup({ embedded: true, uiBase: '/code-review' });
    const start = definitions.find((definition) => definition.name === 'review_start');
    const value = await start!.execute(
      {},
      { agent: { id: 'a', session: { id: 's1' } }, signal: new AbortController().signal },
    );
    expect(value).toMatchObject({
      ok: true,
      reviewId: 'rev_1',
      url: '/code-review/review/rev_1',
    });
  });

  it('returns typed errors instead of throwing', async () => {
    const { definitions } = setup();
    const status = definitions.find((definition) => definition.name === 'review_status');
    const value = await status!.execute({}, { signal: new AbortController().signal });
    expect(value).toMatchObject({ ok: false, error: { code: 'validation' } });
  });
});
