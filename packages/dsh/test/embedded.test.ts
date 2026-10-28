import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DeferredReviewApi } from '../src/api.js';
import type { ReviewApiLike } from '../src/api.js';
import { normalizeConfig } from '../src/config.js';
import { startEmbeddedReview } from '../src/embedded.js';
import type { EmbeddedOptions } from '../src/embedded.js';
import type { DaemonConfig, ReviewDaemon } from '../../server/src/daemon/types.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .reverse()
      .map((fn) => fn()),
  );
});

describe('deferred review api', () => {
  it('holds calls until the underlying client is ready and forwards arguments', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    let resolveClient!: (client: ReviewApiLike) => void;
    const pending = new Promise<ReviewApiLike>((resolve) => {
      resolveClient = resolve;
    });
    const api = new DeferredReviewApi(pending);

    let settled = false;
    const health = api.get<{ path: string }>('/api/health', controller.signal).finally(() => {
      settled = true;
    });
    const created = api.post<{ path: string }>('/api/reviews', { title: 'one' }, controller.signal);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(calls).toEqual([]);

    resolveClient({
      get: async <T>(path: string, signal?: AbortSignal): Promise<T> => {
        calls.push(`get ${path} same-signal=${String(signal === controller.signal)}`);
        return { path } as unknown as T;
      },
      post: async <T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> => {
        calls.push(
          `post ${path} ${JSON.stringify(body)} same-signal=${String(signal === controller.signal)}`,
        );
        return { path } as unknown as T;
      },
    });

    await expect(health).resolves.toEqual({ path: '/api/health' });
    await expect(created).resolves.toEqual({ path: '/api/reviews' });
    expect(calls).toEqual([
      'get /api/health same-signal=true',
      'post /api/reviews {"title":"one"} same-signal=true',
    ]);
  });
});

describe('embedded review daemon', () => {
  it('starts on loopback, serves the API, and closes the port', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'cr-embedded-'));
    const embedded = startEmbeddedReview(
      normalizeConfig({ worker: false, reviewerBackend: 'none' }),
      { storeDir },
    );
    cleanups.push(async () => {
      await embedded.close();
      await rm(storeDir, { recursive: true, force: true });
    });

    const daemon = await embedded.ready;
    expect(daemon.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(daemon.port).toBeGreaterThan(0);
    expect(embedded.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // `/api/health` is auth-exempt; this read proves the generated token reaches the API.
    expect(await embedded.api.get('/api/health')).toMatchObject({ status: 'ok' });
    await expect(embedded.api.get('/api/reviews')).resolves.toMatchObject({ items: [] });

    await embedded.close();
    await expect(fetch(`${daemon.url}/api/health`)).rejects.toThrow();
  });

  it('closes a daemon that becomes ready after close() was called', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'cr-embedded-'));
    const embedded = startEmbeddedReview(normalizeConfig({ reviewerBackend: 'none' }), {
      storeDir,
    });
    cleanups.push(async () => {
      await embedded.close();
      await rm(storeDir, { recursive: true, force: true });
    });

    const closing = embedded.close();
    const daemon = await embedded.ready;
    await closing;
    await expect(embedded.close()).resolves.toBeUndefined();
    await expect(fetch(`${daemon.url}/api/health`)).rejects.toThrow();
  });

  it('does not leak an unhandled rejection when startup fails', async () => {
    const embedded = startEmbeddedReview(normalizeConfig({ reviewerBackend: 'none' }), {
      startDaemon: async () => {
        throw new Error('startup failed');
      },
    });

    await expect(embedded.ready).rejects.toThrow('startup failed');
    await expect(embedded.api.get('/api/health')).rejects.toThrow('startup failed');
    await expect(embedded.close()).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('uses loopback, port 0, a 32-byte token and the default store, closing once', async () => {
    let release!: (daemon: ReviewDaemon) => void;
    const daemonReady = new Promise<ReviewDaemon>((resolve) => {
      release = resolve;
    });
    const configs: DaemonConfig[] = [];
    let closes = 0;
    const fakeStart: NonNullable<EmbeddedOptions['startDaemon']> = async (config) => {
      configs.push(config);
      return daemonReady;
    };
    const embedded = startEmbeddedReview(normalizeConfig({ reviewerBackend: 'none' }), {
      startDaemon: fakeStart,
    });

    const closing = embedded.close();
    await Promise.resolve();
    expect(configs).toHaveLength(1);

    release({
      url: 'http://127.0.0.1:4321',
      port: 4321,
      close: async () => {
        closes += 1;
      },
    });
    await closing;
    expect(closes).toBe(1);

    await embedded.close();
    expect(closes).toBe(1);

    expect(configs[0]).toMatchObject({
      host: '127.0.0.1',
      port: 0,
      storeDir: join(homedir(), '.local', 'share', 'dsh-code-review'),
      token: embedded.token,
    });
    expect(configs[0]?.webDir).toBeUndefined();
    expect(embedded.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('forwards an explicit webDir to the injected daemon starter', async () => {
    const configs: DaemonConfig[] = [];
    const fakeStart: NonNullable<EmbeddedOptions['startDaemon']> = async (config) => {
      configs.push(config);
      return {
        url: 'http://127.0.0.1:4567',
        port: 4567,
        close: async () => undefined,
      };
    };
    const embedded = startEmbeddedReview(normalizeConfig({ reviewerBackend: 'none' }), {
      startDaemon: fakeStart,
      storeDir: join(tmpdir(), 'cr-webdir-store'),
      webDir: join(tmpdir(), 'cr-webdir'),
    });

    await embedded.ready;
    await embedded.close();

    expect(configs[0]).toMatchObject({
      storeDir: join(tmpdir(), 'cr-webdir-store'),
      webDir: join(tmpdir(), 'cr-webdir'),
    });
  });
});
