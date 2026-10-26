/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo } from '../../core/test/helpers/repo.js';
import { startDaemon } from '../../server/src/daemon/server.js';
import type { ReviewDaemon } from '../../server/src/daemon/types.js';
import { ReviewApi } from '../src/api.js';
import { createReviewTools } from '../src/tools.js';
import { runDeliveryLoop } from '../src/delivery.js';

const TOKEN = 'test-token-0123456789abcdef0123456789';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .reverse()
      .map((fn) => fn()),
  );
});

async function fixture(): Promise<{
  daemon: ReviewDaemon;
  url: string;
  repo: Awaited<ReturnType<typeof makeRepo>>;
}> {
  const storeDir = await mkdtemp(join(tmpdir(), 'cr-dsh-store-'));
  const repo = await makeRepo();
  await repo.write('src/a.ts', 'one\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo\n');
  await repo.commit('feature');
  const daemon = await startDaemon({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token: TOKEN,
    longPollMs: 120,
    heartbeatMs: 50,
    jobLeaseMs: 200,
    rateLimit: { mutations: 100, reads: 1000, windowMs: 60_000 },
  });
  cleanups.push(async () => {
    await daemon.close();
    await rm(storeDir, { recursive: true, force: true });
    await repo.cleanup();
  });
  return { daemon, url: daemon.url, repo };
}

function config(daemonUrl: string) {
  return {
    daemonUrl,
    token: TOKEN,
    worker: false,
    reviewerBackend: 'none' as const,
    pollMs: 5,
    deliveryPollMs: 5,
    heartbeatMs: 1000,
    requestTimeoutMs: 10_000,
    reviewerTimeoutMs: 600_000,
  };
}

describe('DSH bundle against a real review daemon', () => {
  it('starts a review with an initiator and delivers feedback to that session', async () => {
    const { url, repo } = await fixture();
    const definitions: Array<any> = [];
    const ctx: any = {
      tools: {
        register: (definition: unknown) => {
          definitions.push(definition);
          return () => undefined;
        },
      },
    };
    const api = new ReviewApi(config(url));
    createReviewTools(ctx, config(url), api);
    const start = definitions.find((definition) => definition.name === 'review_start');
    const started = await start.execute(
      { repo: repo.root, title: 'Integration review', base: 'main', head: 'feature' },
      {
        agent: { id: 'agent_1', session: { id: 'session_1' } },
        signal: new AbortController().signal,
      },
    );
    expect(started).toMatchObject({ ok: true, reviewId: expect.stringMatching(/^rev_/) });
    const reviewId = started.reviewId as string;

    const view = await api.get<any>(`/api/reviews/${reviewId}`);
    expect(view.review.initiator).toMatchObject({
      harness: 'dsh',
      sessionId: 'session_1',
      cwd: repo.root,
    });

    const submitted = await api.post<any>(`/api/reviews/${reviewId}/submit`, {
      verdict: 'request-changes',
      summary: 'Fix the delivery path',
    });
    expect(submitted.submission.feedback.deliveryKey).toContain(reviewId);

    const pending = await api.get<any>('/api/deliveries/pending?harness=dsh');
    expect(pending.deliveries).toHaveLength(1);
    expect(pending.deliveries[0].initiator.sessionId).toBe('session_1');

    const controller = new AbortController();
    const prompts: any[] = [];
    const wrapped = {
      get: api.get.bind(api),
      post: async (path: string, body: unknown, signal?: AbortSignal) => {
        const result = await api.post(path, body, signal);
        if (path.endsWith('/ack')) controller.abort();
        return result;
      },
    };
    await runDeliveryLoop(
      {
        config: config(url),
        api: wrapped as any,
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
    expect(prompts[0]).toMatchObject({ sessionId: 'session_1', mode: 'queue' });
    expect(prompts[0].content[0].text).toContain('Fix the delivery path');
    expect((await api.get<any>('/api/deliveries/pending?harness=dsh')).deliveries).toHaveLength(0);
  }, 30_000);
});
