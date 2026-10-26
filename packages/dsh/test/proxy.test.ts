import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createProxyHandler } from '../src/proxy.js';
import { normalizeConfig } from '../src/config.js';

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
    const daemon = createServer((req, res) => {
      seenAuth = String(req.headers.authorization);
      seenPath = req.url ?? '';
      seenActor = String(req.headers['x-review-actor'] ?? '');
      seenIdempotency = String(req.headers['idempotency-key'] ?? '');
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
});
