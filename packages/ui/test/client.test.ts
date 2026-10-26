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
