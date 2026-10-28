import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../../server/src/daemon/static.js';

export interface UiDeps {
  /** Built SPA directory, or null when the package was shipped without a web build. */
  webDir: string | null;
  /** Prefix proxy that forwards `${basePath}/api/*` to the daemon. */
  proxy: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  /** Mount point of the SPA; defaults to `/code-review`. */
  basePath?: string;
}

/**
 * HTTP handler for the review SPA mounted below the DSH web UI.
 *
 * `/code-review/api/*` is proxied to the daemon (the browser never sees its token),
 * the bare base redirects to the trailing-slash form, and every GET/HEAD below the
 * base is served from the Vite build (deep links fall back to `index.html`).
 * The handler assumes the caller already applied DSH authentication.
 */
export function createUiHandler(deps: UiDeps) {
  const base = (deps.basePath ?? '/code-review').replace(/\/+$/, '');
  const api = `${base}/api`;
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname === base) {
      res.writeHead(308, { location: `${base}/${url.search}` }).end();
      return;
    }
    if (url.pathname === api || url.pathname.startsWith(`${api}/`)) {
      await deps.proxy(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    if (await serveStatic(url.pathname, res, deps.webDir, base)) return;
    res.writeHead(404).end();
  };
}

/**
 * Locate the SPA shipped with the fat package. The built Host bundle lives in
 * `packages/dsh/index.js` (so `./web` is the published copy); source tests import
 * `packages/dsh/src/ui.ts`, where `../web` is the package build output.
 */
export function resolveUiDir(): string | null {
  const candidates = [
    fileURLToPath(new URL('./web', import.meta.url)),
    fileURLToPath(new URL('../web', import.meta.url)),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? null;
}
