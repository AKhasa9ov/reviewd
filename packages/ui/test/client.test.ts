// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../src/api/client.js';

function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function clientWith(fetchImpl: typeof fetch, onUnauthorized?: (path: string) => void): ApiClient {
  return new ApiClient({
    fetchImpl,
    onUnauthorized,
    getCurrentPath: () => '/review/rev_1?round=2',
  });
}

describe('ApiClient', () => {
  it('lists reviews with status, paging and credentials', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ items: [{ id: 'rev_1' }], total: 1, limit: 20, offset: 40 }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    const page = await client.listReviews({ status: 'open', limit: 20, offset: 40 });
    expect(page.items[0]?.id).toBe('rev_1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reviews?status=open&limit=20&offset=40');
    expect(init.credentials).toBe('same-origin');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).accept).toBe('application/json');
  });

  it('encodes ids and sends JSON bodies for mutations', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ comment: { id: 'c1' } }, 201));
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    await client.addComment('rev/1', {
      body: 'Please explain',
      path: 'src/a.ts',
      side: 'new',
      lineStart: 42,
      lineEnd: 44,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reviews/rev%2F1/comments');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toMatchObject({
      body: 'Please explain',
      path: 'src/a.ts',
      lineStart: 42,
      lineEnd: 44,
    });
  });

  it('calls the review and comment CRUD endpoints', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await client.updateReview('rev/1', {
      title: 'Corrected',
      scope: { kind: 'range', baseRef: 'main', headRef: 'next' },
    });
    await client.deleteReview('rev/1', 'duplicate');
    await client.editComment('rev/1', 'cmt/1', 'Corrected body');
    await client.deleteComment('rev/1', 'cmt/1');

    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => [init.method, url])).toEqual([
      ['PATCH', '/api/reviews/rev%2F1'],
      ['DELETE', '/api/reviews/rev%2F1'],
      ['PATCH', '/api/reviews/rev%2F1/comments/cmt%2F1'],
      ['DELETE', '/api/reviews/rev%2F1/comments/cmt%2F1'],
    ]);
    expect(JSON.parse(String(calls[0]?.[1].body))).toMatchObject({
      title: 'Corrected',
      scope: { kind: 'range', baseRef: 'main', headRef: 'next' },
    });
    expect(JSON.parse(String(calls[1]?.[1].body))).toEqual({ reason: 'duplicate' });
    expect(JSON.parse(String(calls[2]?.[1].body))).toEqual({ body: 'Corrected body' });
  });

  it('calls onUnauthorized with the current deep link and throws a typed error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'unauthorized' } }, 401));
    const onUnauthorized = vi.fn();
    const client = clientWith(fetchImpl as unknown as typeof fetch, onUnauthorized);
    await expect(client.getReview('rev_1')).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledWith('/review/rev_1?round=2');
  });

  it('does not redirect from the auth page', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'unauthorized' } }, 401));
    const onUnauthorized = vi.fn();
    const client = new ApiClient({
      fetchImpl,
      onUnauthorized,
      getCurrentPath: () => '/auth?next=/review/rev_1',
    });
    await expect(client.listReviews()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('retries the reviewer in the current round', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ review: { id: 'rev_1' } }));
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    const view = await client.retryAgent('rev/1');

    expect(view).toMatchObject({ review: { id: 'rev_1' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reviews/rev%2F1/agent/retry');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('parses the error envelope and request id', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: 'conflict', message: 'agent busy', details: { round: 2 } } },
        409,
        { 'x-request-id': 'req_123' },
      ),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    await expect(client.refresh('rev_1')).rejects.toMatchObject({
      code: 'conflict',
      status: 409,
      message: 'agent busy',
      details: { round: 2 },
      requestId: 'req_123',
    });
  });

  it('turns invalid JSON and network failures into typed errors', async () => {
    const invalid = clientWith(
      vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
    );
    await expect(invalid.health()).rejects.toMatchObject({ code: 'invalid-response' });

    const offline = clientWith(
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    );
    await expect(offline.health()).rejects.toMatchObject({ code: 'network' });
  });

  it('propagates abort signals', async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    const controller = new AbortController();
    const promise = client.events('rev_1', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('lists directories, omitting an empty path and forwarding the abort signal', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        path: '/srv',
        parent: '/',
        breadcrumbs: [
          { name: '/', path: '/' },
          { name: 'srv', path: '/srv' },
        ],
        entries: [{ name: 'repo', path: '/srv/repo', isGit: true }],
        truncated: false,
      }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    const listing = await client.listDirectories();
    expect(listing.entries[0]?.isGit).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/fs/dirs');
    expect(init.method).toBe('GET');
    expect(init.signal).toBeUndefined();

    const controller = new AbortController();
    await client.listDirectories('/srv/repo', controller.signal);
    const [nextUrl, nextInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(nextUrl).toBe('/api/fs/dirs?path=%2Fsrv%2Frepo');
    expect(nextInit.signal).toBe(controller.signal);
  });

  it('loads one omitted file diff lazily', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ file: { path: 'src/a b.ts', hunks: [] }, round: 2, path: 'src/a b.ts' }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    const result = await client.getFileDiff('rev/1', 2, 'src/a b.ts');
    expect(result.file.path).toBe('src/a b.ts');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reviews/rev%2F1/snapshot/2/diff?path=src%2Fa+b.ts');
    expect(init.method).toBe('GET');
  });

  it('posts finding decisions with an optional note', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ decision: { findingId: 'f1', state: 'accepted' } }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    await client.decideFinding('rev/1', 'f 1', { state: 'accepted', note: 'Fix this' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reviews/rev%2F1/findings/f%201/decision');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ state: 'accepted', note: 'Fix this' });
  });

  it('supports auth, health, snapshot and events shapes', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      if (value === '/api/auth') return jsonResponse({ ok: true });
      if (value === '/api/health') return jsonResponse({ status: 'ok', store: {}, git: {} });
      if (value.startsWith('/api/reviews/rev_1/snapshot')) {
        return jsonResponse({ round: 2, snapshot: { files: [] } });
      }
      return jsonResponse({ events: [{ seq: 3 }], latestSeq: 3 });
    });
    const client = clientWith(fetchImpl as unknown as typeof fetch);
    await expect(client.authenticate('token')).resolves.toBeUndefined();
    await expect(client.health()).resolves.toMatchObject({ status: 'ok' });
    await expect(client.getSnapshot('rev_1', 2, 'src/a.ts')).resolves.toMatchObject({
      round: 2,
    });
    await expect(client.events('rev_1', { after: 2 })).resolves.toMatchObject({ latestSeq: 3 });
    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(urls).toContain('/api/reviews/rev_1/snapshot?round=2&file=src%2Fa.ts');
    expect(urls).toContain('/api/reviews/rev_1/events?wait=25&after=2');
  });
});
