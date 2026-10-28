import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/router.js';

describe('parseRoute', () => {
  it('maps the shell routes', () => {
    expect(parseRoute('/')).toEqual({ name: 'list' });
    expect(parseRoute('/new?from=list')).toEqual({ name: 'new' });
    expect(parseRoute('/auth?next=%2Fnew')).toEqual({ name: 'auth' });
    expect(parseRoute('/health')).toEqual({ name: 'health' });
    expect(parseRoute('/new/')).toEqual({ name: 'new' });
  });

  it('decodes review ids and preserves query and hash for the detail view', () => {
    expect(parseRoute('/review/rev_01J9K?round=2#file=src%2Fa.ts')).toEqual({
      name: 'review',
      id: 'rev_01J9K',
    });
    expect(parseRoute('/review/rev%2F1')).toEqual({ name: 'review', id: 'rev/1' });
    expect(parseRoute('/review/rev%2F1/edit')).toEqual({ name: 'edit-review', id: 'rev/1' });
  });

  it('keeps malformed escapes and unknown paths in the shell', () => {
    expect(parseRoute('/review/rev%ZZ')).toEqual({ name: 'review', id: 'rev%ZZ' });
    expect(parseRoute('/missing')).toEqual({ name: 'not-found', path: '/missing' });
    expect(parseRoute('/review/a/b')).toEqual({ name: 'not-found', path: '/review/a/b' });
  });
});

describe('parseRoute below the SPA base', () => {
  it('strips the configured base before matching', () => {
    expect(parseRoute('/code-review/review/rev_1?round=2', '/code-review')).toEqual({
      name: 'review',
      id: 'rev_1',
    });
    expect(parseRoute('/code-review/review/rev%2F1/edit', '/code-review')).toEqual({
      name: 'edit-review',
      id: 'rev/1',
    });
    expect(parseRoute('/code-review/auth?next=%2Fnew', '/code-review')).toEqual({ name: 'auth' });
    expect(parseRoute('/review/rev_1', '/')).toEqual({ name: 'review', id: 'rev_1' });
  });

  it('treats the bare base and its root as the review list', () => {
    expect(parseRoute('/code-review', '/code-review')).toEqual({ name: 'list' });
    expect(parseRoute('/code-review/', '/code-review/')).toEqual({ name: 'list' });
    expect(parseRoute('/code-review/new/', '/code-review')).toEqual({ name: 'new' });
  });

  it('does not strip a path that only resembles the base', () => {
    expect(parseRoute('/code-reviewer', '/code-review')).toEqual({
      name: 'not-found',
      path: '/code-reviewer',
    });
  });
});
