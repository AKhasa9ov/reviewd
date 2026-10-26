import { describe, expect, it } from 'vitest';
import { deriveOutcome, normalizeQuote } from '../../src/index.js';
import type { Anchor, FileDiff, Snapshot, Suggestion } from '../../src/index.js';

const sha = 'a'.repeat(40);
const head = 'b'.repeat(40);

function file(
  path: string,
  newLines: string[] | undefined,
  extra: Partial<FileDiff> = {},
): FileDiff {
  return {
    path,
    status: 'modified',
    binary: false,
    oversized: false,
    added: 0,
    deleted: 0,
    hunks: [],
    newLines,
    contentHash: null,
    ...extra,
  };
}

function snapshot(files: FileDiff[]): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/repo',
      baseSha: sha,
      headSha: head,
      label: 'a..b',
      worktreeDigest: 'digest',
    },
    files,
    totals: { files: files.length, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
}

function anchor(overrides: Partial<Anchor> = {}): Anchor {
  return {
    id: 'anc_1',
    round: 1,
    path: 'src/a.ts',
    side: 'new',
    lineStart: 1,
    lineEnd: 1,
    quote: 'old',
    contextBefore: [],
    contextAfter: [],
    hunkHeader: '',
    contentHash: 'hash',
    state: 'active',
    ...overrides,
  };
}

function derive(
  previous: Anchor,
  next: Anchor,
  files: FileDiff[],
  suggestion?: Suggestion,
): ReturnType<typeof deriveOutcome> {
  return deriveOutcome(previous, next, snapshot(files), suggestion);
}

describe('normalizeQuote', () => {
  it('converts CRLF, trims trailing whitespace per line and preserves internal spacing', () => {
    expect(normalizeQuote('a  \r\nb\t\r\n  c  ')).toBe('a\nb\n  c');
  });

  it('is stable for already normal text', () => {
    expect(normalizeQuote('one\n  two three\n')).toBe('one\n  two three\n');
  });
});

describe('deriveOutcome', () => {
  it('marks an exact normalized suggestion replacement as applied', () => {
    const outcome = derive(
      anchor({ quote: 'old' }),
      anchor({ round: 2, quote: 'new', lineStart: 2, lineEnd: 2 }),
      [file('src/a.ts', ['zero', 'new'])],
      { original: 'old', replacement: 'new' },
    );

    expect(outcome).toEqual({ round: 2, status: 'applied', confidence: 'high' });
  });

  it('compares the replacement with normalized suggestion and snapshot whitespace', () => {
    const outcome = derive(
      anchor({ quote: 'old' }),
      anchor({ round: 2, quote: 'new', lineStart: 1, lineEnd: 1 }),
      [file('src/a.ts', ['new\r'])],
      { original: 'old', replacement: 'new  ' },
    );

    expect(outcome).toEqual({ round: 2, status: 'applied', confidence: 'high' });
  });

  it('does not call a no-op suggestion applied', () => {
    const outcome = derive(
      anchor({ quote: 'old' }),
      anchor({ round: 2, quote: 'old', lineStart: 1, lineEnd: 1 }),
      [file('src/a.ts', ['old'])],
      { original: 'old', replacement: 'old' },
    );

    expect(outcome).toEqual({ round: 2, status: 'unchanged', confidence: 'high' });
  });

  it('marks a changed quote as addressed with medium confidence without a suggestion', () => {
    const outcome = derive(
      anchor({ quote: 'old' }),
      anchor({ round: 2, quote: 'changed', lineStart: 1, lineEnd: 1 }),
      [file('src/a.ts', ['changed'])],
    );

    expect(outcome).toEqual({ round: 2, status: 'addressed', confidence: 'medium' });
  });

  it('raises addressed confidence when the suggestion replacement appears in the new file', () => {
    const outcome = derive(
      anchor({ quote: 'old' }),
      anchor({ round: 2, quote: 'changed', lineStart: 1, lineEnd: 1 }),
      [file('src/a.ts', ['changed', 'new'])],
      { original: 'old', replacement: 'new' },
    );

    expect(outcome).toEqual({ round: 2, status: 'addressed', confidence: 'high' });
  });

  it('keeps addressed at medium when the suggestion replacement is absent', () => {
    const outcome = derive(
      anchor({ quote: 'old' }),
      anchor({ round: 2, quote: 'changed', lineStart: 1, lineEnd: 1 }),
      [file('src/a.ts', ['changed', 'other'])],
      { original: 'old', replacement: 'new' },
    );

    expect(outcome).toEqual({ round: 2, status: 'addressed', confidence: 'medium' });
  });

  it('reports unchanged when quote and position are both unchanged', () => {
    expect(derive(anchor(), anchor({ round: 2 }), [file('src/a.ts', ['old'])])).toEqual({
      round: 2,
      status: 'unchanged',
      confidence: 'high',
    });
  });

  it('reports moved when only the line changed', () => {
    expect(
      derive(anchor({ lineStart: 1, lineEnd: 1 }), anchor({ round: 2, lineStart: 3, lineEnd: 3 }), [
        file('src/a.ts', ['zero', 'one', 'old']),
      ]),
    ).toEqual({ round: 2, status: 'moved', confidence: 'high' });
  });

  it('reports moved when only the path changed', () => {
    expect(
      derive(anchor({ path: 'src/a.ts' }), anchor({ round: 2, path: 'src/b.ts' }), [
        file('src/b.ts', ['old']),
      ]),
    ).toEqual({ round: 2, status: 'moved', confidence: 'high' });
  });

  it('never reports addressed for an unchanged quote that only moved', () => {
    expect(
      derive(
        anchor({ lineStart: 2, lineEnd: 2 }),
        anchor({ round: 2, lineStart: 5, lineEnd: 5, state: 'ambiguous' }),
        [file('src/a.ts', ['zero', 'one', 'two', 'three', 'old'])],
      ),
    ).toEqual({ round: 2, status: 'moved', confidence: 'high' });
  });

  it('reports outdated when the next snapshot has no such file', () => {
    expect(derive(anchor(), anchor({ round: 2 }), [])).toEqual({
      round: 2,
      status: 'outdated',
      confidence: 'high',
    });
  });

  it('reports outdated when the anchor is already outdated', () => {
    expect(
      derive(anchor(), anchor({ round: 2, state: 'outdated' }), [file('src/a.ts', ['old'])]),
    ).toEqual({ round: 2, status: 'outdated', confidence: 'high' });
  });

  it('reports outdated when the next file is truncated', () => {
    expect(
      derive(anchor(), anchor({ round: 2 }), [
        file('src/a.ts', undefined, { truncated: true, reason: 'diff-truncated' }),
      ]),
    ).toEqual({ round: 2, status: 'outdated', confidence: 'high' });
  });

  it('reports outdated when the next file has no line content', () => {
    expect(derive(anchor(), anchor({ round: 2 }), [file('src/a.ts', undefined)])).toEqual({
      round: 2,
      status: 'outdated',
      confidence: 'high',
    });
  });
});
