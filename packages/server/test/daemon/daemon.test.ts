/* eslint-disable @typescript-eslint/no-explicit-any */
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from '../../src/daemon/server.js';
import type { DaemonDeps, ReviewDaemon } from '../../src/daemon/types.js';
import type { ReviewService } from '@dsh-code-review/core';
import { makeRepo } from '../../../core/test/helpers/repo.js';

const TOKEN = 'test-token-0123456789abcdef0123456789';
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

interface Running {
  daemon: ReviewDaemon;
  daemonUrl: string;
  token: string;
  storeDir: string;
}

async function running(
  overrides: Partial<Parameters<typeof startDaemon>[0]> = {},
  deps: DaemonDeps = {},
): Promise<Running> {
  const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-store-'));
  const daemon = await startDaemon(
    {
      host: '127.0.0.1',
      port: 0,
      storeDir,
      token: TOKEN,
      longPollMs: 120,
      heartbeatMs: 50,
      jobLeaseMs: 200,
      rateLimit: { mutations: 100, reads: 1000, windowMs: 60_000 },
      ...overrides,
    },
    deps,
  );
  cleanups.push(async () => {
    await daemon.close();
    await rm(storeDir, { recursive: true, force: true });
  });
  return { daemon, daemonUrl: daemon.url, token: TOKEN, storeDir };
}

async function repo(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const value = await makeRepo();
  cleanups.push(value.cleanup);
  await value.write('src/a.ts', 'one\n');
  await value.commit('base');
  await value.git('checkout', '-b', 'feature');
  await value.write('src/a.ts', 'one\ntwo\n');
  await value.commit('feature');
  return value;
}

function headers(token = TOKEN, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra };
}

async function read(response: Response): Promise<any> {
  return (await response.json()) as any;
}

async function startWithStore(storeDir: string): Promise<Running> {
  const daemon = await startDaemon({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token: TOKEN,
    longPollMs: 50,
    heartbeatMs: 50,
    jobLeaseMs: 200,
    rateLimit: { mutations: 100, reads: 1000, windowMs: 60_000 },
  });
  cleanups.push(async () => {
    await daemon.close();
  });
  return { daemon, daemonUrl: daemon.url, token: TOKEN, storeDir };
}

async function sseText(response: Response, tokens: string[]): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('missing SSE body');
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (tokens.some((token) => !text.includes(token))) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

async function createReview(
  base: string,
  reviewer: Record<string, unknown> = { backend: 'worker' },
  repoRoot?: string,
  initiator?: Record<string, unknown>,
) {
  const response = await fetch(`${base}/api/reviews`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repoRoot,
      title: 'Demo review',
      scope: { kind: 'range', baseRef: 'main', headRef: 'HEAD' },
      reviewer,
      ...(initiator === undefined ? {} : { initiator }),
    }),
  });
  return { response, body: await read(response) };
}

