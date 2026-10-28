/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { apply, inject } from '../src/host.js';

const contextDisposals: Array<() => Promise<void>> = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
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

function createContext(requestRejection: () => 401 | 403 | undefined = () => undefined) {
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
    get: () => undefined,
    logger: { warn: () => undefined },
  };
  const dispose = async (): Promise<void> => {
    // Cordis disposes a fiber's effects in reverse registration order.
    for (const disposer of disposers.splice(0).reverse()) await disposer();
  };
  contextDisposals.push(dispose);
  return { ctx, getRegistered: () => routes.at(-1), dispose };
}

describe('host plugin connection gate', () => {
  it('injects connection', () => {
    expect(inject).toContain('connection');
  });

  it('rejects unauthorized requests to the code-review prefix', async () => {
    let checked = false;
    const { ctx, getRegistered } = createContext(() => {
      checked = true;
      return 401;
    });
    apply(ctx, { daemonUrl: 'http://127.0.0.1:3100', token: 'x'.repeat(32), worker: false });
    const registered = getRegistered();
    expect(registered?.path).toBe('/api/code-review');
    const response = createResponse();
    await registered!.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/reviews' } as IncomingMessage,
      response.res,
    );
    expect(checked).toBe(true);
    expect(response.getStatus()).toBe(401);
    expect(response.isEnded()).toBe(true);
  });

  it('admits authorized requests to the code-review prefix', async () => {
    const { ctx, getRegistered } = createContext(() => undefined);
    apply(ctx, { daemonUrl: 'http://127.0.0.1:1', token: 'x'.repeat(32), worker: false });
    const registered = getRegistered();
    const response = createResponse();
    await registered!.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/info' } as IncomingMessage,
      response.res,
    );
    expect(response.getStatus()).toBe(200);
    expect(response.isEnded()).toBe(true);
  });

  it('does not exempt /info from the gate', async () => {
    let checked = false;
    const { ctx, getRegistered } = createContext(() => {
      checked = true;
      return 403;
    });
    apply(ctx, { daemonUrl: 'http://127.0.0.1:3100', token: 'x'.repeat(32), worker: false });
    const registered = getRegistered();
    const response = createResponse();
    await registered!.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/info' } as IncomingMessage,
      response.res,
    );
    expect(checked).toBe(true);
    expect(response.getStatus()).toBe(403);
    expect(response.isEnded()).toBe(true);
  });
});

describe('host plugin embedded mode', () => {
  it('starts the daemon behind the panel proxy and closes it on dispose', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'cr-host-'));
    cleanups.push(async () => rm(storeDir, { recursive: true, force: true }));
    const { ctx, getRegistered, dispose } = createContext();
    apply(ctx, { embedded: true, storeDir, worker: false, reviewerBackend: 'none' });

    const registered = getRegistered();
    expect(registered?.path).toBe('/api/code-review');

    const health = createResponse();
    await registered!.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/health' } as IncomingMessage,
      health.res,
    );
    expect(health.getStatus()).toBe(200);
    expect(JSON.parse(health.body())).toMatchObject({ status: 'ok' });

    const info = createResponse();
    await registered!.handler(
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
});
