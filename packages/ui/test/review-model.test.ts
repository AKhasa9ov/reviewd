import { describe, expect, it } from 'vitest';
import type { Anchor, Comment, FileDiff, ReviewState, Snapshot } from '@sir_yami/reviewd-core';
import {
  anchorForRound,
  anchorHistory,
  buildDiffRows,
  buildReviewLocation,
  deltaPaths,
  deriveSignals,
  filterComments,
  fileLineCount,
  filesForSnapshot,
  filterFindings,
  findingCounts,
  firstChangedLine,
  fixCounts,
  fixStatus,
  latestAnchor,
  latestVerdict,
  parseReviewLocation,
  parseTab,
  roundCommentCount,
  selectedLines,
  validateCommentDraft,
} from '../src/review/model.js';

function anchor(
  round: number,
  lineStart: number,
  lineEnd = lineStart,
  state: Anchor['state'] = 'active',
): Anchor {
  return {
    id: `a${round}`,
    round,
    path: 'src/app.ts',
    side: 'new',
    lineStart,
    lineEnd,
    quote: 'const value = 1;',
    contextBefore: [],
    contextAfter: [],
    hunkHeader: '@@ -1 +1 @@',
    contentHash: 'hash',
    state,
  };
}

function comment(id: string, anchors: Anchor[], overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    reviewId: 'rev_1',
    createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    author: { name: 'alex', kind: 'human' },
    body: 'body',
    state: 'open',
    replies: [],
    anchors,
    outcomes: [],
    ...overrides,
  };
}

function review(comments: Comment[], overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    id: 'rev_1',
    title: 'Review',
    repoRoot: '/repo',
    status: 'open',
    createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    rounds: [
      { no: 1, snapshotId: 's1', createdAt: '', baseSha: 'a', headSha: 'b', path: '/repo' },
      { no: 2, snapshotId: 's2', createdAt: '', baseSha: 'a', headSha: 'c', path: '/repo' },
    ],
    comments,
    version: 1,
    ...overrides,
  };
}

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: 'src/app.ts',
    status: 'modified',
    binary: false,
    oversized: false,
    added: 1,
    deleted: 1,
    contentHash: 'h1',
    hunks: [
      {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        header: '@@ -1,2 +1,2 @@',
        lines: [
          { kind: 'context', oldNo: 1, newNo: 1, text: 'const a = 1;' },
          { kind: 'del', oldNo: 2, newNo: null, text: 'const b = 1;' },
          { kind: 'add', oldNo: null, newNo: 2, text: 'const b = 2;' },
        ],
      },
    ],
    oldLines: ['const a = 1;', 'const b = 1;'],
    newLines: ['const a = 1;', 'const b = 2;'],
    ...overrides,
  };
}

function snapshot(files: FileDiff[]): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/repo',
      baseSha: 'a',
      headSha: 'b',
      label: 'main → feature',
      worktreeDigest: 'd',
    },
    files,
    totals: { files: files.length, added: 1, deleted: 1, truncated: false },
    warnings: [],
  };
}

describe('review model snapshot files', () => {
  it('keeps manifest paths visible when the bounded snapshot omits their diffs', () => {
    const visible = file({ path: 'src/visible.ts' });
    const bounded: Snapshot = { ...snapshot([visible]), schemaVersion: 2 };
    bounded.manifest = {
      schemaVersion: 1,
      scope: bounded.scope,
      files: [
        {
          path: 'src/visible.ts',
          status: 'modified',
          binary: false,
          ignored: false,
          oversized: false,
          added: 1,
          deleted: 1,
          hunkCount: 1,
          patchBytes: 20,
        },
        {
          path: 'src/omitted.ts',
          status: 'added',
          binary: false,
          ignored: false,
          oversized: false,
          added: 113,
          deleted: 0,
          hunkCount: 0,
          patchBytes: 0,
          reason: 'diff-truncated',
        },
      ],
      totals: { files: 2, added: 114, deleted: 1, patchBytes: 20 },
      warnings: ['diff-truncated'],
    };

    const files = filesForSnapshot(bounded);
    expect(files.map((item) => item.path)).toEqual(['src/visible.ts', 'src/omitted.ts']);
    expect(files[0]).toBe(visible);
    expect(files[1]).toMatchObject({
      path: 'src/omitted.ts',
      status: 'added',
      added: 113,
      deleted: 0,
      truncated: true,
      reason: 'diff-truncated',
      hunks: [],
    });
  });
});

