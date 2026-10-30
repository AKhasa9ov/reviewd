/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as embeddedModule from '../src/embedded.js';
import type * as uiModule from '../src/ui.js';

const uiWebDir = vi.hoisted(() => ({ value: '' }));
vi.mock('../src/ui.js', async (importOriginal) => {
  const actual = await importOriginal<typeof uiModule>();
  return {
    ...actual,
    resolveUiDir: () => (uiWebDir.value === '' ? null : uiWebDir.value),
  };
});

/**
 * Test seam for embedded startup failures. `apply` always boots the real daemon,
 * so these tests stand in a controlled `EmbeddedReview` instead of forcing a
 * failing bind; the control plane and `startEmbeddedReview` failure mode are
 * covered by embedded.test.ts.
 */
const embeddedSeam = vi.hoisted(() => ({
  override: undefined as undefined | ((config: unknown, options: unknown) => unknown),
}));
vi.mock('../src/embedded.js', async (importOriginal) => {
  const actual = await importOriginal<typeof embeddedModule>();
  return {
    ...actual,
    startEmbeddedReview: (
      config: Parameters<typeof actual.startEmbeddedReview>[0],
      options?: Parameters<typeof actual.startEmbeddedReview>[1],
    ) =>
      embeddedSeam.override === undefined
        ? actual.startEmbeddedReview(config, options ?? {})
        : (embeddedSeam.override(config, options) as ReturnType<typeof actual.startEmbeddedReview>),
  };
});

import { normalizeConfig } from '../src/config.js';
import { apply, inject, startReviewLoops } from '../src/host.js';

const contextDisposals: Array<() => Promise<void>> = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  embeddedSeam.override = undefined;
  uiWebDir.value = '';
  for (const dispose of contextDisposals.splice(0).reverse()) await dispose();
  await Promise.all(
    cleanups
      .splice(0)
      .reverse()
      .map((fn) => fn()),
  );
});

function createResponse(): {
  res: ServerResponse;
  getStatus(): number;
  body(): string;
  isEnded(): boolean;
} {
  let status = 0;
  let body = '';
  let ended = false;
  const res = {
    writeHead: (next: number) => {
      status = next;
      return res;
    },
    setHeader: () => res,
    end: (chunk?: unknown) => {
      ended = true;
      if (typeof chunk === 'string') body += chunk;
      else if (chunk instanceof Uint8Array) body += Buffer.from(chunk).toString();
      return res;
    },
    on: () => res,
    headersSent: false,
    writableEnded: false,
  } as unknown as ServerResponse;
  return { res, getStatus: () => status, body: () => body, isEnded: () => ended };
}

interface RegisteredRoute {
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

function routeAt(routes: RegisteredRoute[], path: string): RegisteredRoute {
  const registered = routes.find((route) => route.path === path);
  if (registered === undefined) throw new Error(`route ${path} was not registered`);
  return registered;
}

function createContext(
  requestRejection: () => 401 | 403 | undefined = () => undefined,
  options: { warn?: (message: string) => void; services?: Record<string, unknown> } = {},
) {
  const routes: RegisteredRoute[] = [];
  const disposers: Array<() => void | Promise<void>> = [];
  const ctx: any = {
    tools: { register: () => () => undefined },
    commands: { register: () => () => undefined },
    webServer: {
      register: (route: RegisteredRoute) => {
        routes.push(route);
        return () => undefined;
      },
    },
    connection: { requestRejection },
    effect: (callback: () => (() => void | Promise<void>) | void) => {
      const dispose = callback();
      if (typeof dispose === 'function') disposers.push(dispose);
      return () => undefined;
    },
    get: (key: string) => options.services?.[key],
    logger: { warn: options.warn ?? (() => undefined) },
  };
  const dispose = async (): Promise<void> => {
    // Cordis disposes a fiber's effects in reverse registration order.
    for (const disposer of disposers.splice(0).reverse()) await disposer();
  };
  contextDisposals.push(dispose);
  return { ctx, getRegistered: () => routes.at(-1), getRoutes: () => routes, dispose };
}

describe('host plugin connection gate', () => {
  it('injects connection', () => {
    expect(inject).toContain('connection');
  });

  it('injects sessionController so delivery can wake the initiator', () => {
    expect(inject).toContain('sessionController');
  });

  it('rejects unauthorized requests to the code-review prefix', async () => {
    let checked = false;
    const { ctx, getRoutes } = createContext(() => {
      checked = true;
      return 401;
    });
    apply(ctx, { daemonUrl: 'http://127.0.0.1:3100', token: 'x'.repeat(32), worker: false });
    const registered = routeAt(getRoutes(), '/api/code-review');
    const response = createResponse();
    await registered.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/reviews' } as IncomingMessage,
      response.res,
    );
    expect(checked).toBe(true);
    expect(response.getStatus()).toBe(401);
    expect(response.isEnded()).toBe(true);
  });

  it('admits authorized requests to the code-review prefix', async () => {
    const { ctx, getRoutes } = createContext(() => undefined);
    apply(ctx, { daemonUrl: 'http://127.0.0.1:1', token: 'x'.repeat(32), worker: false });
    const registered = routeAt(getRoutes(), '/api/code-review');
    const response = createResponse();
    await registered.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/info' } as IncomingMessage,
      response.res,
    );
    expect(response.getStatus()).toBe(200);
    expect(response.isEnded()).toBe(true);
  });

