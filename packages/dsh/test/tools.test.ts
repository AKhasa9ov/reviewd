/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { createReviewTools } from '../src/tools.js';
import type { PluginContext } from '../src/tools.js';

function setup(
  overrides: Record<string, unknown> = {},
  comments: Array<Record<string, any>> = [],
  reviewOverrides: Record<string, any> = {},
) {
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
        review: {
          id: 'rev_1',
          title: 'T',
          status: 'open',
          rounds: [1],
          comments,
          ...reviewOverrides,
        },
        report: null,
      };
    },
    post: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      if (path.endsWith('/resolve')) {
        return { comment: { id: 'cmt_1', state: 'resolved' } };
      }
      return { review: { review: { id: 'rev_1' } }, url: 'http://review/review/rev_1' };
    },
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

  it('exposes an approved close verdict to the fixing agent', async () => {
    const { definitions } = setup({}, [], {
      status: 'closed',
      closeVerdict: 'approved',
      closedAt: '2026-10-28T12:00:00.000Z',
    });
    const status = definitions.find((definition) => definition.name === 'review_status');
    const value = await status!.execute(
      { reviewId: 'rev_1' },
      { signal: new AbortController().signal },
    );
    expect(value).toMatchObject({
      ok: true,
      status: 'closed',
      verdict: 'approve',
      approved: true,
    });
  });

  it('uses the latest approving submission when the review has no close verdict', async () => {
    const { definitions } = setup({}, [], {
      status: 'closed',
      submissions: [{ round: 1, verdict: 'approve', submissionId: 'sub_1' }],
    });
    const status = definitions.find((definition) => definition.name === 'review_status');
    const value = await status!.execute(
      { reviewId: 'rev_1' },
      { signal: new AbortController().signal },
    );
    expect(value).toMatchObject({ ok: true, status: 'closed', verdict: 'approve', approved: true });
  });

  it('prefers an explicit approved close over an earlier submission verdict', async () => {
    const { definitions } = setup({}, [], {
      status: 'closed',
      closeVerdict: 'approved',
      submissions: [{ round: 1, verdict: 'request-changes', submissionId: 'sub_1' }],
    });
    const status = definitions.find((definition) => definition.name === 'review_status');
    const value = await status!.execute(
      { reviewId: 'rev_1' },
      { signal: new AbortController().signal },
    );
    expect(value).toMatchObject({ ok: true, verdict: 'approve', approved: true });
  });

  it('returns typed errors instead of throwing', async () => {
    const { definitions } = setup();
    const status = definitions.find((definition) => definition.name === 'review_status');
    const value = await status!.execute({}, { signal: new AbortController().signal });
    expect(value).toMatchObject({ ok: false, error: { code: 'validation' } });
  });
});

it('lists open comments with the ids a fixer needs', async () => {
  const { definitions } = setup({}, [
    {
      id: 'cmt_1',
      state: 'open',
      author: { name: 'Ada', kind: 'human' },
      body: 'Fix the retry path',
      anchors: [{ path: 'src/a.ts', lineStart: 2, lineEnd: 2 }],
    },
    {
      id: 'cmt_2',
      state: 'resolved',
      author: { name: 'Ada', kind: 'human' },
      body: 'Already done',
      anchors: [{ path: 'src/a.ts', lineStart: 3, lineEnd: 3 }],
    },
    {
      id: 'cmt_3',
      state: 'open',
      deletedAt: '2026-10-26T12:00:00.000Z',
      author: { name: 'Ada', kind: 'human' },
      body: 'Deleted comment',
      anchors: [{ path: 'src/a.ts', lineStart: 4, lineEnd: 4 }],
    },
  ]);
  const list = definitions.find((definition) => definition.name === 'review_comments_list');
  expect(list).toBeDefined();
  const value = await list!.execute(
    { reviewId: 'rev_1' },
    { signal: new AbortController().signal },
  );
  expect(value).toMatchObject({
    ok: true,
    reviewId: 'rev_1',
    total: 1,
    comments: [
      {
        commentId: 'cmt_1',
        state: 'open',
        author: { name: 'Ada', kind: 'human' },
        path: 'src/a.ts',
        lineStart: 2,
        lineEnd: 2,
        body: 'Fix the retry path',
      },
    ],
  });
});

it('resolves one comment through the agent endpoint', async () => {
  const { definitions, calls } = setup();
  const resolve = definitions.find((definition) => definition.name === 'review_resolve_comment');
  expect(resolve).toBeDefined();
  const value = await resolve!.execute(
    { reviewId: 'rev_1', commentId: 'cmt_1' },
    { signal: new AbortController().signal },
  );
  expect(value).toMatchObject({
    ok: true,
    reviewId: 'rev_1',
    commentId: 'cmt_1',
    state: 'resolved',
  });
  expect(calls).toContainEqual({
    method: 'POST',
    path: '/api/reviews/rev_1/comments/cmt_1/resolve',
    body: {},
  });
});