describe('review model anchors and status', () => {
  it('tracks anchor history and per-round fallbacks', () => {
    const c = comment('c1', [anchor(1, 3, 4), anchor(2, 8, 8, 'ambiguous')]);
    expect(latestAnchor(c)?.round).toBe(2);
    expect(anchorForRound(c, 1)?.lineStart).toBe(3);
    expect(anchorForRound(c, 3)?.round).toBe(2);
    expect(anchorHistory(c)).toMatchObject({
      lineChanged: true,
      pathChanged: false,
      label: 'line 3 → 8',
    });
  });

  it('uses human decisions before claims and verification', () => {
    const resolved = comment('c1', [anchor(2, 1)], { state: 'resolved' });
    const dismissed = comment('c2', [anchor(2, 1)], { state: 'dismissed' });
    const outdated = comment('c3', [anchor(2, 1, 1, 'outdated')]);
    const claimed = comment('c4', [anchor(2, 1)]);
    const disputed = comment('c5', [anchor(2, 1)]);
    const r = review([resolved, dismissed, outdated, claimed, disputed], {
      fixClaims: [
        {
          commentId: 'c4',
          status: 'fixed',
          by: { name: 'agent', kind: 'agent' },
          at: '2026-01-01',
        },
        {
          commentId: 'c5',
          status: 'fixed',
          by: { name: 'agent', kind: 'agent' },
          at: '2026-01-01',
        },
      ],
      report: {
        schemaVersion: 1,
        reviewId: 'rev_1',
        round: 2,
        backend: 'fake',
        summary: '',
        riskLevel: 'low',
        findings: [],
        questions: [],
        tests: { ran: false, commands: [] },
        verification: [{ commentId: 'c5', status: 'not-fixed', evidence: '' }],
        rejected: [],
        warnings: [],
      },
    });
    expect(fixStatus(r, resolved)).toBe('addressed');
    expect(fixStatus(r, dismissed)).toBe('needs-decision');
    expect(fixStatus(r, outdated)).toBe('outdated');
    expect(fixStatus(r, claimed)).toBe('addressed');
    expect(fixStatus(r, disputed)).toBe('needs-decision');
    expect(fixCounts(r)).toEqual({
      addressed: 2,
      'not-fixed': 0,
      outdated: 1,
      'needs-decision': 2,
    });
    expect(filterComments(r, 'addressed').map((item) => item.id)).toEqual(['c1', 'c4']);
  });

  it('counts transferred AI comments as open threads that need a decision', () => {
    const human = comment('c1', [anchor(1, 1)]);
    const ai = comment('c2', [anchor(1, 2)], {
      author: { name: 'AI', kind: 'agent' },
      sourceFindingId: 'f1',
    });
    const r = review([human, ai]);

    expect(fixCounts(r)).toEqual({
      addressed: 0,
      'not-fixed': 0,
      outdated: 0,
      'needs-decision': 2,
    });
    expect(filterComments(r, 'needs-decision').map((item) => item.id)).toEqual(['c1', 'c2']);
    expect(filterComments(r, 'all').map((item) => item.id)).toEqual(['c1', 'c2']);
  });

  it('counts comments per round and unresolved threads', () => {
    const c = comment('c1', [anchor(1, 1), anchor(2, 1)]);
    const r = review([c, comment('c2', [anchor(1, 1)], { state: 'resolved' })]);
    expect(roundCommentCount(r, 1)).toBe(2);
    expect(roundCommentCount(r, 2)).toBe(1);
    expect(filterComments(r, 'all')).toHaveLength(2);
  });

  it('hides deleted comments from counts and keeps reply tombstones in the full list', () => {
    const deleted = comment('c1', [anchor(1, 1)], {
      deletedAt: '2026-10-27T12:00:00.000Z',
      replies: [
        {
          id: 'r1',
          author: { name: 'Bob', kind: 'human' },
          body: 'Reply',
          createdAt: '2026-10-27T12:00:00.000Z',
        },
      ],
    });
    const deletedWithoutReplies = comment('c2', [anchor(1, 2)], {
      deletedAt: '2026-10-27T12:00:00.000Z',
    });
    const active = comment('c3', [anchor(1, 3)]);
    const r = review([deleted, deletedWithoutReplies, active]);

    expect(fixCounts(r)).toEqual({
      addressed: 0,
      'not-fixed': 0,
      outdated: 0,
      'needs-decision': 1,
    });
    expect(roundCommentCount(r, 1)).toBe(1);
    expect(filterComments(r, 'all').map((item) => item.id)).toEqual(['c1', 'c3']);
  });
});

