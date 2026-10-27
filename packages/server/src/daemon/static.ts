import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';

export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";

const SPA_ROUTES = new Set(['/', '/auth', '/new', '/health', '/settings']);
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function contentType(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export function setStaticSecurityHeaders(res: ServerResponse): void {
  res.setHeader('content-security-policy', CSP);
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
}

function isSpaRoute(pathname: string): boolean {
  return SPA_ROUTES.has(pathname) || /^\/review\/[^/]+$/.test(pathname);
}

function safeRelative(root: string, requested: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (isAbsolute(decoded)) return null;
  const absolute = resolve(root, decoded);
  const rel = relative(root, absolute);
  if (rel === '' || rel.startsWith('..') || rel.split(sep).includes('..')) return null;
  return absolute;
}

async function resolveInside(root: string, requested: string): Promise<string | null> {
  const absolute = safeRelative(root, requested);
  if (absolute === null) return null;
  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(absolute)]);
    const rel = relative(realRoot, realFile);
    if (rel === '' || rel.startsWith('..') || rel.split(sep).includes('..')) return null;
    return realFile;
  } catch {
    return null;
  }
}

function sendHtml(res: ServerResponse, html: string, cache: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': cache,
  });
  res.end(html);
}

function fallbackHtml(): string {
  return [
    '<!doctype html><meta charset="utf-8"><title>reviewd — UI not built</title>',
    '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:44rem;margin:10vh auto;padding:0 1.5rem;color:#1f2328;background:#f6f8fa}code{background:#eaeef2;padding:.15rem .35rem;border-radius:4px}</style>',
    '<h1>reviewd is running</h1>',
    '<p>The browser UI has not been built yet. Build it with <code>pnpm build</code> and reload this page.</p>',
    '<p>For scripted clients use the authenticated API at <code>/api</code>; health is available at <code>/api/health</code>.</p>',
    '<p><a href="/auth">Sign in</a> · <a href="/api/health">Health</a></p>',
  ].join('\n');
}

function fallbackAuthHtml(): string {
  return [
    '<!doctype html><meta charset="utf-8"><title>reviewd — sign in</title>',
    '<h1>Sign in</h1>',
    '<p>The browser UI is not built. You can still exchange a token for a session cookie:</p>',
    '<form method="post" action="/api/auth"><input name="token" type="password" autocomplete="current-password"><button>Sign in</button></form>',
  ].join('\n');
}

export interface StaticResult {
  handled: boolean;
  webDir: string | null;
}

/**
 * Resolve the built SPA directory. The daemon bundle lives in `packages/server/dist`;
 * source tests run from `packages/server/src`; both must find `packages/web/dist`.
 */
export async function resolveWebDir(explicit?: string): Promise<string | null> {
  const env = process.env.CODE_REVIEW_WEB_DIR;
  const override = explicit !== undefined && explicit.trim() !== '' ? explicit : env;
  if (override !== undefined && override.trim() !== '') {
    const root = resolve(override);
    try {
      const info = await stat(resolve(root, 'index.html'));
      return info.isFile() ? root : null;
    } catch {
      return null;
    }
  }

  const candidates = [
    fileURLToPath(new URL('../../web/dist', import.meta.url)),
    fileURLToPath(new URL('../../../web/dist', import.meta.url)),
    resolve(process.cwd(), 'packages/web/dist'),
    resolve(process.cwd(), 'web/dist'),
  ];
  for (const candidate of candidates) {
    const root = resolve(candidate);
    try {
      const info = await stat(resolve(root, 'index.html'));
      if (info.isFile()) return root;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * Serve the built SPA and its hashed assets. Returns false for API routes and unknown
 * paths so the caller can continue to the authenticated API router.
 */
export async function serveStatic(
  pathname: string,
  res: ServerResponse,
  webDir: string | null,
): Promise<boolean> {
  if (pathname.startsWith('/api/')) return false;

  if (webDir === null) {
    if (pathname === '/' || pathname === '/auth' || isSpaRoute(pathname)) {
      setStaticSecurityHeaders(res);
      sendHtml(res, pathname === '/auth' ? fallbackAuthHtml() : fallbackHtml(), 'no-store');
      return true;
    }
    notFound(res);
    return true;
  }

  if (isSpaRoute(pathname) || pathname === '/index.html') {
    const html = await readFile(resolve(webDir, 'index.html')).catch(() => null);
    if (html === null) return false;
    setStaticSecurityHeaders(res);
    sendHtml(res, html.toString('utf8'), 'no-store');
    return true;
  }

  if (pathname.startsWith('/assets/')) {
    const requested = pathname.slice(1);
    if (requested.includes('..') || requested.includes('\\')) {
      notFound(res);
      return true;
    }
    const file = await resolveInside(webDir, requested);
    if (file === null) {
      notFound(res);
      return true;
    }
    const body = await readFile(file).catch(() => null);
    if (body === null) {
      notFound(res);
      return true;
    }
    setStaticSecurityHeaders(res);
    res.writeHead(200, {
      'content-type': contentType(file),
      'content-length': body.byteLength,
      'cache-control': IMMUTABLE_CACHE,
    });
    res.end(body);
    return true;
  }

  // A Vite build may emit root-level files (favicon, robots.txt). Serve only real files
  // inside the dist directory; never fall back to index.html for them.
  const rootFile = await resolveInside(webDir, pathname.slice(1));
  if (rootFile !== null) {
    const body = await readFile(rootFile).catch(() => null);
    if (body !== null) {
      setStaticSecurityHeaders(res);
      res.writeHead(200, {
        'content-type': contentType(rootFile),
        'content-length': body.byteLength,
        'cache-control': 'no-store',
      });
      res.end(body);
      return true;
    }
  }

  notFound(res);
  return true;
}

function notFound(res: ServerResponse): void {
  setStaticSecurityHeaders(res);
  const html = '<!doctype html><meta charset="utf-8"><title>Not found</title><h1>Not found</h1>';
  res.writeHead(404, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
  });
  res.end(html);
}