  it('does not exempt /info from the gate', async () => {
    let checked = false;
    const { ctx, getRoutes } = createContext(() => {
      checked = true;
      return 403;
    });
    apply(ctx, { daemonUrl: 'http://127.0.0.1:3100', token: 'x'.repeat(32), worker: false });
    const registered = routeAt(getRoutes(), '/api/code-review');
    const response = createResponse();
    await registered.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/info' } as IncomingMessage,
      response.res,
    );
    expect(checked).toBe(true);
    expect(response.getStatus()).toBe(403);
    expect(response.isEnded()).toBe(true);
  });

  it('registers only the panel proxy in external mode', () => {
    const { ctx, getRoutes } = createContext();
    apply(ctx, { daemonUrl: 'http://127.0.0.1:3100', token: 'x'.repeat(32), worker: false });
    expect(getRoutes().map((route) => route.path)).toEqual(['/api/code-review']);
  });
});

describe('host plugin embedded mode', () => {
  it('starts the daemon behind the panel proxy and closes it on dispose', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'cr-host-'));
    cleanups.push(async () => rm(storeDir, { recursive: true, force: true }));
    const { ctx, getRoutes, dispose } = createContext();
    apply(ctx, { embedded: true, storeDir, worker: false, reviewerBackend: 'none' });

    const registered = routeAt(getRoutes(), '/api/code-review');

    const health = createResponse();
    await registered.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/health' } as IncomingMessage,
      health.res,
    );
    expect(health.getStatus()).toBe(200);
    expect(JSON.parse(health.body())).toMatchObject({ status: 'ok' });

    const info = createResponse();
    await registered.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/info' } as IncomingMessage,
      info.res,
    );
    expect(info.getStatus()).toBe(200);
    const infoBody = JSON.parse(info.body()) as {
      daemonUrl: string;
      uiBase?: string;
      token?: unknown;
    };
    expect(infoBody).toMatchObject({ uiBase: '/code-review' });
    expect(infoBody.daemonUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(infoBody).not.toHaveProperty('token');

    await dispose();
    await expect(fetch(`${infoBody.daemonUrl}/api/health`)).rejects.toThrow();
  });

  it('serves the embedded UI under /code-review behind the connection gate', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'cr-host-ui-'));
    cleanups.push(async () => rm(storeDir, { recursive: true, force: true }));
    const webDir = await mkdtemp(join(tmpdir(), 'cr-host-web-'));
    await writeFile(join(webDir, 'index.html'), '<div id="root">host SPA</div>');
    cleanups.push(async () => rm(webDir, { recursive: true, force: true }));
    uiWebDir.value = webDir;

    let rejection: 401 | 403 | undefined = 401;
    const { ctx, getRoutes, dispose } = createContext(() => rejection);
    apply(ctx, { embedded: true, storeDir, worker: false, reviewerBackend: 'none' });

    const ui = routeAt(getRoutes(), '/code-review');
    const unauthorized = createResponse();
    await ui.handler(
      { headers: {}, method: 'GET', url: '/code-review/review/rev_1' } as IncomingMessage,
      unauthorized.res,
    );
    expect(unauthorized.getStatus()).toBe(401);

    rejection = undefined;
    const authorized = createResponse();
    await ui.handler(
      { headers: {}, method: 'GET', url: '/code-review/review/rev_1' } as IncomingMessage,
      authorized.res,
    );
    expect(authorized.getStatus()).toBe(200);
    expect(authorized.body()).toContain('host SPA');

    await dispose();
    uiWebDir.value = '';
  });
});

