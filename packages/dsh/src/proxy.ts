import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReviewConfig } from './config.js';

const PREFIX = '/api/code-review';
const MAX_BODY = 2 * 1024 * 1024;

export interface ProxyEndpoint {
  daemonUrl: string;
  token: string;
}

export interface ProxyDeps {
  config: ReviewConfig;
  fetch?: typeof fetch;
  /** Mount point of the proxy route; defaults to the panel prefix. */
  prefix?: string;
  /**
   * Deferred daemon address and token. Embedded mode resolves its ephemeral
   * port asynchronously; external mode falls back to `config`.
   */
  endpoint?: Promise<ProxyEndpoint>;
  /** Same-origin UI base reported to the client when embedded. */
  uiBase?: string;
}

function json(res: ServerResponse, status: number, code: string, message: string): void {
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/** Resolve the daemon target, mapping a failed embedded startup to a typed 503. */
async function resolveEndpoint(
  deps: ProxyDeps,
  res: ServerResponse,
): Promise<ProxyEndpoint | undefined> {
  if (deps.endpoint === undefined) return deps.config;
  try {
    return await deps.endpoint;
  } catch {
    json(res, 503, 'daemon-unavailable', 'review daemon is not ready');
    return undefined;
  }
}

async function bodyOf(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.length;
    if (total > MAX_BODY) throw new Error('request body too large');
    chunks.push(buffer);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

/**
 * Build a prefix route handler for the review proxy (`/api/code-review/*` by
 * default, or the embedded `/code-review/api/*`).
 * The browser never sees the daemon token: the Host adds the bearer header,
 * strips any client Authorization header, and never copies the token to a response.
 */
export function createProxyHandler(deps: ProxyDeps) {
  const fetchImpl = deps.fetch ?? fetch;
  const prefix = deps.prefix ?? PREFIX;
  return async function proxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = req.url ?? '/';
      const path = url.startsWith(prefix) ? url.slice(prefix.length) || '/' : '/';
      if (!path.startsWith('/')) {
        json(res, 400, 'bad-path', 'invalid proxy path');
        return;
      }
      // Embedded mode resolves its ephemeral port and generated token lazily;
      // a failed startup becomes a typed 503 instead of an unhandled rejection.
      const endpoint = await resolveEndpoint(deps, res);
      if (endpoint === undefined) return;
      if (path === '/info' && (req.method === 'GET' || req.method === 'HEAD')) {
        const body = JSON.stringify({
          daemonUrl: endpoint.daemonUrl,
          ...(deps.config.publicUrl === undefined ? {} : { publicUrl: deps.config.publicUrl }),
          ...(deps.uiBase === undefined ? {} : { uiBase: deps.uiBase }),
        });
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': String(Buffer.byteLength(body)),
          'cache-control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      if (endpoint.token === '') {
        json(res, 503, 'not-configured', 'review daemon token is not configured');
        return;
      }
      const body = await bodyOf(req);
      const headers: Record<string, string> = {
        authorization: `Bearer ${endpoint.token}`,
        accept: typeof req.headers.accept === 'string' ? req.headers.accept : 'application/json',
      };
      if (req.headers['content-type'] !== undefined) {
        const contentType = req.headers['content-type'];
        if (typeof contentType === 'string') headers['content-type'] = contentType;
      }
      if (req.headers['last-event-id'] !== undefined) {
        const lastEventId = req.headers['last-event-id'];
        if (typeof lastEventId === 'string') headers['last-event-id'] = lastEventId;
      }
      // Preserve the caller's review attribution and retry-safety key; anything
      // else the browser sends (notably authorization) is deliberately dropped.
      for (const name of ['idempotency-key', 'x-review-actor', 'x-review-actor-kind'] as const) {
        const value = req.headers[name];
        if (typeof value === 'string' && value !== '') headers[name] = value;
      }
      // The proxy authenticates with the daemon bearer on behalf of a human
      // browser session. Direct API callers keep the bearer default (agent).
      if (headers['x-review-actor-kind'] === undefined) headers['x-review-actor-kind'] = 'human';
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      // The standalone UI proxy strips a prefix that already ends in `/api`, while
      // the native client's base (`/api/code-review`) is followed by ApiClient's own
      // `/api/...` paths. Forward an `/api`-prefixed remainder unchanged so neither
      // convention produces `/api/api/...` at the daemon.
      const daemonPath =
        path === '/' ? '/api' : path === '/api' || path.startsWith('/api/') ? path : `/api${path}`;
      const response = await fetchImpl(`${endpoint.daemonUrl}${daemonPath}`, {
        method: req.method ?? 'GET',
        headers,
        ...(body === undefined ? {} : { body: body as unknown as BodyInit }),
        signal: controller.signal,
        redirect: 'manual',
      });
      const contentType = response.headers.get('content-type') ?? 'application/json';
      if (contentType.includes('text/event-stream') && response.body !== null) {
        res.writeHead(response.status, {
          'content-type': contentType,
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          if (res.writableEnded) break;
          res.write(chunk);
        }
        res.end();
        return;
      }
      const text = await response.text();
      const outgoing: Record<string, string> = {
        'content-type': contentType,
        'content-length': String(Buffer.byteLength(text)),
        'cache-control': response.headers.get('cache-control') ?? 'no-store',
      };
      const requestId = response.headers.get('x-request-id');
      if (requestId !== null) outgoing['x-request-id'] = requestId;
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter !== null) outgoing['retry-after'] = retryAfter;
      res.writeHead(response.status, outgoing);
      res.end(text);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const message = error instanceof Error ? error.message : 'proxy failed';
      if (message === 'request body too large') {
        json(res, 413, 'body-too-large', 'request body exceeds 2 MiB');
        return;
      }
      json(res, 502, 'daemon-unavailable', `cannot reach review daemon: ${message}`);
    }
  };
}
