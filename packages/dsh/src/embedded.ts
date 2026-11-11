import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startDaemon } from '../../server/src/daemon/server.js';
import type { ReviewDaemon } from '../../server/src/daemon/types.js';
import { DeferredReviewApi, ReviewApi } from './api.js';
import type { ReviewApiLike } from './api.js';
import type { ReviewConfig } from './config.js';

export interface EmbeddedReview {
  ready: Promise<ReviewDaemon>;
  api: ReviewApiLike;
  token: string;
  close(): Promise<void>;
}

export interface EmbeddedOptions {
  storeDir?: string;
  webDir?: string;
  startDaemon?: typeof startDaemon;
}

/**
 * Expands a leading `~` or `~/` in an explicit store directory. Relative paths
 * and `~user` forms are left unchanged rather than guessed at.
 */
export function expandStoreDir(value: string, home = homedir()): string {
  if (value === '~') return home;
  return value.startsWith('~/') ? `${home}/${value.slice(2)}` : value;
}

/**
 * Runs the review daemon in-process on an ephemeral loopback port. The bearer token
 * is generated per instance and never exposed to the browser; `api` may be used
 * before the port is known because calls wait for `ready`.
 */
export function startEmbeddedReview(
  config: ReviewConfig,
  options: EmbeddedOptions = {},
): EmbeddedReview {
  const token = randomBytes(32).toString('base64url');
  const storeDir = expandStoreDir(
    options.storeDir ?? join(homedir(), '.local', 'share', 'dsh-code-review'),
  );
  const start = options.startDaemon ?? startDaemon;
  const ready = start({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token,
    ...(options.webDir === undefined ? {} : { webDir: options.webDir }),
  });
  const api = new DeferredReviewApi(
    ready.then((daemon) => new ReviewApi({ ...config, daemonUrl: daemon.url, token })),
  );

  let closing: Promise<void> | undefined;
  return {
    ready,
    api,
    token,
    close(): Promise<void> {
      closing ??= (async () => {
        const daemon = await ready.catch(() => undefined);
        if (daemon !== undefined) await daemon.close();
      })();
      return closing;
    },
  };
}