describe('review daemon auth and transport', () => {
  it('refuses to start without a 32-byte token', async () => {
    await expect(
      startDaemon({ host: '127.0.0.1', port: 0, storeDir: '/tmp/unused', token: 'short' }),
    ).rejects.toThrow(/32 bytes/);
  });

  it('keeps health and version unauthenticated and returns a JSON error envelope', async () => {
    const { daemonUrl } = await running();
    const health = await fetch(`${daemonUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(await read(health)).toMatchObject({ status: 'ok' });
    const version = await fetch(`${daemonUrl}/api/version`);
    expect(version.status).toBe(200);
    const unknown = await fetch(`${daemonUrl}/api/nope`, { headers: headers() });
    expect(unknown.status).toBe(404);
    expect(await read(unknown)).toMatchObject({ error: { code: 'not-found' } });
    const unauthorized = await fetch(`${daemonUrl}/api/reviews`);
    expect(unauthorized.status).toBe(401);
    expect(await read(unauthorized)).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('reports an unwritable store as unhealthy', async () => {
    const { daemonUrl, storeDir } = await running();
    await chmod(storeDir, 0o500);
    try {
      const health = await fetch(`${daemonUrl}/api/health`);
      expect(health.status).toBe(503);
      expect(await read(health)).toMatchObject({
        status: 'degraded',
        store: { writable: false },
      });
    } finally {
      await chmod(storeDir, 0o700);
    }
  });

  it('reports missing git as unhealthy', async () => {
    const { daemonUrl } = await running();
    const previous = process.env.PATH;
    process.env.PATH = '/definitely-missing-git-directory';
    try {
      const health = await fetch(`${daemonUrl}/api/health`);
      expect(health.status).toBe(503);
      expect(await read(health)).toMatchObject({
        status: 'degraded',
        store: { writable: true },
        git: { ok: false },
      });
    } finally {
      if (previous === undefined) delete process.env.PATH;
      else process.env.PATH = previous;
    }
  });

  it('accepts bearer auth, exchanges the token for a cookie and clears it on logout', async () => {
    const { daemonUrl } = await running();
    const auth = await fetch(`${daemonUrl}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
    });
    expect(auth.status).toBe(200);
    const cookie = auth.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('cr_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');

    const cookieOnly = cookie.split(';')[0] ?? '';
    const list = await fetch(`${daemonUrl}/api/reviews`, { headers: { cookie: cookieOnly } });
    expect(list.status).toBe(200);
    const badBearer = await fetch(`${daemonUrl}/api/reviews`, {
      headers: { authorization: `Bearer ${'x'.repeat(32)}` },
    });
    expect(badBearer.status).toBe(401);

    const logout = await fetch(`${daemonUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: cookieOnly },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects cross-origin mutations and returns 429 with Retry-After', async () => {
    const { daemonUrl } = await running({
      rateLimit: { mutations: 2, reads: 100, windowMs: 60_000 },
    });
    const cross = await fetch(`${daemonUrl}/api/reviews`, {
      method: 'POST',
      headers: headers(TOKEN, { origin: 'https://evil.example' }),
      body: '{}',
    });
    expect(cross.status).toBe(403);

    const results: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${daemonUrl}/api/reviews`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      });
      results.push(response.status);
    }
    expect(results[0]).toBe(400);
    expect(results[2]).toBe(429);
    const limited = await fetch(`${daemonUrl}/api/reviews`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('review routes and events', () => {
  it('creates, lists, comments, submits and closes a review', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'none' }, checkout.root);
    expect(created.response.status).toBe(201);
    const reviewId = created.body.review.review.id as string;
    expect(reviewId).toMatch(/^rev_/);

    const list = await fetch(`${daemonUrl}/api/reviews`, { headers: headers() });
    expect(list.status).toBe(200);
    expect((await read(list)).total).toBe(1);

    const comment = await fetch(`${daemonUrl}/api/reviews/${reviewId}/comments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ path: 'src/a.ts', lineStart: 2, body: 'Please explain' }),
    });
    expect(comment.status).toBe(201);
    const commentBody = await read(comment);
    const commentId = commentBody.comment.id as string;
    expect(commentBody.comment.body).toBe('Please explain');

    const reply = await fetch(
      `${daemonUrl}/api/reviews/${reviewId}/comments/${commentId}/replies`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ body: 'Because' }),
      },
    );
    expect(reply.status).toBe(201);

    const submit = await fetch(`${daemonUrl}/api/reviews/${reviewId}/submit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ verdict: 'request-changes', summary: 'Fix it' }),
    });
    expect(submit.status).toBe(200);
    const submitted = await read(submit);
    expect(submitted.submission.feedback.deliveryKey).toBe(
      `${reviewId}:1:${submitted.submission.deliveryKey.split(':')[2]}`,
    );

    const feedback = await fetch(`${daemonUrl}/api/reviews/${reviewId}/feedback`, {
      headers: headers(),
    });
    expect(feedback.status).toBe(200);
    expect((await read(feedback)).feedback.markdown).toContain('Please explain');

    const close = await fetch(`${daemonUrl}/api/reviews/${reviewId}/close`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ verdict: 'approved' }),
    });
    expect(close.status).toBe(200);
    expect((await read(close)).review.status).toBe('closed');
  });

  it('returns events immediately and long-polls without hanging', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'none' }, checkout.root);
    const reviewId = created.body.review.review.id as string;
    const events = await fetch(`${daemonUrl}/api/reviews/${reviewId}/events?after=0&wait=0`, {
      headers: headers(),
    });
    expect(events.status).toBe(200);
    const body = await read(events);
    expect(body.events.some((event: { type: string }) => event.type === 'review/created')).toBe(
      true,
    );
    const empty = await fetch(`${daemonUrl}/api/reviews/${reviewId}/events?after=999&wait=1`, {
      headers: headers(),
    });
    expect(empty.status).toBe(200);
    expect((await read(empty)).events).toEqual([]);
  });

  it('streams review events over SSE', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'none' }, checkout.root);
    const reviewId = created.body.review.review.id as string;
    const controller = new AbortController();
    const response = await fetch(`${daemonUrl}/api/reviews/${reviewId}/events`, {
      headers: headers(TOKEN, { accept: 'text/event-stream' }),
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    const text = new TextDecoder().decode(first.value);
    expect(text).toContain(': connected');
    controller.abort();
  });
});

