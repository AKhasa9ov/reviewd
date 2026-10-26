import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReviewApi } from './api.js';
import { configProblem, normalizeConfig } from './config.js';
import type { ReviewConfig } from './config.js';
import { createReviewCommand } from './command.js';
import { createProxyHandler } from './proxy.js';
import { createReviewTools } from './tools.js';
import type { PluginContext } from './tools.js';
import { runDeliveryLoop } from './delivery.js';
import type { DeliveryDeps } from './delivery.js';
import { runWorkerLoop } from './worker.js';
import type { WorkerDeps } from './worker.js';

export const name = 'code-review';
export const inject = ['tools', 'commands', 'webServer', 'connection'];

type AnyRecord = Record<string, unknown>;

interface ConnectionHandle {
  /**
   * Applies Connection's Host/Origin fence and browser/API credential checks
   * to a Web route that is not part of the `/api` RPC channel.
   */
  requestRejection(request: { headers: IncomingMessage['headers'] }): 401 | 403 | undefined;
}

interface HostContext extends PluginContext {
  commands: { register(definition: AnyRecord): () => void };
  webServer: { register(route: AnyRecord): () => void };
  connection: ConnectionHandle;
  effect(callback: () => (() => void) | void): () => void;
  get(service: string): unknown;
  logger?: { info?(message: string): void; warn?(message: string): void };
}

/**
 * The prefix route is mounted on the public web server and injects the daemon
 * bearer, so it must apply DSH's own authentication before proxying. `/info` is
 * gated as well: it reveals the daemon address and must not be anonymous.
 *
 * `requestRejection` is the Connection API for non-RPC Web routes. `admit` /
 * `admitConnection` are not used: they return a Peer, and `admitConnection`
 * claims socket ownership, disposes API peers on release, and answers 409 to
 * concurrent requests - all wrong for a per-request HTTP proxy.
 */
function withConnectionGate(
  connection: ConnectionHandle,
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const rejection = connection.requestRejection({ headers: req.headers });
    if (rejection !== undefined) {
      res.writeHead(rejection).end();
      return;
    }
    await handler(req, res);
  };
}

function service<T>(ctx: HostContext, key: string): T | undefined {
  const value = ctx.get(key);
  return value === undefined || value === null ? undefined : (value as T);
}

function startLoops(ctx: HostContext, config: ReviewConfig, api: ReviewApi): () => void {
  const controller = new AbortController();
  const agents = service<WorkerDeps['agents']>(ctx, 'agents');
  const sessionController = service<
    DeliveryDeps['sessionController'] & WorkerDeps['sessionController']
  >(ctx, 'sessionController');

  if (config.worker) {
    const deps: WorkerDeps = {
      config,
      api,
      ...(agents === undefined ? {} : { agents }),
      ...(sessionController === undefined ? {} : { sessionController }),
      ...(ctx.logger === undefined ? {} : { logger: ctx.logger }),
    };
    void runWorkerLoop(deps, controller.signal).catch((error: unknown) => {
      ctx.logger?.warn?.(
        `code-review: worker stopped: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });
  }
  if (sessionController !== undefined) {
    const deps: DeliveryDeps = {
      config,
      api,
      sessionController,
      ...(ctx.logger === undefined ? {} : { logger: ctx.logger }),
    };
    void runDeliveryLoop(deps, controller.signal).catch((error: unknown) => {
      ctx.logger?.warn?.(
        `code-review: delivery stopped: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });
  }
  return () => controller.abort();
}

/** Cordis Host entry: proxy, agent tools, /review command, worker and delivery. */
export function apply(ctx: HostContext, rawConfig: unknown): void {
  const config = normalizeConfig(rawConfig);
  const problem = configProblem(config);
  if (problem !== undefined) {
    ctx.logger?.warn?.(`code-review: ${problem}; tools and panel will report not configured`);
  }
  const api = new ReviewApi(config);
  const proxy = createProxyHandler({ config });
  const gatedProxy = withConnectionGate(ctx.connection, proxy);
  ctx.effect(() =>
    ctx.webServer.register({ kind: 'prefix', path: '/api/code-review', handler: gatedProxy }),
  );
  ctx.effect(() => {
    const disposers = createReviewTools(ctx, config, api);
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
  ctx.effect(() => createReviewCommand({ ...ctx, commands: ctx.commands }, config, api));
  ctx.effect(() => startLoops(ctx, config, api));
}