type LoopContext = Parameters<typeof startReviewLoops>[0];
type LoopApi = Parameters<typeof startReviewLoops>[2];

/** Host context for the loop helper: upstream services and a logger. */
function loopContext(
  warn: (message: string) => void = () => undefined,
  services: Record<string, unknown> = { agents: { create: vi.fn() } },
): LoopContext {
  return {
    get: (key: string) => services[key],
    logger: { warn },
  } as unknown as LoopContext;
}

function loopApi(): {
  api: LoopApi;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(async () => null);
  const post = vi.fn(async () => ({ id: 'wkr_1' }));
  return { api: { get, post } as unknown as LoopApi, get, post };
}

describe('review loop readiness', () => {
  it('starts the worker only after embedded readiness resolves', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, get, post } = loopApi();
    const stop = startReviewLoops(
      loopContext(),
      normalizeConfig({ embedded: true, worker: true, workerConcurrency: 1 }),
      api,
      ready,
    );

    await Promise.resolve();
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toBe('/api/workers/register');
    stop();
  });

  it('starts delivery only after embedded readiness resolves', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const get = vi.fn(async () => ({ deliveries: [] }));
    const post = vi.fn(async () => ({}));
    const stop = startReviewLoops(
      loopContext(undefined, { sessionController: { prompt: vi.fn(), resolveAgent: vi.fn() } }),
      normalizeConfig({ embedded: true, worker: false }),
      { get, post } as unknown as LoopApi,
      ready,
    );

    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/deliveries/pending?harness=dsh', expect.anything()),
    );
    stop();
  });

  it('warns when the delivery helper is started without sessionController', async () => {
    const warn = vi.fn();
    const { api, get } = loopApi();
    const stop = startReviewLoops(loopContext(warn), normalizeConfig({ worker: false }), api);

    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn.mock.calls[0]?.[0]).toContain('sessionController');
    expect(get).not.toHaveBeenCalled();
    stop();
  });

  it('warns and starts nothing when embedded readiness rejects', async () => {
    const warn = vi.fn();
    const { api, get, post } = loopApi();
    let reject!: (error: Error) => void;
    const ready = new Promise<void>((_resolve, rejectReady) => {
      reject = rejectReady;
    });
    const stop = startReviewLoops(
      loopContext(warn),
      normalizeConfig({ embedded: true, worker: true }),
      api,
      ready,
    );

    expect(post).not.toHaveBeenCalled();
    reject(new Error('bind refused'));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]?.[0]).toContain('embedded daemon failed: bind refused');
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    stop();
  });

  it('does not start loops when disposed before embedded readiness', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const warn = vi.fn();
    const { api, get, post } = loopApi();
    const stop = startReviewLoops(
      loopContext(warn),
      normalizeConfig({ embedded: true, worker: true }),
      api,
      ready,
    );

    stop();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('starts immediately when no readiness promise is supplied', async () => {
    const { api, post } = loopApi();
    const stop = startReviewLoops(
      loopContext(),
      normalizeConfig({ worker: true, workerConcurrency: 1 }),
      api,
    );

    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toBe('/api/workers/register');
    stop();
  });

  it('runs one independent worker poll per configured concurrency slot', async () => {
    const ids: string[] = [];
    const get = vi.fn(
      (_path: string, signal?: AbortSignal) =>
        new Promise<null>((resolve) => {
          signal?.addEventListener('abort', () => resolve(null), { once: true });
        }),
    );
    const post = vi.fn(async (path: string) => {
      if (path === '/api/workers/register') {
        const id = `wkr_${ids.length + 1}`;
        ids.push(id);
        return { id };
      }
      return {};
    });
    const stop = startReviewLoops(
      loopContext(),
      normalizeConfig({ worker: true, workerConcurrency: 3 }),
      { get, post } as unknown as LoopApi,
    );

    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(ids).toHaveLength(3);
    const polledWorkers = get.mock.calls.map(([path]) => path);
    expect(new Set(polledWorkers)).toEqual(
      new Set([
        `/api/jobs/next?workerId=wkr_1&wait=25`,
        `/api/jobs/next?workerId=wkr_2&wait=25`,
        `/api/jobs/next?workerId=wkr_3&wait=25`,
      ]),
    );
    stop();
  });
});