describe('jobs, workers and deliveries', () => {
  it('tells a worker with a forgotten id to register again', async () => {
    const { daemonUrl } = await running();
    const response = await fetch(`${daemonUrl}/api/jobs/next?workerId=wkr_gone&wait=0`, {
      headers: headers(),
    });
    expect(response.status).toBe(401);
    expect((await read(response)).error.code).toBe('unauthorized');
  });

  it('leases a job once, accepts idempotent reports and queues a delivery', async () => {
    const { daemonUrl } = await running({ longPollMs: 50 });
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'worker' }, checkout.root, {
      harness: 'dsh',
      sessionId: 'session-42',
      cwd: checkout.root,
    });
    const reviewId = created.body.review.review.id as string;

    const registered = await fetch(`${daemonUrl}/api/workers/register`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: 'worker-1', harness: 'cli' }),
    });
    expect(registered.status).toBe(201);
    const worker = await read(registered);

    const first = await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=2`, {
      headers: headers(),
    });
    expect(first.status).toBe(200);
    const lease = await read(first);
    expect(lease.job.reviewId).toBe(reviewId);
    expect(lease.job.attempt).toBe(1);
    expect(lease.bundle.prompt).toContain('Demo review');

    const second = await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=0`, {
      headers: headers(),
    });
    expect(second.status).toBe(204);

    const report = {
      schemaVersion: 1,
      summary: 'ok',
      riskLevel: 'low',
      findings: [],
      questions: [],
      tests: { ran: false, commands: [] },
      verification: [],
    };
    const post = await fetch(`${daemonUrl}/api/jobs/${lease.job.id}/report`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ attemptId: lease.job.attemptId, report }),
    });
    expect(post.status).toBe(200);
    const duplicate = await fetch(`${daemonUrl}/api/jobs/${lease.job.id}/report`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ attemptId: lease.job.attemptId, report }),
    });
    expect(duplicate.status).toBe(200);
    expect((await read(duplicate)).duplicate).toBe(true);

    const submit = await fetch(`${daemonUrl}/api/reviews/${reviewId}/submit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ verdict: 'request-changes', harness: 'dsh' }),
    });
    expect(submit.status).toBe(200);
    const pending = await fetch(`${daemonUrl}/api/deliveries/pending?harness=dsh`, {
      headers: headers(),
    });
    expect(pending.status).toBe(200);
    const pendingBody = await read(pending);
    expect(pendingBody.deliveries).toHaveLength(1);
    expect(pendingBody.deliveries[0].initiator).toMatchObject({
      harness: 'dsh',
      sessionId: 'session-42',
    });
    const deliveryId = pendingBody.deliveries[0].id as string;
    const ack = await fetch(`${daemonUrl}/api/deliveries/${deliveryId}/ack`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ by: 'dsh' }),
    });
    expect(ack.status).toBe(200);
    expect((await read(ack)).status).toBe('acked');
  });
});

describe('delivery persistence', () => {
  it('keeps pending deliveries and acknowledgements across a daemon restart', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-store-'));
    cleanups.push(async () => {
      await rm(storeDir, { recursive: true, force: true });
    });
    const start = async (): Promise<Running> => {
      const daemon = await startDaemon({
        host: '127.0.0.1',
        port: 0,
        storeDir,
        token: TOKEN,
        longPollMs: 50,
        heartbeatMs: 50,
        jobLeaseMs: 200,
        rateLimit: { mutations: 100, reads: 1000, windowMs: 60_000 },
      });
      cleanups.push(async () => {
        await daemon.close();
      });
      return { daemon, daemonUrl: daemon.url, token: TOKEN, storeDir };
    };

    const checkout = await repo();
    const first = await start();
    const created = await createReview(first.daemonUrl, { backend: 'none' }, checkout.root, {
      harness: 'dsh',
      sessionId: 'session-persist',
    });
    const reviewId = created.body.review.review.id as string;
    const submit = await fetch(`${first.daemonUrl}/api/reviews/${reviewId}/submit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ verdict: 'comment', harness: 'dsh' }),
    });
    expect(submit.status).toBe(200);
    const before = await read(
      await fetch(`${first.daemonUrl}/api/deliveries/pending?harness=dsh`, {
        headers: headers(),
      }),
    );
    expect(before.deliveries).toHaveLength(1);
    const deliveryId = before.deliveries[0].id as string;
    await first.daemon.close();

    const second = await start();
    const restored = await read(
      await fetch(`${second.daemonUrl}/api/deliveries/pending?harness=dsh`, {
        headers: headers(),
      }),
    );
    expect(restored.deliveries.map((item: { id: string }) => item.id)).toEqual([deliveryId]);
    const ack = await fetch(`${second.daemonUrl}/api/deliveries/${deliveryId}/ack`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ by: 'dsh' }),
    });
    expect(ack.status).toBe(200);
    expect((await read(ack)).status).toBe('acked');
    await second.daemon.close();

    const third = await start();
    const after = await read(
      await fetch(`${third.daemonUrl}/api/deliveries/pending?harness=dsh`, {
        headers: headers(),
      }),
    );
    expect(after.deliveries).toEqual([]);
    const reack = await fetch(`${third.daemonUrl}/api/deliveries/${deliveryId}/ack`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ by: 'dsh' }),
    });
    expect(reack.status).toBe(200);
    expect((await read(reack)).status).toBe('acked');
    await third.daemon.close();
  });
});

