import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const COOKIE_NAME = 'cr_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

export function assertToken(token: string): void {
  if (typeof token !== 'string' || Buffer.byteLength(token, 'utf8') < 32) {
    throw new Error('CODE_REVIEW_TOKEN must be at least 32 bytes');
  }
}

function digest(value: string): Buffer {
  return createHmac('sha256', 'review-token-compare-v1').update(value, 'utf8').digest();
}

/** Constant-time compare that also accepts unequal-length inputs. */
export function tokenMatches(expected: string, provided: string): boolean {
  return timingSafeEqual(digest(expected), digest(provided));
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (header === undefined) return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name !== '' && !(name in cookies)) cookies[name] = value;
  }
  return cookies;
}

function sign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSession(secret: string, now = Date.now()): string {
  const issuedAt = String(now);
  return `v1.${issuedAt}.${sign(secret, `v1.${issuedAt}`)}`;
}

export function verifySession(
  secret: string,
  value: string | undefined,
  now = Date.now(),
): boolean {
  if (value === undefined) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;
  if (now - issuedAt > SESSION_MAX_AGE_MS || issuedAt - now > 60_000) return false;
  const expected = sign(secret, `v1.${parts[1]}`);
  const provided = parts[2] ?? '';
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function sessionCookie(secret: string, options: { secure: boolean; now?: number }): string {
  const parts = [
    `${COOKIE_NAME}=${createSession(secret, options.now)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

export function cookieSession(req: IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie)[COOKIE_NAME];
}

function expectedOrigin(req: IncomingMessage, publicUrl: string): string {
  try {
    return new URL(publicUrl).origin;
  } catch {
    const host = req.headers.host;
    return host === undefined ? '' : `http://${host}`;
  }
}

/**
 * SameSite=Strict is the primary control; this is the matching server-side
 * check. Bearer clients such as curl may omit Origin, but a present Origin
 * must match the configured public origin.
 */
export function isSameOriginMutation(
  req: IncomingMessage,
  publicUrl: string,
  auth: 'bearer' | 'cookie',
): boolean {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== '') {
    return origin === expectedOrigin(req, publicUrl);
  }
  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite !== '') {
    return fetchSite === 'same-origin' || fetchSite === 'none';
  }
  return auth === 'bearer';
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}