describe('diff model', () => {
  it('builds rows, first change and side line counts', () => {
    const f = file();
    const rows = buildDiffRows(f);
    expect(rows.map((row) => row.type)).toEqual(['hunk', 'line', 'line', 'line']);
    expect(firstChangedLine(f)).toEqual({ line: 2, side: 'old' });
    expect(fileLineCount(f, 'new')).toBe(2);
    expect(fileLineCount(f, 'old')).toBe(2);
    expect(selectedLines(f, 'new', 2, 2)).toEqual(['const b = 2;']);
  });

  it('falls back to diff numbers when full content is absent', () => {
    const f = file({ oldLines: undefined, newLines: undefined });
    expect(fileLineCount(f, 'new')).toBe(2);
    expect(selectedLines(f, 'new', 1, 2)).toEqual([]);
  });

  it('marks files whose content, status or counts changed between rounds', () => {
    const changed = file({ path: 'src/changed.ts', contentHash: 'x' });
    const same = file({ path: 'src/same.ts' });
    const added = file({ path: 'src/new.ts' });
    expect([
      ...deltaPaths(
        snapshot([changed, same, added]),
        snapshot([same, { ...changed, contentHash: 'old' }]),
      ),
    ]).toEqual(['src/changed.ts', 'src/new.ts']);
  });
});

describe('location, tabs and drafts', () => {
  it('round-trips deep links without inventing empty fragments', () => {
    expect(parseReviewLocation('/review/rev_1?round=2#file=src%2Fa.ts&line=4')).toEqual({
      round: 2,
      file: 'src/a.ts',
      line: 4,
    });
    expect(parseReviewLocation('/review/rev_1')).toEqual({});
    expect(parseReviewLocation('/review/rev_1?round=0#line=-1')).toEqual({});
    expect(
      buildReviewLocation('rev_1', { round: 2, file: 'src/a.ts', line: 4 }, { tab: 'files' }),
    ).toBe('/review/rev_1?round=2&tab=files#file=src%2Fa.ts&line=4');
    expect(buildReviewLocation('rev_1', {})).toBe('/review/rev_1');
    expect(parseTab('report')).toBe('report');
    expect(parseTab('bogus')).toBe('conversation');
  });

  it('validates comment body, range and suggestion', () => {
    expect(
      validateCommentDraft(
        {
          body: '',
          lineStart: 0,
          lineEnd: 2,
          suggestionEnabled: false,
          original: '',
          replacement: '',
        },
        10,
      ).errors,
    ).toMatchObject({ body: expect.any(String), range: expect.any(String) });
    expect(
      validateCommentDraft(
        {
          body: 'ok',
          lineStart: 2,
          lineEnd: 3,
          suggestionEnabled: true,
          original: 'a',
          replacement: 'a',
        },
        10,
      ).errors.suggestion,
    ).toBeTruthy();
    expect(
      validateCommentDraft(
        {
          body: 'ok',
          lineStart: 2,
          lineEnd: 3,
          suggestionEnabled: true,
          original: 'a',
          replacement: 'b',
        },
        10,
      ).ok,
    ).toBe(true);
  });
});

describe('signals and findings', () => {
  it('derives deterministic risk signals without duplicates', () => {
    const signals = deriveSignals(
      snapshot([
        file({ path: 'src/app.test.ts' }),
        file({ path: 'pnpm-lock.yaml' }),
        file({ path: 'migrations/001.sql' }),
        file({ path: 'binary.png', binary: true }),
      ]),
    );
    expect(signals.map((signal) => signal.id)).toEqual([
      'tests:src/app.test.ts',
      'lockfile:pnpm-lock.yaml',
      'migration:migrations/001.sql',
      'binary:binary.png',
    ]);
    expect(signals.filter((signal) => signal.tone === 'danger')).toHaveLength(1);
  });

  it('filters findings and counts them', () => {
    const findings = [
      { severity: 'major' as const, category: 'security' as const },
      { severity: 'nit' as const, category: 'docs' as const },
    ];
    const full = findings.map((item, index) => ({
      id: `f${index}`,
      ...item,
      confidence: 'high' as const,
      kind: 'issue' as const,
      file: 'a.ts',
      lineStart: 1,
      lineEnd: 1,
      title: 't',
      rationale: 'r',
      evidence: 'e',
    }));
    expect(filterFindings(full, 'major', 'all')).toHaveLength(1);
    expect(filterFindings(full, 'all', 'docs')).toHaveLength(1);
    expect(findingCounts({ findings: full } as never)).toMatchObject({ major: 1, nit: 1 });
  });
});

describe('latest verdict', () => {
  it('distinguishes an explicit approved close from a plain close', () => {
    const base = {
      id: 'rev_1',
      title: 'T',
      repoRoot: '/repo',
      status: 'open',
      createdAt: '2026-10-28T12:00:00.000Z',
      rounds: [],
      comments: [],
      version: 1,
    } as ReviewState;
    expect(latestVerdict({ ...base, status: 'closed', closeVerdict: 'approved' })).toBe('approved');
    expect(latestVerdict({ ...base, status: 'closed', closeVerdict: 'closed' })).toBe('closed');
  });
});
