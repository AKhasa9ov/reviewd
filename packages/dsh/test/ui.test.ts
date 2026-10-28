import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUiHandler } from '../src/ui.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .reverse()
      .map((fn) => fn()),
  );
});

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

async function listen(handler: Handler): Promise<string> {
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('DSH review UI handler', () => {
  let root: string;
  let webDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cr-ui-'));
    webDir = join(root, 'web');
    await mkdir(join(webDir, 'assets'), { recursive: true });
    await writeFile(join(webDir, 'index.html'), '<div id="root">full SPA</div>');
    await writeFile(join(webDir, 'assets', 'app-abc123.js'), 'console.log("spa");\n');
    cleanups.push(async () => rm(root, { recursive: true, force: true }));
  });

  it('dispatches API paths to the proxy and static paths to the SPA', async () => {
    const proxy = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
    const base = await listen(createUiHandler({ webDir, proxy, basePath: '/code-review' }));

    const api = await fetch(`${base}/code-review/api/health`);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ ok: true });

    const page = await fetch(`${base}/code-review/review/rev_1`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('full SPA');

    const asset = await fetch(`${base}/code-review/assets/app-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');

    expect(proxy).toHaveBeenCalledTimes(1);
  });

  it('redirects the bare base path to its trailing-slash form', async () => {
    const proxy = vi.fn(async () => undefined);
    const base = await listen(createUiHandler({ webDir, proxy, basePath: '/code-review' }));

    const response = await fetch(`${base}/code-review?tab=open`, { redirect: 'manual' });
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/code-review/?tab=open');
    expect(proxy).not.toHaveBeenCalled();
  });

  it('rejects non-GET requests to static paths and 404s unknown paths', async () => {
    const proxy = vi.fn(async () => undefined);
    const base = await listen(createUiHandler({ webDir, proxy, basePath: '/code-review' }));

    const post = await fetch(`${base}/code-review/review/rev_1`, { method: 'POST' });
    expect(post.status).toBe(405);

    const missing = await fetch(`${base}/code-review/not-a-route`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain('full SPA');

    const traversal = await fetch(`${base}/code-review/assets/..%2Findex.html`);
    expect(traversal.status).toBe(404);
    expect(await traversal.text()).not.toContain('full SPA');
    expect(proxy).not.toHaveBeenCalled();
  });
});
