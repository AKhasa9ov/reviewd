import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AnchorError, captureAnchor, reanchor } from '../../src/index.js';
import type { Anchor, DiffHunk, FileDiff, Snapshot } from '../../src/index.js';

const sha = 'a'.repeat(40);
const head = 'b'.repeat(40);

function file(
  path: string,
  lines: { oldLines?: string[]; newLines?: string[]; oldPath?: string },
  hunks: DiffHunk[] = [],
): FileDiff {
  return {
    path,
    status: 'modified',
    binary: false,
    oversized: false,
    added: 0,
    deleted: 0,
    hunks,
    oldLines: lines.oldLines,
    newLines: lines.newLines,
    ...(lines.oldPath === undefined ? {} : { oldPath: lines.oldPath }),
    contentHash: null,
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

function hunk(
  oldStart: number,
  oldLines: number,
  newStart: number,
  newLines: number,
  header = `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`,
): DiffHunk {
  return { oldStart, oldLines, newStart, newLines, header, lines: [] };
}

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const six = ['one', 'two', 'three', 'four', 'five', 'six'];

function expectAnchorError(run: () => unknown): void {
  expect(typeof AnchorError).toBe('function');
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AnchorError);
    return;
  }
  throw new Error('expected an AnchorError');
}

describe('captureAnchor', () => {
  it('captures the quote, two lines of context, hunk header and hash', () => {
    const anchor = captureAnchor(
      snapshot([file('src/a.ts', { newLines: six }, [hunk(1, 6, 1, 6)])]),
      { path: 'src/a.ts', side: 'new', lineStart: 3, lineEnd: 4, round: 1, id: 'anc_fixed' },
    );

    expect(anchor).toEqual({
      id: 'anc_fixed',
      round: 1,
      path: 'src/a.ts',
      side: 'new',
      lineStart: 3,
      lineEnd: 4,
      quote: 'three\nfour',
      contextBefore: ['one', 'two'],
      contextAfter: ['five', 'six'],
      hunkHeader: '@@ -1,6 +1,6 @@',
      contentHash: hash('three\nfour'),
      state: 'active',
    });
  });

  it('captures old-side lines and an empty header outside every hunk', () => {
    const anchor = captureAnchor(
      snapshot([file('src/a.ts', { oldLines: six }, [hunk(1, 2, 1, 2)])]),
      { path: 'src/a.ts', side: 'old', lineStart: 5, round: 1, id: 'anc_old' },
    );

    expect(anchor.quote).toBe('five');
    expect(anchor.lineStart).toBe(5);
    expect(anchor.lineEnd).toBe(5);
    expect(anchor.hunkHeader).toBe('');
    expect(anchor.contextBefore).toEqual(['three', 'four']);
    expect(anchor.contextAfter).toEqual(['six']);
  });

  it('rejects missing paths, missing sides, truncated content and invalid ranges', () => {
    const truncated: FileDiff = {
      ...file('src/truncated.ts', {}),
      truncated: true,
    };
    const base = snapshot([file('src/a.ts', { newLines: six }), truncated]);

    expectAnchorError(() =>
      captureAnchor(base, { path: 'src/missing.ts', side: 'new', lineStart: 1, round: 1 }),
    );
    expectAnchorError(() =>
      captureAnchor(base, { path: 'src/a.ts', side: 'old', lineStart: 1, round: 1 }),
    );
    expectAnchorError(() =>
      captureAnchor(base, { path: 'src/truncated.ts', side: 'new', lineStart: 1, round: 1 }),
    );
    expectAnchorError(() =>
      captureAnchor(base, { path: 'src/a.ts', side: 'new', lineStart: 0, round: 1 }),
    );
    expectAnchorError(() =>
      captureAnchor(base, { path: 'src/a.ts', side: 'new', lineStart: 5, lineEnd: 7, round: 1 }),
    );
    expectAnchorError(() =>
      captureAnchor(base, { path: 'src/a.ts', side: 'new', lineStart: 4, lineEnd: 3, round: 1 }),
    );
  });
});

