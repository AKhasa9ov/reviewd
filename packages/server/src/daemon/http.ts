import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError } from './errors.js';

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export function clientPeer(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim() !== '') {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function requestId(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  if (typeof header === 'string' && header.length > 0 && header.length <= 200) return header;
  return `req_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export async function readJson(
  req: IncomingMessage,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const declared = req.headers['content-length'];
  if (typeof declared === 'string' && Number(declared) > maxBytes) {
    throw new ApiError('validation', `request body exceeds ${maxBytes} bytes`);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new ApiError('validation', `request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }
  if (total === 0) return {};
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError('validation', 'request body is not valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('validation', 'request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

export function sendJson(
  res: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function methodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, { error: { code: 'validation', message: 'method not allowed' } });
}

export function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
