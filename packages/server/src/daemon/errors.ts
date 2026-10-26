import type { ServerResponse } from 'node:http';

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'stale-review'
  | 'agent-busy'
  | 'daemon-unavailable'
  | 'rate-limited'
  | 'internal';

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  validation: 400,
  conflict: 409,
  'stale-review': 409,
  'agent-busy': 409,
  'daemon-unavailable': 503,
  'rate-limited': 429,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly retryAfter?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; retryAfter?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    if (options.details !== undefined) this.details = options.details;
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter;
  }
}

export function errorEnvelope(error: ApiError): {
  error: { code: ApiErrorCode; message: string; details?: Record<string, unknown> };
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

export function writeError(res: ServerResponse, error: ApiError, requestId: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  const body = JSON.stringify(errorEnvelope(error));
  res.writeHead(error.status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-request-id': requestId,
    ...(error.retryAfter === undefined ? {} : { 'retry-after': String(error.retryAfter) }),
  });
  res.end(body);
}