describe('sse replay', () => {
  it('replays stored review events after a daemon restart', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-store-'));
    cleanups.push(async () => {
      await rm(storeDir, { recursive: true, force: true });
    });
    const checkout = await repo();
    const first = await startWithStore(storeDir);
    const created = await createReview(first.daemonUrl, { backend: 'none' }, checkout.root);
    const reviewId = created.body.review.review.id as string;
    const comment = await fetch(`${first.daemonUrl}/api/reviews/${reviewId}/comments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        body: 'historical note',
        path: 'src/a.ts',
        side: 'new',
        lineStart: 2,
      }),
    });
    expect(comment.status).toBe(201);
    await first.daemon.close();

    const second = await startWithStore(storeDir);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${second.daemonUrl}/api/reviews/${reviewId}/events`, {
        headers: headers(TOKEN, { accept: 'text/event-stream' }),
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      const text = await sseText(response, [
        'event: review/created',
        'event: comment/added',
        'historical note',
      ]);
      expect(text).toContain('event: review/created');
      expect(text).toContain('event: comment/added');
      expect(text).toContain('historical note');
    } finally {
      clearTimeout(timer);
      controller.abort();
      await second.daemon.close();
    }
  });

  it('replays every review on the global stream with a daemon-wide cursor', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'reviewd-store-'));
    cleanups.push(async () => {
      await rm(storeDir, { recursive: true, force: true });
    });
    const checkout = await repo();
    const first = await startWithStore(storeDir);
    const firstReview = await createReview(first.daemonUrl, { backend: 'none' }, checkout.root);
    const firstId = firstReview.body.review.review.id as string;
    const secondReview = await createReview(first.daemonUrl, { backend: 'none' }, checkout.root);
    const secondId = secondReview.body.review.review.id as string;
    const comment = await fetch(`${first.daemonUrl}/api/reviews/${firstId}/comments`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        body: 'global cursor note',
        path: 'src/a.ts',
        side: 'new',
        lineStart: 2,
      }),
    });
    expect(comment.status).toBe(201);
    await first.daemon.close();

    const second = await startWithStore(storeDir);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${second.daemonUrl}/api/events`, {
        headers: headers(TOKEN, { accept: 'text/event-stream' }),
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      const text = await sseText(response, [firstId, secondId, 'global cursor note']);
      const ids = [...text.matchAll(/^id: (\S+)$/gm)].map((match) => match[1] as string);
      expect(ids.length).toBeGreaterThanOrEqual(3);
      const suffixes = ids.map((id) => Number(id.split(':').at(-1)));
      expect(new Set(suffixes).size).toBe(suffixes.length);
      const firstCursor = suffixes[0] as number;

      const resumed = await read(
        await fetch(`${second.daemonUrl}/api/events?after=${firstCursor}&wait=0`, {
          headers: headers(),
        }),
      );
      expect(resumed.events.length).toBe(ids.length - 1);
      expect(resumed.events.every((item: { seq: number }) => item.seq > firstCursor)).toBe(true);
    } finally {
      clearTimeout(timer);
      controller.abort();
      await second.daemon.close();
    }
  });
});

describe('daemon limits, leases and gc', () => {
  it('requeues an expired lease once and then fails the job', async () => {
    const { daemonUrl } = await running({ jobLeaseMs: 60, jobMaxAttempts: 2 });
    const checkout = await repo();
    await createReview(daemonUrl, { backend: 'worker' }, checkout.root);
    const registered = await fetch(`${daemonUrl}/api/workers/register`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: 'expiry-worker' }),
    });
    const worker = await read(registered);
    const first = await read(
      await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=2`, {
        headers: headers(),
      }),
    );
    expect(first.job.attempt).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const second = await read(
      await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=2`, {
        headers: headers(),
      }),
    );
    expect(second.job.attempt).toBe(2);
    expect(second.job.attemptId).not.toBe(first.job.attemptId);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const none = await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=0`, {
      headers: headers(),
    });
    expect(none.status).toBe(204);
  });

  it('cancels a review job', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'worker' }, checkout.root);
    const reviewId = created.body.review.review.id;
    const registered = await read(
      await fetch(`${daemonUrl}/api/workers/register`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: 'cancel-worker' }),
      }),
    );
    const lease = await read(
      await fetch(`${daemonUrl}/api/jobs/next?workerId=${registered.id}&wait=2`, {
        headers: headers(),
      }),
    );
    expect(lease.job.reviewId).toBe(reviewId);
    const cancel = await fetch(`${daemonUrl}/api/reviews/${reviewId}/agent/cancel`, {
      method: 'POST',
      headers: headers(),
      body: '{}',
    });
    expect(cancel.status).toBe(200);
    const none = await fetch(`${daemonUrl}/api/jobs/next?workerId=${registered.id}&wait=0`, {
      headers: headers(),
    });
    expect(none.status).toBe(204);
  });

  it('drops invalid incremental findings and reports how many were rejected', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    await createReview(daemonUrl, { backend: 'worker' }, checkout.root);
    const registered = await read(
      await fetch(`${daemonUrl}/api/workers/register`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: 'findings-worker' }),
      }),
    );
    const lease = await read(
      await fetch(`${daemonUrl}/api/jobs/next?workerId=${registered.id}&wait=2`, {
        headers: headers(),
      }),
    );
    const valid = {
      id: 'f-valid',
      severity: 'major',
      category: 'correctness',
      confidence: 'high',
      kind: 'issue',
      file: 'src/a.ts',
      lineStart: 2,
      lineEnd: 2,
      title: 'second line',
      rationale: 'the line is new',
      evidence: '+two',
    };
    const response = await fetch(`${daemonUrl}/api/jobs/${lease.job.id as string}/findings`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        attemptId: lease.job.attemptId,
        findings: [valid, { ...valid, id: 'f-bad', severity: 'nope' }, { id: 'f-empty' }],
      }),
    });
    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({ accepted: 1, rejected: 2 });
    const events = await read(
      await fetch(`${daemonUrl}/api/events?after=0&wait=0`, { headers: headers() }),
    );
    const findingEvents = events.events.filter(
      (entry: { event: { type: string } }) => entry.event.type === 'agent/finding',
    );
    expect(findingEvents).toHaveLength(1);
    expect(findingEvents[0].event.data.finding.id).toBe('f-valid');
  });

  it('rejects oversized bodies', async () => {
    const { daemonUrl } = await running({ maxBodyBytes: 32 });
    const response = await fetch(`${daemonUrl}/api/reviews`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title: 'x'.repeat(100) }),
    });
    expect(response.status).toBe(400);
    expect((await read(response)).error.code).toBe('validation');
  });

  it('removes closed reviews older than zero days', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'none' }, checkout.root);
    const reviewId = created.body.review.review.id;
    await fetch(`${daemonUrl}/api/reviews/${reviewId}/submit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ verdict: 'approve' }),
    });
    const gc = await fetch(`${daemonUrl}/api/gc`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ olderThanDays: 0 }),
    });
    expect(gc.status).toBe(200);
    expect((await read(gc)).removedReviews).toContain(reviewId);
    const gone = await fetch(`${daemonUrl}/api/reviews/${reviewId}`, { headers: headers() });
    expect(gone.status).toBe(404);
  });
});

describe('review snapshot, comment state and refresh', () => {
  it('serves snapshots, suggestion actions, fix claims and a refreshed round', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'none' }, checkout.root);
    const reviewId = created.body.review.review.id;

    const snapshot = await fetch(`${daemonUrl}/api/reviews/${reviewId}/snapshot?round=1`, {
      headers: headers(),
    });
    expect(snapshot.status).toBe(200);
    const snapshotBody = await read(snapshot);
    expect(snapshotBody.round).toBe(1);
    expect(snapshotBody.snapshot.files[0].path).toBe('src/a.ts');

    const comment = await read(
      await fetch(`${daemonUrl}/api/reviews/${reviewId}/comments`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          path: 'src/a.ts',
          lineStart: 2,
          body: 'rename',
          suggestion: { original: 'two', replacement: 'TWO' },
        }),
      }),
    );
    const commentId = comment.comment.id;

    const accepted = await fetch(
      `${daemonUrl}/api/reviews/${reviewId}/comments/${commentId}/suggestion`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: 'accept' }),
      },
    );
    expect(accepted.status).toBe(200);
    expect((await read(accepted)).comment.suggestionState).toBe('accepted');

    const applied = await fetch(
      `${daemonUrl}/api/reviews/${reviewId}/comments/${commentId}/suggestion`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: 'apply' }),
      },
    );
    expect(applied.status).toBe(200);
    expect((await read(applied)).comment.suggestionState).toBe('applied');

    const resolved = await fetch(`${daemonUrl}/api/reviews/${reviewId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ state: 'resolved' }),
    });
    expect(resolved.status).toBe(200);
    expect((await read(resolved)).comment.state).toBe('resolved');

    const fix = await fetch(`${daemonUrl}/api/reviews/${reviewId}/fix-status`, {
      method: 'POST',
      headers: headers(TOKEN, { 'idempotency-key': 'fix-1' }),
      body: JSON.stringify({
        items: [{ commentId, status: 'fixed', evidence: 'src/a.ts:2' }],
      }),
    });
    expect(fix.status).toBe(200);
    const duplicateFix = await fetch(`${daemonUrl}/api/reviews/${reviewId}/fix-status`, {
      method: 'POST',
      headers: headers(TOKEN, { 'idempotency-key': 'fix-1' }),
      body: JSON.stringify({
        items: [{ commentId, status: 'fixed', evidence: 'src/a.ts:2' }],
      }),
    });
    expect(duplicateFix.status).toBe(200);
    const afterFix = await read(
      await fetch(`${daemonUrl}/api/reviews/${reviewId}`, { headers: headers() }),
    );
    expect(afterFix.review.fixClaims).toHaveLength(1);

    await checkout.write('src/a.ts', 'one\nTWO\nthree\n');
    await checkout.commit('apply review');
    const refresh = await fetch(`${daemonUrl}/api/reviews/${reviewId}/refresh`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    expect(refresh.status).toBe(200);
    const refreshed = await read(refresh);
    expect(refreshed.review.rounds).toHaveLength(2);
    expect(refreshed.review.comments[0].outcomes.at(-1).status).toBe('applied');

    const branches = await fetch(
      `${daemonUrl}/api/repos/branches?path=${encodeURIComponent(checkout.root)}`,
      { headers: headers() },
    );
    expect(branches.status).toBe(200);
    expect((await read(branches)).branches).toContain('feature');
  });
});

