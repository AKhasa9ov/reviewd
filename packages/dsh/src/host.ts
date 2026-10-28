import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReviewApi } from './api.js';
import type { ReviewApiLike } from './api.js';
import { configProblem, normalizeConfig } from './config.js';
import type { ReviewConfig } from './config.js';
import { createReviewCommand } from './command.js';
import { startEmbeddedReview } from './embedded.js';
import { createProxyHandler } from './proxy.js';
import { createUiHandler, resolveUiDir } from './ui.js';
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
  effect(callback: () => (() => void | Promise<void>) | void): () => void;
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

function startLoops(ctx: HostContext, config: ReviewConfig, api: ReviewApiLike): () => void {
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

  const embedded = config.embedded
    ? startEmbeddedReview(config, {
        ...(config.storeDir === undefined ? {} : { storeDir: config.storeDir }),
      })
    : undefined;
  if (embedded !== undefined) {
    // Register lifetime cleanup before the route and loop effects: Cordis
    // disposes a fiber's effects in reverse registration order, so worker and
    // delivery loops abort before the daemon they poll closes.
    ctx.effect(() => async () => {
      await embedded.close().catch((error: unknown) => {
        ctx.logger?.warn?.(
          `code-review: embedded daemon did not close cleanly: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
    });
  }
  const endpoint =
    embedded === undefined
      ? undefined
      : embedded.ready.then((daemon) => ({ daemonUrl: daemon.url, token: embedded.token }));
  // A failed embedded startup is reported through the proxy as a typed 503;
  // observe it here so it cannot surface as an unhandled rejection first.
  if (endpoint !== undefined) void endpoint.catch(() => undefined);
  // Tools, command and loops go through the deferred handle in embedded mode,
  // so they can be registered before the ephemeral port is known.
  const api: ReviewApiLike = embedded?.api ?? new ReviewApi(config);
  const proxy = createProxyHandler({
    config,
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(embedded === undefined ? {} : { uiBase: config.uiBase }),
  });
  const gatedProxy = withConnectionGate(ctx.connection, proxy);
  ctx.effect(() =>
    ctx.webServer.register({ kind: 'prefix', path: '/api/code-review', handler: gatedProxy }),
  );
  if (embedded !== undefined) {
    // The DSH session cookie already identifies the user, so the SPA is mounted on
    // the Host origin and its API calls are proxied without exposing the daemon token.
    // External mode keeps the daemon-origin UI and its own token login.
    const uiProxy = createProxyHandler({
      config,
      prefix: `${config.uiBase}/api`,
      ...(endpoint === undefined ? {} : { endpoint }),
      uiBase: config.uiBase,
    });
    const ui = createUiHandler({
      webDir: resolveUiDir(),
      proxy: uiProxy,
      basePath: config.uiBase,
    });
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'prefix',
        path: config.uiBase,
        handler: withConnectionGate(ctx.connection, ui),
      }),
    );
  }
  ctx.effect(() => {
    const disposers = createReviewTools(ctx, config, api);
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
  ctx.effect(() => createReviewCommand({ ...ctx, commands: ctx.commands }, config, api));
  ctx.effect(() => startLoops(ctx, config, api));
}
