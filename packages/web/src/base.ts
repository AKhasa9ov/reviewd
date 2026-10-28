export function normalizeBase(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return '';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

export function resolveAuthMode(value: string | undefined): 'token' | 'dsh' {
  return value === 'dsh' ? 'dsh' : 'token';
}

/**
 * Vite's `base` for this build: empty for the standalone daemon origin or
 * `/code-review` for the SPA embedded in the DSH web UI.
 */
export const BASE_PATH = normalizeBase(import.meta.env.BASE_URL ?? '/');

/**
 * The standalone build uses the daemon's token login; the embedded build relies
 * on the DSH session cookie and never renders the token form.
 */
export const AUTH_MODE = resolveAuthMode(import.meta.env.VITE_AUTH_MODE);

export function withBase(path: string, base = BASE_PATH): string {
  const normalized = normalizeBase(base);
  if (normalized === '') return path;
  if (path === normalized || path.startsWith(`${normalized}/`)) return path;
  return `${normalized}${path.startsWith('/') ? path : `/${path}`}`;
}