describe('reanchor', () => {
  it('keeps an unchanged line active and records exactly one previous position', () => {
    const previous = captureAnchor(
      snapshot([file('src/a.ts', { newLines: six }, [hunk(1, 6, 1, 6)])]),
      { path: 'src/a.ts', side: 'new', lineStart: 3, lineEnd: 4, round: 1, id: 'anc_r1' },
    );

    const next = reanchor(
      previous,
      snapshot([file('src/a.ts', { newLines: six }, [hunk(1, 6, 1, 6)])]),
      { round: 2, id: 'anc_r2' },
    );

    expect(next).toMatchObject({
      id: 'anc_r2',
      round: 2,
      path: 'src/a.ts',
      lineStart: 3,
      lineEnd: 4,
      quote: 'three\nfour',
      state: 'active',
      previous: { round: 1, path: 'src/a.ts', lineStart: 3, lineEnd: 4 },
    });
    expect(next.contextBefore).toEqual(['one', 'two']);
    expect(next.contextAfter).toEqual(['five', 'six']);
    expect(next.contentHash).toBe(hash('three\nfour'));
  });

  it('follows a rename and uses the new path', () => {
    const previous = captureAnchor(snapshot([file('src/old.ts', { newLines: six })]), {
      path: 'src/old.ts',
      side: 'new',
      lineStart: 2,
      round: 1,
      id: 'anc_r1',
    });

    const next = reanchor(
      previous,
      snapshot([file('src/new.ts', { oldPath: 'src/old.ts', newLines: six })]),
      { round: 2, id: 'anc_r2' },
    );

    expect(next.path).toBe('src/new.ts');
    expect(next.lineStart).toBe(2);
    expect(next.state).toBe('active');
    expect(next.previous).toEqual({ round: 1, path: 'src/old.ts', lineStart: 2, lineEnd: 2 });
  });

  it('maps old-side lines across an insertion and a deletion', () => {
    const previousInsert = captureAnchor(
      snapshot([file('src/a.ts', { oldLines: ['A', 'B', 'C'] })]),
      { path: 'src/a.ts', side: 'old', lineStart: 2, round: 1, id: 'anc_insert' },
    );
    const nextInsert = reanchor(
      previousInsert,
      snapshot([
        file('src/a.ts', { oldLines: ['A', 'B', 'C'], newLines: ['A', 'X', 'B', 'C'] }, [
          hunk(1, 1, 1, 2),
        ]),
      ]),
      { round: 2, id: 'anc_insert_r2' },
    );
    expect(nextInsert.lineStart).toBe(3);
    expect(nextInsert.quote).toBe('B');

    const previousDelete = captureAnchor(
      snapshot([file('src/a.ts', { oldLines: ['A', 'B', 'C'] })]),
      { path: 'src/a.ts', side: 'old', lineStart: 3, round: 1, id: 'anc_delete' },
    );
    const nextDelete = reanchor(
      previousDelete,
      snapshot([
        file('src/a.ts', { oldLines: ['A', 'B', 'C'], newLines: ['A', 'C'] }, [hunk(2, 1, 2, 0)]),
      ]),
      { round: 2, id: 'anc_delete_r2' },
    );
    expect(nextDelete.lineStart).toBe(2);
    expect(nextDelete.quote).toBe('C');
  });

  it('searches inside the default 40-line window and not outside it', () => {
    const lines = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`);
    const previous = captureAnchor(snapshot([file('src/a.ts', { newLines: lines })]), {
      path: 'src/a.ts',
      side: 'new',
      lineStart: 1,
      round: 1,
      id: 'anc_r1',
    });

    const inside = [...lines];
    inside[0] = 'changed';
    inside[40] = 'line 1';
    const found = reanchor(previous, snapshot([file('src/a.ts', { newLines: inside })]), {
      round: 2,
      id: 'anc_inside',
    });
    expect(found.state).toBe('active');
    expect(found.lineStart).toBe(41);

    const outside = [...lines];
    outside[0] = 'changed';
    outside[41] = 'line 1';
    const missed = reanchor(previous, snapshot([file('src/a.ts', { newLines: outside })]), {
      round: 2,
      id: 'anc_outside',
    });
    expect(missed.state).toBe('outdated');
  });

  it('matches multi-line quotes only as consecutive lines', () => {
    const previous = captureAnchor(snapshot([file('src/a.ts', { newLines: six })]), {
      path: 'src/a.ts',
      side: 'new',
      lineStart: 3,
      lineEnd: 4,
      round: 1,
      id: 'anc_r1',
    });
    const next = reanchor(
      previous,
      snapshot([
        file('src/a.ts', { newLines: ['zero', 'one', 'two', 'three', 'four', 'extra', 'five'] }),
      ]),
      { round: 2, id: 'anc_r2' },
    );

    expect(next.state).toBe('active');
    expect(next.lineStart).toBe(4);
    expect(next.lineEnd).toBe(5);
    expect(next.quote).toBe('three\nfour');
  });

  it('marks equal-score equidistant candidates ambiguous and picks the nearest', () => {
    const lines = Array.from({ length: 21 }, (_, index) => `line ${index + 1}`);
    const previous: Anchor = {
      id: 'anc_r1',
      round: 1,
      path: 'src/a.ts',
      side: 'new',
      lineStart: 11,
      lineEnd: 11,
      quote: 'needle',
      contextBefore: [],
      contextAfter: [],
      hunkHeader: '',
      contentHash: hash('needle'),
      state: 'active',
    };
    const nextLines = [...lines];
    nextLines[9] = 'needle';
    nextLines[11] = 'needle';

    const next = reanchor(previous, snapshot([file('src/a.ts', { newLines: nextLines })]), {
      round: 2,
      id: 'anc_r2',
    });

    expect(next.state).toBe('ambiguous');
    expect([10, 12]).toContain(next.lineStart);
  });

  it('returns outdated with the old quote and position when the quote disappears', () => {
    const previous = captureAnchor(snapshot([file('src/a.ts', { newLines: six })]), {
      path: 'src/a.ts',
      side: 'new',
      lineStart: 3,
      lineEnd: 4,
      round: 1,
      id: 'anc_r1',
    });
    const next = reanchor(
      previous,
      snapshot([file('src/a.ts', { newLines: ['one', 'two', 'gone', 'four', 'five', 'six'] })]),
      { round: 2, id: 'anc_r2' },
    );

    expect(next.state).toBe('outdated');
    expect(next.quote).toBe('three\nfour');
    expect(next.contextBefore).toEqual(['one', 'two']);
    expect(next.contextAfter).toEqual(['five', 'six']);
    expect(next.lineStart).toBe(3);
    expect(next.lineEnd).toBe(4);
    expect(next.previous).toEqual({ round: 1, path: 'src/a.ts', lineStart: 3, lineEnd: 4 });
  });

  it('returns outdated for deleted, truncated and missing files without throwing', () => {
    const previous = captureAnchor(snapshot([file('src/a.ts', { newLines: six })]), {
      path: 'src/a.ts',
      side: 'new',
      lineStart: 3,
      round: 1,
      id: 'anc_r1',
    });

    const deleted = reanchor(previous, snapshot([file('src/a.ts', { oldLines: six })]), {
      round: 2,
      id: 'anc_deleted',
    });
    expect(deleted.state).toBe('outdated');
    expect(deleted.quote).toBe('three');

    const truncated = reanchor(previous, snapshot([{ ...file('src/a.ts', {}), truncated: true }]), {
      round: 2,
      id: 'anc_truncated',
    });
    expect(truncated.state).toBe('outdated');

    const missing = reanchor(previous, snapshot([]), { round: 2, id: 'anc_missing' });
    expect(missing.state).toBe('outdated');
    expect(missing.path).toBe('src/a.ts');
  });

  it('normalizes CRLF and trailing spaces for matching but keeps the original quote', () => {
    const previous: Anchor = {
      id: 'anc_r1',
      round: 1,
      path: 'src/a.ts',
      side: 'new',
      lineStart: 2,
      lineEnd: 3,
      quote: 'alpha  \r\nbeta\t',
      contextBefore: [],
      contextAfter: [],
      hunkHeader: '',
      contentHash: hash('alpha  \r\nbeta\t'),
      state: 'active',
    };
    const next = reanchor(
      previous,
      snapshot([file('src/a.ts', { newLines: ['x', 'alpha', 'beta', 'y'] })]),
      { round: 2, id: 'anc_r2' },
    );

    expect(next.state).toBe('active');
    expect(next.lineStart).toBe(2);
    expect(next.lineEnd).toBe(3);
    expect(next.quote).toBe('alpha  \r\nbeta\t');
  });

  it('does not chain previous history', () => {
    const previous = captureAnchor(snapshot([file('src/a.ts', { newLines: six })]), {
      path: 'src/a.ts',
      side: 'new',
      lineStart: 3,
      round: 2,
      id: 'anc_r2',
    });
    previous.previous = { round: 1, path: 'src/a.ts', lineStart: 3, lineEnd: 3 };

    const next = reanchor(previous, snapshot([file('src/a.ts', { newLines: six })]), {
      round: 3,
      id: 'anc_r3',
    });

    expect(next.previous).toEqual({ round: 2, path: 'src/a.ts', lineStart: 3, lineEnd: 3 });
    expect(next.previous?.round).not.toBe(1);
  });
});

describe('reanchor suggestion fallback', () => {
  it('anchors an applied suggestion when the previous quote disappeared', () => {
    const previous = captureAnchor(
      snapshot([file('src/a.ts', { newLines: ['header', 'const x = 1;', 'footer'] })]),
      { path: 'src/a.ts', side: 'new', lineStart: 2, round: 1, id: 'anc_old' },
    );

    const next = reanchor(
      previous,
      snapshot([
        file('src/a.ts', { newLines: ['header', '// inserted', 'const x = 2;', 'footer'] }),
      ]),
      {
        round: 2,
        id: 'anc_new',
        fallbackQuote: 'const x = 2;',
      },
    );

    expect(next).toMatchObject({
      round: 2,
      path: 'src/a.ts',
      lineStart: 3,
      lineEnd: 3,
      quote: 'const x = 2;',
      state: 'active',
      previous: { round: 1, path: 'src/a.ts', lineStart: 2, lineEnd: 2 },
    });
    expect(next.contentHash).toBe(hash('const x = 2;'));
  });

  it('stays outdated when neither the quote nor the fallback exists', () => {
    const previous = captureAnchor(
      snapshot([file('src/a.ts', { newLines: ['header', 'const x = 1;', 'footer'] })]),
      { path: 'src/a.ts', side: 'new', lineStart: 2, round: 1, id: 'anc_old' },
    );

    const next = reanchor(
      previous,
      snapshot([file('src/a.ts', { newLines: ['header', 'const x = 3;', 'footer'] })]),
      { round: 2, id: 'anc_new', fallbackQuote: 'const x = 2;' },
    );

    expect(next.state).toBe('outdated');
    expect(next.quote).toBe('const x = 1;');
  });
});
