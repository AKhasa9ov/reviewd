/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { apply, inject } from '../src/host.js';

function createResponse() {
  let status = 0;
  let ended = false;
  const res: any = {
    writeHead: (s: number) => {
      status = s;
      return res;
    },
    end: () => {
      ended = true;
      return res;
    },
    headersSent: false,
    writableEnded: false,
  };
  return {
    res,
    getStatus: () => status,
    isEnded: () => ended,
  };
}

function createContext(requestRejection: () => 401 | 403 | undefined) {
  let registered: any;
  const ctx: any = {
    tools: { register: () => () => undefined },
    commands: { register: () => () => undefined },
    webServer: {
      register: (route: any) => {
        registered = route;
        return () => undefined;
      },
    },
    connection: { requestRejection },
    effect: (cb: any) => {
      cb();
      return () => undefined;
    },
    get: () => undefined,
    logger: { warn: () => undefined },
  };
  return { ctx, getRegistered: () => registered };
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
    expect(registered.path).toBe('/api/code-review');
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
    const { ctx, getRegistered } = createContext(() => undefined);
    apply(ctx, { daemonUrl: 'http://127.0.0.1:1', token: 'x'.repeat(32), worker: false });
    const registered = getRegistered();
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
    const { ctx, getRegistered } = createContext(() => {
      checked = true;
      return 403;
    });
    apply(ctx, { daemonUrl: 'http://127.0.0.1:3100', token: 'x'.repeat(32), worker: false });
    const registered = getRegistered();
    const response = createResponse();
    await registered.handler(
      { headers: {}, method: 'GET', url: '/api/code-review/info' } as IncomingMessage,
      response.res,
    );
    expect(checked).toBe(true);
    expect(response.getStatus()).toBe(403);
    expect(response.isEnded()).toBe(true);
  });
});