describe('selected commit reviews', () => {
  it('creates a commit-set review with the oldest parent as its base', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const first = await checkout.git('rev-parse', 'HEAD');
    const firstParent = await checkout.git('rev-parse', `${first}^`);
    await checkout.write('src/a.ts', 'one\ntwo\nthree\n');
    const second = await checkout.commit('follow-up');

    const created = await fetch(`${daemonUrl}/api/reviews`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        repoRoot: checkout.root,
        title: 'Selected commits',
        scope: { kind: 'commits', shas: [first, second] },
        reviewer: { backend: 'none' },
      }),
    });
    expect(created.status).toBe(201);
    const body = await read(created);
    const reviewId = body.review.review.id;
    const snapshot = await read(
      await fetch(`${daemonUrl}/api/reviews/${reviewId}/snapshot?round=1`, {
        headers: headers(),
      }),
    );
    expect(snapshot.snapshot.scope).toMatchObject({
      kind: 'commits',
      shas: [first, second],
      baseSha: firstParent,
      headSha: second,
    });
    expect(snapshot.snapshot.files[0].hunks[0].lines.map((line: any) => line.text)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });
});

describe('repository settings', () => {
  it('persists configured repositories and lists merge-request commits oldest first', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    await checkout.write('src/a.ts', 'one\ntwo\nthree\n');
    await checkout.commit('follow-up');

    const empty = await fetch(`${daemonUrl}/api/settings/repositories`, { headers: headers() });
    expect(empty.status).toBe(200);
    expect((await read(empty)).repositories).toEqual([]);

    const saved = await fetch(`${daemonUrl}/api/settings/repositories`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        repositories: [
          {
            name: 'Checkout',
            path: checkout.root,
            defaultTarget: 'main',
          },
        ],
      }),
    });
    expect(saved.status).toBe(200);
    const settings = await read(saved);
    expect(settings.repositories).toHaveLength(1);
    expect(settings.repositories[0]).toMatchObject({
      name: 'Checkout',
      defaultTarget: 'main',
    });

    const persisted = await read(
      await fetch(`${daemonUrl}/api/settings/repositories`, { headers: headers() }),
    );
    expect(persisted.repositories[0].path).toBe(checkout.root);

    const commits = await fetch(
      `${daemonUrl}/api/repos/commits?path=${encodeURIComponent(checkout.root)}&base=main&head=feature`,
      { headers: headers() },
    );
    expect(commits.status).toBe(200);
    const log = await read(commits);
    expect(log.mergeBase).toHaveLength(40);
    expect(log.commits).toHaveLength(2);
    expect(log.commits.map((commit: any) => commit.subject)).toEqual(['feature', 'follow-up']);

    const optionRef = await fetch(
      `${daemonUrl}/api/repos/commits?path=${encodeURIComponent(checkout.root)}&base=${encodeURIComponent('--output=/tmp/code-review-write')}&head=feature`,
      { headers: headers() },
    );
    expect(optionRef.status).toBe(400);

    await fetch(`${daemonUrl}/api/settings/repositories`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ repositories: [{ name: 'Broken', path: '/definitely/missing' }] }),
    }).then(async (response) => expect(response.status).toBe(400));

    await fetch(`${daemonUrl}/api/settings/repositories`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        repositories: [{ name: 'Checkout', path: checkout.root, defaultTarget: 'main' }],
      }),
    });
  });

  it('keeps repository settings across a daemon restart', async () => {
    const first = await running();
    const checkout = await repo();
    await fetch(`${first.daemonUrl}/api/settings/repositories`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ repositories: [{ name: 'Checkout', path: checkout.root }] }),
    });
    await first.daemon.close();
    const restarted = await startWithStore(first.storeDir);
    const settings = await read(
      await fetch(`${restarted.daemonUrl}/api/settings/repositories`, { headers: headers() }),
    );
    expect(settings.repositories.map((item: any) => item.path)).toEqual([checkout.root]);
  });
});

