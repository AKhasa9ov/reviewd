import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createProxyHandler } from '../src/proxy.js';
import { normalizeConfig } from '../src/config.js';

/** Minimal response double for calling a route handler without a socket. */
function createResponse(): { res: ServerResponse; getStatus(): number; body(): string } {
  let status = 0;
  let body = '';
  const res = {
    writeHead: (next: number) => {
      status = next;
      return res;
    },
    end: (chunk?: string | Uint8Array) => {
      if (typeof chunk === 'string') body += chunk;
      else if (chunk !== undefined) body += Buffer.from(chunk).toString();
      return res;
    },
    on: () => res,
    headersSent: false,
    writableEnded: false,
  } as unknown as ServerResponse;
  return { res, getStatus: () => status, body: () => body };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

describe('same-origin proxy', () => {
  it('forwards path, query, body, actor and idempotency key with the bearer token', async () => {
    let seenAuth = '';
    let seenPath = '';
    let seenBody = '';
    let seenActor = '';
    let seenIdempotency = '';
    let seenKind = '';
    const daemon = createServer((req, res) => {
      seenAuth = String(req.headers.authorization);
      seenPath = req.url ?? '';
      seenActor = String(req.headers['x-review-actor'] ?? '');
      seenIdempotency = String(req.headers['idempotency-key'] ?? '');
      seenKind = String(req.headers['x-review-actor-kind'] ?? '');
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        seenBody = body;
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    const daemonUrl = await listen(daemon);
    const proxyServer = createServer(
      (req, res) =>
        void createProxyHandler({ config: normalizeConfig({ daemonUrl, token: 'x'.repeat(32) }) })(
          req,
          res,
        ),
    );
    const proxyUrl = await listen(proxyServer);
    const response = await fetch(`${proxyUrl}/api/code-review/reviews?limit=2`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer client-secret',
        'content-type': 'application/json',
        'idempotency-key': 'key-1',
        'x-review-actor': 'Alice',
      },
      body: '{"title":"x"}',
    });
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('{"ok":true}');
    expect(seenAuth).toBe(`Bearer ${'x'.repeat(32)}`);
    expect(seenPath).toBe('/api/reviews?limit=2');
    expect(seenBody).toBe('{"title":"x"}');
    expect(seenActor).toBe('Alice');
    expect(seenIdempotency).toBe('key-1');
    expect(seenKind).toBe('human');

    const explicit = await fetch(`${proxyUrl}/api/code-review/reviews?limit=2`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer client-secret',
        'content-type': 'application/json',
        'x-review-actor-kind': 'agent',
      },
      body: '{}',
    });
    expect(explicit.status).toBe(201);
    expect(seenKind).toBe('agent');
  });

  it('returns typed errors without leaking the token', async () => {
    const proxyServer = createServer(
      (req, res) =>
        void createProxyHandler({
          config: normalizeConfig({ daemonUrl: 'http://127.0.0.1:1', token: 'y'.repeat(32) }),
        })(req, res),
    );
    const proxyUrl = await listen(proxyServer);
    const unavailable = await fetch(`${proxyUrl}/api/code-review/reviews`);
    expect(unavailable.status).toBe(502);
    const body = (await unavailable.json()) as { error: { code: string } };
    expect(body.error.code).toBe('daemon-unavailable');
    expect(JSON.stringify(body)).not.toContain('y'.repeat(32));

    const unconfigured = createServer(
      (req, res) =>
        void createProxyHandler({
          config: normalizeConfig({ daemonUrl: 'http://127.0.0.1:3100', token: '' }),
        })(req, res),
    );
    const unconfiguredUrl = await listen(unconfigured);
    const response = await fetch(`${unconfiguredUrl}/api/code-review/reviews`);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'not-configured',
    );
  });

  it('exposes the daemon and public URLs without the token for UI links', async () => {
    const plain = createServer(
      (req, res) =>
        void createProxyHandler({
          config: normalizeConfig({ daemonUrl: 'http://127.0.0.1:3100', token: 'z'.repeat(32) }),
        })(req, res),
    );
    const plainUrl = await listen(plain);
    const plainResponse = await fetch(`${plainUrl}/api/code-review/info`);
    expect(plainResponse.status).toBe(200);
    const plainBody = (await plainResponse.json()) as { daemonUrl: string; publicUrl?: string };
    expect(plainBody.daemonUrl).toBe('http://127.0.0.1:3100');
    expect(plainBody.publicUrl).toBeUndefined();
    expect(JSON.stringify(plainBody)).not.toContain('z'.repeat(32));

    const shared = createServer(
      (req, res) =>
        void createProxyHandler({
          config: normalizeConfig({
            daemonUrl: 'http://127.0.0.1:3100',
            publicUrl: 'https://reviews.example.test/',
            token: 'z'.repeat(32),
          }),
        })(req, res),
    );
    const sharedUrl = await listen(shared);
    const sharedBody = (await (await fetch(`${sharedUrl}/api/code-review/info`)).json()) as {
      daemonUrl: string;
      publicUrl?: string;
    };
    expect(sharedBody).toEqual({
      daemonUrl: 'http://127.0.0.1:3100',
      publicUrl: 'https://reviews.example.test',
    });
  });

  it('waits for an embedded endpoint and exposes uiBase in /info', async () => {
    let release!: (value: { daemonUrl: string; token: string }) => void;
    const endpoint = new Promise<{ daemonUrl: string; token: string }>((resolve) => {
      release = resolve;
    });
    const proxy = createProxyHandler({
      config: normalizeConfig({ embedded: true }),
      prefix: '/code-review/api',
      endpoint,
      uiBase: '/code-review',
    });
    const response = createResponse();
    const request = proxy(
      { headers: {}, method: 'GET', url: '/code-review/api/info' } as never,
      response.res,
    );
    release({ daemonUrl: 'http://127.0.0.1:41234', token: 'x'.repeat(32) });
    await request;
    expect(response.getStatus()).toBe(200);
    expect(JSON.parse(response.body())).toMatchObject({
      daemonUrl: 'http://127.0.0.1:41234',
      uiBase: '/code-review',
    });
    expect(response.body()).not.toContain('x'.repeat(32));
  });

  it('returns 503 daemon-unavailable when the embedded endpoint is not ready', async () => {
    let reject!: (reason: unknown) => void;
    const endpoint = new Promise<{ daemonUrl: string; token: string }>(
      (_resolve, rejectPromise) => {
        reject = rejectPromise;
      },
    );
    const proxy = createProxyHandler({
      config: normalizeConfig({ embedded: true }),
      prefix: '/code-review/api',
      endpoint,
      uiBase: '/code-review',
    });
    const response = createResponse();
    const request = proxy(
      { headers: {}, method: 'GET', url: '/code-review/api/health' } as never,
      response.res,
    );
    reject(new Error('embedded daemon failed to start'));
    await request;
    expect(response.getStatus()).toBe(503);
    expect(JSON.parse(response.body())).toEqual({
      error: { code: 'daemon-unavailable', message: 'review daemon is not ready' },
    });
  });

  it('uses the resolved endpoint token under the configured prefix', async () => {
    const token = 'e'.repeat(32);
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchStub: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return new Response('{"status":"ok"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const proxy = createProxyHandler({
      config: normalizeConfig({ embedded: true }),
      prefix: '/code-review/api',
      endpoint: Promise.resolve({ daemonUrl: 'http://127.0.0.1:41234', token }),
      fetch: fetchStub,
    });
    const response = createResponse();
    await proxy(
      { headers: {}, method: 'GET', url: '/code-review/api/health' } as never,
      response.res,
    );
    expect(response.getStatus()).toBe(200);
    expect(calls).toEqual([
      { url: 'http://127.0.0.1:41234/api/health', authorization: `Bearer ${token}` },
    ]);
    expect(response.body()).not.toContain(token);
  });
});
