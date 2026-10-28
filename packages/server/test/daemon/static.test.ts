import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startDaemon } from '../../src/daemon/server.js';
import { CSP, resolveWebDir, serveStatic } from '../../src/daemon/static.js';
import type { ReviewDaemon } from '../../src/daemon/types.js';

const TOKEN = 'test-token-0123456789abcdef0123456789';
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

interface Fixture {
  webDir: string;
  storeDir: string;
  daemon: ReviewDaemon;
  base: string;
}

async function fixture(options: { withWeb?: boolean } = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'reviewd-static-'));
  const storeDir = join(root, 'store');
  const webDir = join(root, 'web');
  await mkdir(storeDir, { recursive: true });
  if (options.withWeb !== false) {
    await mkdir(join(webDir, 'assets'), { recursive: true });
    await writeFile(
      join(webDir, 'index.html'),
      '<!doctype html><html><body><div id="root">reviewd SPA</div></body></html>',
    );
    await writeFile(join(webDir, 'assets', 'app-abc123.js'), 'console.log("reviewd");\n');
    await writeFile(join(webDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  }
  const daemon = await startDaemon({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    webDir,
    token: TOKEN,
    rateLimit: { mutations: 100, reads: 1000, windowMs: 60_000 },
  });
  cleanups.push(async () => {
    await daemon.close();
    await rm(root, { recursive: true, force: true });
  });
  return { webDir, storeDir, daemon, base: daemon.url };
}

function securityHeaders(response: Response): void {
  expect(response.headers.get('content-security-policy')).toBe(CSP);
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
}

describe('daemon SPA static serving', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await fixture();
  });

  it('serves index.html at / with no-store and strict security headers', async () => {
    const response = await fetch(`${fx.base}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    securityHeaders(response);
    expect(await response.text()).toContain('reviewd SPA');
  });

  it.each(['/review/rev_123', '/new', '/auth', '/health'])(
    'serves the SPA shell for the deep link %s',
    async (path) => {
      const response = await fetch(`${fx.base}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toContain('reviewd SPA');
      securityHeaders(response);
    },
  );

  it('serves hashed assets immutably with the correct content type', async () => {
    const response = await fetch(`${fx.base}/assets/app-abc123.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toContain('reviewd');
    securityHeaders(response);
  });

  it('serves non-hashed root assets without caching and never falls back to index.html', async () => {
    const response = await fetch(`${fx.base}/favicon.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toBe('no-store');
    securityHeaders(response);

    const missing = await fetch(`${fx.base}/assets/missing-abc123.js`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain('reviewd SPA');
    securityHeaders(missing);

    const unknown = await fetch(`${fx.base}/not-a-route`);
    expect(unknown.status).toBe(404);
  });

  it('rejects traversal under /assets and never reads outside the web dir', async () => {
    const response = await fetch(`${fx.base}/assets/..%2Findex.html`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('reviewd SPA');
    securityHeaders(response);
  });

  it('serves the same SPA below /code-review', async () => {
    const server = createServer(async (req, res) => {
      if (!(await serveStatic(req.url ?? '/', res, fx.webDir, '/code-review'))) {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(
      async () =>
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const root = await fetch(`${base}/code-review/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('reviewd SPA');
    securityHeaders(root);

    const deep = await fetch(`${base}/code-review/review/rev_1`);
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('reviewd SPA');

    const asset = await fetch(`${base}/code-review/assets/app-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');

    const traversal = await fetch(`${base}/code-review/assets/..%2Findex.html`);
    expect(traversal.status).toBe(404);
    expect(await traversal.text()).not.toContain('reviewd SPA');

    // Outside the configured base the daemon router keeps ownership of the path.
    expect(await serveStatic('/elsewhere', {} as ServerResponse, fx.webDir, '/code-review')).toBe(
      false,
    );
    expect(
      await serveStatic('/code-review/api/health', {} as ServerResponse, fx.webDir, '/code-review'),
    ).toBe(false);
  });

  it('keeps API health JSON and auth API behavior intact', async () => {
    const health = await fetch(`${fx.base}/api/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get('content-type')).toContain('application/json');

    const auth = await fetch(`${fx.base}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
    });
    expect(auth.status).toBe(200);
    expect(auth.headers.get('set-cookie')).toContain('cr_session=');

    const form = await fetch(`${fx.base}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: TOKEN }).toString(),
    });
    expect(form.status).toBe(200);
    expect(form.headers.get('set-cookie')).toContain('cr_session=');

    const rejected = await fetch(`${fx.base}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'wrong-token' }).toString(),
    });
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get('set-cookie')).toBeNull();
  });
});

describe('daemon SPA fallback without a built UI', () => {
  it('serves a clear build instruction instead of a 500 or blank page', async () => {
    const fx = await fixture({ withWeb: false });
    const response = await fetch(`${fx.base}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    securityHeaders(response);
    const html = await response.text();
    expect(html).toContain('pnpm build');
    expect(html).toContain('reviewd is running');
  });

  it('keeps the token exchange form at /auth when dist is missing', async () => {
    const fx = await fixture({ withWeb: false });
    const response = await fetch(`${fx.base}/auth`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('form');
    expect(html).toContain('/api/auth');
  });

  it('serves the build fallback for review deep links and 404s missing assets', async () => {
    const fx = await fixture({ withWeb: false });
    const deep = await fetch(`${fx.base}/review/rev_1`);
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('pnpm build');
    const asset = await fetch(`${fx.base}/assets/app.js`);
    expect(asset.status).toBe(404);
  });
});

describe('resolveWebDir', () => {
  it('honors CODE_REVIEW_WEB_DIR over discovered build directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reviewd-webdir-'));
    await writeFile(join(root, 'index.html'), '<!doctype html><title>override</title>');
    const previous = process.env.CODE_REVIEW_WEB_DIR;
    process.env.CODE_REVIEW_WEB_DIR = root;
    try {
      expect(await resolveWebDir()).toBe(root);
    } finally {
      if (previous === undefined) delete process.env.CODE_REVIEW_WEB_DIR;
      else process.env.CODE_REVIEW_WEB_DIR = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns null for an explicit directory that has no index.html', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reviewd-webdir-'));
    try {
      expect(await resolveWebDir(root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
