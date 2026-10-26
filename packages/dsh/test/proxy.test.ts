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
  it('forwards path, query and body with the bearer token and strips client auth', async () => {
    let seenAuth = '';
    let seenPath = '';
    let seenBody = '';
    const daemon = createServer((req, res) => {
      seenAuth = String(req.headers.authorization);
      seenPath = req.url ?? '';
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
      headers: { authorization: 'Bearer client-secret', 'content-type': 'application/json' },
      body: '{"title":"x"}',
    });
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('{"ok":true}');
    expect(seenAuth).toBe(`Bearer ${'x'.repeat(32)}`);
    expect(seenPath).toBe('/api/reviews?limit=2');
    expect(seenBody).toBe('{"title":"x"}');
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

  it('exposes the daemon URL without the token for UI links', async () => {
    const proxyServer = createServer(
      (req, res) =>
        void createProxyHandler({
          config: normalizeConfig({ daemonUrl: 'http://127.0.0.1:3100', token: 'z'.repeat(32) }),
        })(req, res),
    );
    const proxyUrl = await listen(proxyServer);
    const response = await fetch(`${proxyUrl}/api/code-review/info`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { daemonUrl: string };
    expect(body.daemonUrl).toBe('http://127.0.0.1:3100');
    expect(JSON.stringify(body)).not.toContain('z'.repeat(32));
  });
});
