import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeBase, resolveAuthMode, withBase } from '../src/base.js';
import { parseRoute } from '../src/router.js';

describe('SPA base path', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('normalizes the Vite base', () => {
    expect(normalizeBase('/')).toBe('');
    expect(normalizeBase('/code-review/')).toBe('/code-review');
    expect(normalizeBase('/code-review')).toBe('/code-review');
    expect(normalizeBase(' code-review/ ')).toBe('/code-review');
  });

  it('prefixes links exactly once', () => {
    expect(withBase('/new', '/code-review')).toBe('/code-review/new');
    expect(withBase('/code-review/new', '/code-review')).toBe('/code-review/new');
    expect(withBase('/new', '/code-review/')).toBe('/code-review/new');
    expect(withBase('/auth?next=%2Fnew', '/code-review')).toBe('/code-review/auth?next=%2Fnew');
    expect(withBase('/new', '/')).toBe('/new');
  });

  it('parses routes below the base', () => {
    expect(parseRoute('/code-review/review/rev_1?round=2', '/code-review')).toEqual({
      name: 'review',
      id: 'rev_1',
    });
    expect(parseRoute('/code-review/', '/code-review')).toEqual({ name: 'list' });
    expect(parseRoute('/code-review', '/code-review')).toEqual({ name: 'list' });
    expect(parseRoute('/code-review/auth?next=%2Fnew', '/code-review')).toEqual({ name: 'auth' });
    expect(parseRoute('/code-review/review/rev_1', '/code-review/')).toEqual({
      name: 'review',
      id: 'rev_1',
    });
    expect(parseRoute('/review/rev_1', '/')).toEqual({ name: 'review', id: 'rev_1' });
  });

  it('leaves a path that only resembles the base untouched', () => {
    expect(parseRoute('/code-reviewer', '/code-review')).toEqual({
      name: 'not-found',
      path: '/code-reviewer',
    });
  });

  it('recognizes the embedded auth mode', () => {
    expect(resolveAuthMode('dsh')).toBe('dsh');
    expect(resolveAuthMode('token')).toBe('token');
    expect(resolveAuthMode(undefined)).toBe('token');
    expect(resolveAuthMode('DSH')).toBe('token');
  });

  it('reads the build-time constants from the Vite env', async () => {
    vi.stubEnv('BASE_URL', '/code-review/');
    vi.stubEnv('VITE_AUTH_MODE', 'dsh');
    vi.resetModules();

    const { AUTH_MODE, BASE_PATH } = await import('../src/base.js');

    expect(BASE_PATH).toBe('/code-review');
    expect(AUTH_MODE).toBe('dsh');
  });
});