describe('host embedded startup failure', () => {
  it('keeps routes available with a typed 503 and starts no loops', async () => {
    const get = vi.fn(async () => null);
    const post = vi.fn(async () => ({ id: 'wkr_1' }));
    const warn = vi.fn();
    embeddedSeam.override = () => ({
      ready: Promise.reject(new Error('bind refused')),
      api: { get, post },
      token: 'embedded-token',
      close: async () => undefined,
    });
    const { ctx, getRoutes, dispose } = createContext(() => undefined, {
      warn,
      services: { agents: { create: vi.fn() } },
    });

    apply(ctx, { embedded: true, worker: true, reviewerBackend: 'none' });

    // The panel proxy stays mounted and reports the failed startup as a typed 503.
    const panel = routeAt(getRoutes(), '/api/code-review');
    const health = createResponse();
    await panel.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/health' } as IncomingMessage,
      health.res,
    );
    expect(health.getStatus()).toBe(503);
    expect(JSON.parse(health.body())).toEqual({
      error: { code: 'daemon-unavailable', message: 'review daemon is not ready' },
    });

    // The same-origin UI stays reachable; its API proxy also reports 503.
    const ui = routeAt(getRoutes(), '/code-review');
    const uiHealth = createResponse();
    await ui.handler(
      { headers: {}, method: 'GET', url: '/code-review/api/health' } as IncomingMessage,
      uiHealth.res,
    );
    expect(uiHealth.getStatus()).toBe(503);

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('embedded daemon failed: bind refused'),
      ),
    );
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    await expect(dispose()).resolves.toBeUndefined();
  });

  it('aborts polls before closing the embedded daemon on dispose', async () => {
    const events: string[] = [];
    const get = vi.fn((path: string, signal?: AbortSignal) => {
      events.push(`get ${path}`);
      return new Promise<null>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            events.push('loop-aborted');
            resolve(null);
          },
          { once: true },
        );
      });
    });
    const post = vi.fn(async (path: string) => {
      events.push(`post ${path}`);
      return { id: 'wkr_1' };
    });
    embeddedSeam.override = () => ({
      ready: Promise.resolve({
        url: 'http://127.0.0.1:4321',
        port: 4321,
        close: async () => undefined,
      }),
      api: { get, post },
      token: 'embedded-token',
      close: async () => {
        events.push('daemon-close');
      },
    });
    const { ctx, dispose } = createContext(() => undefined, {
      services: { agents: { create: vi.fn() } },
    });

    apply(ctx, {
      embedded: true,
      worker: true,
      workerConcurrency: 1,
      reviewerBackend: 'none',
    });
    await vi.waitFor(() =>
      expect(events.some((event) => event.startsWith('get /api/jobs/next'))).toBe(true),
    );

    await dispose();

    const abortedAt = events.indexOf('loop-aborted');
    const closedAt = events.indexOf('daemon-close');
    expect(abortedAt).toBeGreaterThanOrEqual(0);
    expect(closedAt).toBeGreaterThan(abortedAt);
    // Disposal must not resurrect the worker: exactly one registration, ever.
    expect(events.filter((event) => event === 'post /api/workers/register')).toHaveLength(1);
  });
});
