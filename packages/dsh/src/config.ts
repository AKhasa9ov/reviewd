export type ReviewerBackend = 'worker' | 'command' | 'none';

export interface ReviewConfig {
  daemonUrl: string;
  token: string;
  worker: boolean;
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
}

export const DEFAULT_CONFIG: ReviewConfig = {
  daemonUrl: 'http://127.0.0.1:3100',
  token: '',
  worker: false,
  reviewerBackend: 'worker',
  pollMs: 2_000,
  deliveryPollMs: 1_000,
  heartbeatMs: 20_000,
  requestTimeoutMs: 30_000,
};

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
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
    daemonUrl: stringValue(input.daemonUrl, DEFAULT_CONFIG.daemonUrl).replace(/\/+$/, ''),
    token: typeof input.token === 'string' ? input.token : '',
    worker: input.worker === true,
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
  };
}

export function configProblem(config: ReviewConfig): string | undefined {
  if (config.daemonUrl === '') return 'daemonUrl is not configured';
  if (!/^https?:\/\//.test(config.daemonUrl)) return 'daemonUrl must be an http(s) URL';
  if (config.token.length < 32) return 'token must be at least 32 characters';
  return undefined;
}
