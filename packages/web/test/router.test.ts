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
