export interface RemoteConfig {
  baseUrl: string;
  token: string;
}

export class RemoteError extends Error {
  readonly exitCode: number;
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options: { exitCode: number; status?: number; code?: string }) {
    super(message);
    this.name = 'RemoteError';
    this.exitCode = options.exitCode;
    if (options.status !== undefined) this.status = options.status;
    if (options.code !== undefined) this.code = options.code;
  }
}

function statusExit(status: number): number {
  if (status === 401 || status === 403) return 3;
  if (status === 400 || status === 404 || status === 422) return 5;
  if (status === 409 || status === 429) return 6;
  if (status === 503) return 4;
  return 1;
}

export class RemoteClient {
  private readonly config: RemoteConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: RemoteConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    options: { signal?: AbortSignal } = {},
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.token}`,
      accept: 'application/json',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new RemoteError('timed out waiting for the daemon', { exitCode: 2 });
      }
      throw new RemoteError('daemon unavailable', { exitCode: 4 });
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text === '' ? {} : JSON.parse(text);
    } catch {
      parsed = {};
    }
    if (!response.ok) {
      const envelope = parsed as { error?: { code?: string; message?: string } };
      throw new RemoteError(envelope.error?.message ?? `daemon returned ${response.status}`, {
        exitCode: statusExit(response.status),
        status: response.status,
        ...(envelope.error?.code === undefined ? {} : { code: envelope.error.code }),
      });
    }
    return (parsed ?? {}) as Record<string, unknown>;
  }

  get(path: string, options: { signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
    return this.request('GET', path, undefined, options);
  }

  post(
    path: string,
    body?: unknown,
    options: { signal?: AbortSignal } = {},
  ): Promise<Record<string, unknown>> {
    return this.request('POST', path, body ?? {}, options);
  }

  patch(path: string, body: unknown): Promise<Record<string, unknown>> {
    return this.request('PATCH', path, body);
  }
}