describe('directory browsing', () => {
  async function browseFixture(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'reviewd-browse-'));
    cleanups.push(async () => {
      await rm(root, { recursive: true, force: true });
    });
    await mkdir(join(root, '.hidden'));
    await mkdir(join(root, 'alpha'));
    await mkdir(join(root, 'beta', '.git'), { recursive: true });
    await writeFile(join(root, 'notes.txt'), 'hello\n');
    return root;
  }

  function breadcrumbsFor(root: string): Array<{ name: string; path: string }> {
    const breadcrumbs = [{ name: '/', path: '/' }];
    const segments = root.split('/').filter((segment) => segment !== '');
    for (const [index, segment] of segments.entries()) {
      breadcrumbs.push({
        name: segment,
        path: `/${segments.slice(0, index + 1).join('/')}`,
      });
    }
    return breadcrumbs;
  }

  it('lists sorted directories with git markers, breadcrumbs and parent', async () => {
    const { daemonUrl } = await running();
    const root = await browseFixture();
    const response = await fetch(`${daemonUrl}/api/fs/dirs?path=${encodeURIComponent(root)}`, {
      headers: headers(),
    });
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.path).toBe(root);
    expect(body.parent).toBe(dirname(root));
    expect(body.breadcrumbs).toEqual(breadcrumbsFor(root));
    expect(body.entries).toEqual([
      { name: '.hidden', path: join(root, '.hidden'), isGit: false },
      { name: 'alpha', path: join(root, 'alpha'), isGit: false },
      { name: 'beta', path: join(root, 'beta'), isGit: true },
    ]);
    expect(body.truncated).toBe(false);
  });

  it('rejects a file path with a validation error', async () => {
    const { daemonUrl } = await running();
    const root = await browseFixture();
    const response = await fetch(
      `${daemonUrl}/api/fs/dirs?path=${encodeURIComponent(join(root, 'notes.txt'))}`,
      { headers: headers() },
    );
    expect(response.status).toBe(400);
    expect((await read(response)).error).toMatchObject({ code: 'validation' });
  });

  it('defaults a missing path to the home directory', async () => {
    const { daemonUrl } = await running();
    const response = await fetch(`${daemonUrl}/api/fs/dirs`, { headers: headers() });
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.path.startsWith('/')).toBe(true);
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it('requires authentication', async () => {
    const { daemonUrl } = await running();
    const response = await fetch(`${daemonUrl}/api/fs/dirs`);
    expect(response.status).toBe(401);
    expect((await read(response)).error.code).toBe('unauthorized');
  });
});

