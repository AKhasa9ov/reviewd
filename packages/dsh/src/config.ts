export type ReviewerBackend = 'worker' | 'command' | 'none';

export interface ReviewConfig {
  /** Run the review daemon in-process instead of proxying to an external `daemonUrl`. */
  embedded: boolean;
  /** Same-origin path where the full review UI is mounted when embedded. */
  uiBase: string;
  /** Embedded daemon data directory; defaults to the controller's user-data path. */
  storeDir?: string;
  daemonUrl: string;
  /** Browser-reachable standalone UI origin; daemonUrl may be loopback-only. */
  publicUrl?: string;
  token: string;
  worker: boolean;
  /** Number of independent reviewer workers this Host runs; clamped to 1..8. */
  workerConcurrency: number;
  repoHint?: string;
  reviewerBackend: ReviewerBackend;
  sessionId?: string;
  cwd?: string;
  reviewerPreset?: string;
  reviewerModel?: { provider?: string; model?: string; reasoningEffort?: string };
  pollMs: number;
  deliveryPollMs: number;
  heartbeatMs: number;
  requestTimeoutMs: number;
  reviewerTimeoutMs: number;
}

export const DEFAULT_CONFIG: ReviewConfig = {
  embedded: false,
  uiBase: '/code-review',
  daemonUrl: 'http://127.0.0.1:3100',
  token: '',
  worker: false,
  workerConcurrency: 3,
  reviewerBackend: 'worker',
  pollMs: 2_000,
  deliveryPollMs: 1_000,
  heartbeatMs: 20_000,
  requestTimeoutMs: 30_000,
  reviewerTimeoutMs: 10 * 60 * 1000,
};

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(max, numeric));
}

/** Normalize the untyped Loader config; never throw during plugin activation. */
export function normalizeConfig(raw: unknown): ReviewConfig {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const backend =
    input.reviewerBackend === 'command' || input.reviewerBackend === 'none'
      ? input.reviewerBackend
      : 'worker';
  const model = input.reviewerModel;
  return {
    embedded: input.embedded === true,
    uiBase: stringValue(input.uiBase, DEFAULT_CONFIG.uiBase).replace(/\/+$/, ''),
    ...(typeof input.storeDir === 'string' && input.storeDir.trim() !== ''
      ? { storeDir: input.storeDir.trim() }
      : {}),
    daemonUrl: stringValue(input.daemonUrl, DEFAULT_CONFIG.daemonUrl).replace(/\/+$/, ''),
    ...(typeof input.publicUrl === 'string' && input.publicUrl.trim() !== ''
      ? { publicUrl: input.publicUrl.trim().replace(/\/+$/, '') }
      : {}),
    token: typeof input.token === 'string' ? input.token : '',
    worker: input.worker === true,
    workerConcurrency: bounded(input.workerConcurrency, DEFAULT_CONFIG.workerConcurrency, 1, 8),
    ...(typeof input.repoHint === 'string' && input.repoHint.trim() !== ''
      ? { repoHint: input.repoHint.trim() }
      : {}),
    reviewerBackend: backend,
    ...(typeof input.sessionId === 'string' && input.sessionId !== ''
      ? { sessionId: input.sessionId }
      : {}),
    ...(typeof input.cwd === 'string' && input.cwd !== '' ? { cwd: input.cwd } : {}),
    ...(typeof input.reviewerPreset === 'string' && input.reviewerPreset !== ''
      ? { reviewerPreset: input.reviewerPreset }
      : {}),
    ...(typeof model === 'object' && model !== null
      ? {
          reviewerModel: Object.fromEntries(
            Object.entries(model as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
            ),
          ),
        }
      : {}),
    pollMs: positive(input.pollMs, DEFAULT_CONFIG.pollMs),
    deliveryPollMs: positive(input.deliveryPollMs, DEFAULT_CONFIG.deliveryPollMs),
    heartbeatMs: positive(input.heartbeatMs, DEFAULT_CONFIG.heartbeatMs),
    requestTimeoutMs: positive(input.requestTimeoutMs, DEFAULT_CONFIG.requestTimeoutMs),
    reviewerTimeoutMs: positive(input.reviewerTimeoutMs, DEFAULT_CONFIG.reviewerTimeoutMs),
  };
}

export function configProblem(config: ReviewConfig): string | undefined {
  // Embedded mode owns the daemon and generates its own bearer, so external
  // daemon URL/token settings do not apply and must not block activation.
  if (config.embedded) return undefined;
  if (config.daemonUrl === '') return 'daemonUrl is not configured';
  if (!/^https?:\/\//.test(config.daemonUrl)) return 'daemonUrl must be an http(s) URL';
  if (config.publicUrl !== undefined && !/^https?:\/\//.test(config.publicUrl)) {
    return 'publicUrl must be an http(s) URL';
  }
  if (config.token.length < 32) return 'token must be at least 32 characters';
  return undefined;
}
