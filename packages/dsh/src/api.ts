import type { ReviewConfig } from './config.js';

export class ReviewApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'ReviewApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ReviewApiOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function errorCode(status: number): string {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status === 503) return 'unavailable';
  if (status >= 500) return 'daemon-error';
  return 'request-failed';
}

/** Small daemon client used by tools, worker and delivery. Never exposes the token. */
export class ReviewApi {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: ReviewConfig, options: ReviewApiOptions = {}) {
    this.base = config.daemonUrl;
    this.token = config.token;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? config.requestTimeoutMs;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = text === '' ? null : JSON.parse(text);
      } catch {
        payload = { error: { code: 'invalid-response', message: text.slice(0, 500) } };
      }
      if (!response.ok) {
        const envelope =
          typeof payload === 'object' && payload !== null
            ? (payload as { error?: { code?: unknown; message?: unknown } })
            : {};
        const code =
          typeof envelope.error?.code === 'string'
            ? envelope.error.code
            : errorCode(response.status);
        const message =
          typeof envelope.error?.message === 'string'
            ? envelope.error.message
            : `daemon returned ${String(response.status)}`;
        throw new ReviewApiError(code, response.status, message);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ReviewApiError) throw error;
      if (signal?.aborted === true) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ReviewApiError('timeout', 0, 'review daemon request timed out');
      }
      throw new ReviewApiError(
        'daemon-unavailable',
        0,
        error instanceof Error ? error.message : 'review daemon unavailable',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, undefined, signal);
  }

  post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('POST', path, body, signal);
  }
}