describe('delivery failure', () => {
  it('records a failed delivery and removes it from pending', async () => {
    const { daemonUrl } = await running();
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'none' }, checkout.root);
    const reviewId = created.body.review.review.id;
    await fetch(`${daemonUrl}/api/reviews/${reviewId}/submit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ verdict: 'comment', harness: 'other' }),
    });
    const pending = await read(
      await fetch(`${daemonUrl}/api/deliveries/pending?harness=other`, { headers: headers() }),
    );
    const id = pending.deliveries[0].id;
    const failed = await fetch(`${daemonUrl}/api/deliveries/${id}/fail`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ error: 'session gone' }),
    });
    expect(failed.status).toBe(200);
    expect((await read(failed)).status).toBe('failed');
    const after = await read(
      await fetch(`${daemonUrl}/api/deliveries/pending?harness=other`, { headers: headers() }),
    );
    expect(after.deliveries).toEqual([]);
  });
});

describe('worker concurrency', () => {
  it('never leases one job to two concurrent polls', async () => {
    const { daemonUrl } = await running({ jobLeaseMs: 60_000 });
    const checkout = await repo();
    const created = await createReview(daemonUrl, { backend: 'worker' }, checkout.root);
    expect(created.response.status).toBe(201);
    const workers = await Promise.all(
      [1, 2].map(
        async (index) =>
          await read(
            await fetch(`${daemonUrl}/api/workers/register`, {
              method: 'POST',
              headers: headers(),
              body: JSON.stringify({ name: `race-${index}` }),
            }),
          ),
      ),
    );
    const results = await Promise.all(
      workers.map(async (worker) => {
        const response = await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=1`, {
          headers: headers(),
        });
        return {
          status: response.status,
          body: response.status === 200 ? await read(response) : null,
        };
      }),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 204]);
    expect(results.find((result) => result.status === 200)?.body.job.reviewId).toBe(
      created.body.review.review.id,
    );
  });
});

