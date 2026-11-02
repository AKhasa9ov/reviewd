import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
  ReviewLifecycle,
  ReviewServiceImpl,
  ReviewStore,
  buildSnapshot,
} from '@sir_yami/reviewd-core';
import { ApiError, writeError } from './errors.js';
import {
  bearerToken,
  cookieSession,
  isSameOriginMutation,
  assertToken,
  tokenMatches,
  verifySession,
} from './auth.js';
import { clientPeer, requestId } from './http.js';
import { RateLimiter } from './rate-limit.js';
import { EventHub } from './sse.js';
import { JobQueue } from './jobs.js';
import { DeliveryQueue } from './deliveries.js';
import { handle, mapError, reconcileOrphanedWorkerAgents } from './routes.js';
import { resolveWebDir } from './static.js';
import type { RouteContext } from './routes.js';
import type { DaemonConfig, DaemonDeps, ReviewDaemon } from './types.js';

const DEFAULTS = {
  host: '127.0.0.1',
  port: 3100,
  maxBodyBytes: 1024 * 1024,
  longPollMs: 25_000,
  heartbeatMs: 15_000,
  jobLeaseMs: 60_000,
  jobMaxAttempts: 2,
  rateLimit: { mutations: 60, reads: 600, windowMs: 60_000 },
};

function isLoopbackPeer(peer: string): boolean {
  return (
    peer === '::1' || peer === '::ffff:127.0.0.1' || peer === '127.0.0.1' || peer.startsWith('127.')
  );
}

export async function startDaemon(
  config: DaemonConfig,
  deps: DaemonDeps = {},
): Promise<ReviewDaemon> {
  assertToken(config.token);
  if (config.storeDir === undefined || config.storeDir.trim() === '') {
    throw new Error('storeDir is required');
  }
  if (config.publicUrl !== undefined && config.publicUrl !== '') {
    let parsed: URL;
    try {
      parsed = new URL(config.publicUrl);
    } catch {
      throw new Error('publicUrl must be an absolute URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('publicUrl must use http or https');
    }
  }
  const now = deps.now ?? (() => new Date());
  const store = await ReviewStore.open(config.storeDir, { now });
  let service = deps.service;
  if (service === undefined) {
    const lifecycle = new ReviewLifecycle(store, now);
    service = new ReviewServiceImpl({
      lifecycle,
      store,
      snapshots: { build: async (input) => await buildSnapshot(input) },
      now,
    });
  }
  const hub = new EventHub(service, { cursorPath: join(config.storeDir, 'stream-cursor.json') });
  try {
    await hub.load();
  } catch (error) {
    await store.close();
    throw error;
  }
  const jobs = new JobQueue({
    now,
    leaseMs: config.jobLeaseMs ?? DEFAULTS.jobLeaseMs,
    maxAttempts: config.jobMaxAttempts ?? DEFAULTS.jobMaxAttempts,
    heartbeatMs: 20_000,
  });
  const deliveries = new DeliveryQueue(now, {
    path: join(config.storeDir, 'deliveries.json'),
  });
  try {
    await deliveries.load();
  } catch (error) {
    jobs.close();
    await store.close();
    throw error;
  }
  const rateLimiter = new RateLimiter(config.rateLimit ?? DEFAULTS.rateLimit);
  const publicUrl = config.publicUrl ?? '';
  const webDir = await resolveWebDir(config.webDir);
  const ctx: RouteContext = {
    config: {
      token: config.token,
      trustProxy: config.trustProxy ?? false,
      maxBodyBytes: config.maxBodyBytes ?? DEFAULTS.maxBodyBytes,
      longPollMs: config.longPollMs ?? DEFAULTS.longPollMs,
      heartbeatMs: config.heartbeatMs ?? DEFAULTS.heartbeatMs,
      jobLeaseMs: config.jobLeaseMs ?? DEFAULTS.jobLeaseMs,
      jobMaxAttempts: config.jobMaxAttempts ?? DEFAULTS.jobMaxAttempts,
      publicUrl,
      webDir,
      rateLimit: config.rateLimit ?? DEFAULTS.rateLimit,
    },
    service,
    store,
    hub,
    jobs,
    deliveries,
    now,
  };

  // Worker jobs live in this process's memory queue, so a daemon restart can
  // leave reviews with a queued/running agent that no worker will ever lease.
  // Clear those ghosts before serving so refresh/re-scope is unblocked.
  await reconcileOrphanedWorkerAgents(ctx).catch(() => undefined);

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const id = requestId(req);
    const peer = clientPeer(req, ctx.config.trustProxy);
    try {
      const url = new URL(req.url ?? '/', 'http://daemon');
      const method = req.method ?? 'GET';
      const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
      let auth: 'bearer' | 'cookie' | null = null;
      const bearer = bearerToken(req);
      if (bearer !== undefined && tokenMatches(ctx.config.token, bearer)) {
        auth = 'bearer';
      } else if (verifySession(ctx.config.token, cookieSession(req), Date.now())) {
        auth = 'cookie';
      }

      if (
        url.pathname.startsWith('/api/') &&
        !['/api/health', '/api/version', '/api/auth', '/api/auth/logout'].includes(url.pathname)
      ) {
        if (auth === null) throw new ApiError('unauthorized', 'authentication required');
      }
      if (isMutation && url.pathname !== '/api/auth' && url.pathname !== '/api/auth/logout') {
        if (
          auth !== null &&
          !isSameOriginMutation(
            req,
            ctx.config.publicUrl || `http://${req.headers.host ?? 'localhost'}`,
            auth,
          )
        ) {
          throw new ApiError('forbidden', 'cross-origin mutation rejected');
        }
        if (auth === null) throw new ApiError('unauthorized', 'authentication required');
      }

      const kind = isMutation ? 'mutation' : 'read';
      // A local worker long-polls the queue and the panel streams reads over the
      // loopback interface. Rate-limiting those reads turns a stale worker into a
      // self-DoS; remote peers, including the LAN UI, stay limited.
      const localRead = kind === 'read' && isLoopbackPeer(peer);
      const allowed = localRead ? { allowed: true as const } : rateLimiter.check(peer, kind);
      if (!allowed.allowed) {
        throw new ApiError('rate-limited', 'rate limit exceeded', {
          retryAfter: allowed.retryAfter,
        });
      }

      await handle(req, res, ctx, {
        authenticated: auth !== null,
        auth: auth ?? 'bearer',
        peer,
      });
    } catch (error) {
      writeError(res, mapError(error), id);
    }
  };

  const server = createServer((req, res) => {
    void handler(req, res);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port ?? DEFAULTS.port, config.host ?? DEFAULTS.host, () => resolve());
    });
  } catch (error) {
    jobs.close();
    await deliveries.close();
    await store.close();
    throw error;
  }
  const address = server.address();
  const port =
    typeof address === 'object' && address !== null ? address.port : (config.port ?? DEFAULTS.port);
  const host =
    config.host === '0.0.0.0' || config.host === '::'
      ? '127.0.0.1'
      : (config.host ?? DEFAULTS.host);
  const url = `http://${host}:${port}`;

  let closed = false;
  return {
    url,
    port,
    close: async () => {
      if (closed) return;
      closed = true;
      jobs.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
      await deliveries.close();
      await store.close();
    },
  };
}