describe('worker heartbeat', () => {
  it('extends the lease so a second poll does not steal the job', async () => {
    const { daemonUrl } = await running({ jobLeaseMs: 200 });
    const checkout = await repo();
    await createReview(daemonUrl, { backend: 'worker' }, checkout.root);
    const worker = await read(
      await fetch(`${daemonUrl}/api/workers/register`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: 'heartbeat-worker' }),
      }),
    );
    const lease = await read(
      await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=2`, {
        headers: headers(),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    const beat = await fetch(`${daemonUrl}/api/workers/${worker.id}/heartbeat`, {
      method: 'POST',
      headers: headers(),
      body: '{}',
    });
    expect(beat.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const second = await fetch(`${daemonUrl}/api/jobs/next?workerId=${worker.id}&wait=0`, {
      headers: headers(),
    });
    expect(second.status).toBe(204);
    const report = await fetch(`${daemonUrl}/api/jobs/${lease.job.id}/report`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        attemptId: lease.job.attemptId,
        report: {
          schemaVersion: 1,
          summary: 'ok',
          riskLevel: 'low',
          findings: [],
          questions: [],
          tests: { ran: false, commands: [] },
          verification: [],
        },
      }),
    });
    expect(report.status).toBe(200);
  });
});

describe('review finding decisions', () => {
  it('routes a decision with an optional note to the service', async () => {
    const calls: unknown[] = [];
    const service = {
      async decideFinding(id: string, findingId: string, input: { state: string; note?: string }) {
        calls.push({ id, findingId, input });
        return {
          decision: {
            findingId,
            round: 1,
            state: input.state,
            ...(input.note === undefined ? {} : { note: input.note }),
            by: { name: 'reviewd', kind: 'human' },
            at: '2026-10-27T12:00:00.000Z',
          },
        };
      },
      async events() {
        return [];
      },
      async list() {
        return { items: [], total: 0, limit: 50, offset: 0 };
      },
    } as unknown as ReviewService;
    const { daemonUrl } = await running({}, { service });

    const response = await fetch(`${daemonUrl}/api/reviews/rev_1/findings/f%201/decision`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ state: 'accepted', note: '  Fix before merge  ' }),
    });

    expect(response.status).toBe(200);
    expect(await read(response)).toMatchObject({
      decision: { findingId: 'f 1', state: 'accepted', note: '  Fix before merge  ' },
    });
    expect(calls).toEqual([
      {
        id: 'rev_1',
        findingId: 'f 1',
        input: { state: 'accepted', note: '  Fix before merge  ' },
      },
    ]);
  });

  it('rejects an unknown decision state before calling the service', async () => {
    let called = false;
    const service = {
      async decideFinding() {
        called = true;
        return {};
      },
      async events() {
        return [];
      },
      async list() {
        return { items: [], total: 0, limit: 50, offset: 0 };
      },
    } as unknown as ReviewService;
    const { daemonUrl } = await running({}, { service });

    const response = await fetch(`${daemonUrl}/api/reviews/rev_1/findings/f1/decision`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ state: 'maybe' }),
    });

    expect(response.status).toBe(400);
    expect((await read(response)).error.code).toBe('validation');
    expect(called).toBe(false);
  });
});
