import { describe, expect, it } from 'vitest';
import {
  COVERAGE_STATUSES,
  coverageFromPrompt,
  initialCoverage,
  isCoverageComplete,
  promotePendingToLight,
  summarizeCoverage,
} from '../../src/index.js';
import type {
  CoverageStatus,
  FileCoverage,
  ManifestFile,
  ReviewCoverage,
  ReviewManifest,
} from '../../src/index.js';

const manifest: ReviewManifest = {
  schemaVersion: 1,
  scope: {
    kind: 'range',
    repoRoot: '/tmp/repo',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    label: 'aaaaaaa..bbbbbbb',
    worktreeDigest: 'b'.repeat(40),
  },
  files: [
    {
      path: 'src/a.ts',
      status: 'modified',
      binary: false,
      ignored: false,
      oversized: false,
      added: 2,
      deleted: 1,
      hunkCount: 1,
      patchBytes: 40,
    },
    {
      path: 'docs/b.md',
      status: 'added',
      binary: false,
      ignored: false,
      oversized: false,
      added: 4,
      deleted: 0,
      hunkCount: 1,
      patchBytes: 20,
    },
    {
      path: 'img/logo.png',
      status: 'modified',
      binary: true,
      ignored: false,
      oversized: false,
      added: 0,
      deleted: 0,
      hunkCount: 0,
      patchBytes: 0,
      reason: 'binary',
    },
  ],
  totals: { files: 3, added: 6, deleted: 1, patchBytes: 60 },
  warnings: [],
};

describe('review coverage', () => {
  it('starts every manifest file as pending', () => {
    const coverage = initialCoverage(manifest);

    expect(coverage.files).toEqual([
      { path: 'src/a.ts', status: 'pending' },
      { path: 'docs/b.md', status: 'pending' },
      { path: 'img/logo.png', status: 'pending' },
    ]);
    expect(coverage.totals.files).toBe(3);
    expect(coverage.totals.byStatus).toEqual({
      pending: 3,
      'deep-reviewed': 0,
      'light-reviewed': 0,
      'manifest-only': 0,
      skipped: 0,
      deferred: 0,
      failed: 0,
    });
  });

  it('counts every coverage status in totals', () => {
    expect(COVERAGE_STATUSES).toEqual([
      'pending',
      'deep-reviewed',
      'light-reviewed',
      'manifest-only',
      'skipped',
      'deferred',
      'failed',
    ]);

    const files: FileCoverage[] = COVERAGE_STATUSES.map((status, index) => ({
      path: `src/file-${index}.ts`,
      status,
      ...(status === 'pending' ? {} : { reason: `${status} reason`, shardId: `shard-${index}` }),
    }));

    const totals = summarizeCoverage(files);

    expect(totals.files).toBe(COVERAGE_STATUSES.length);
    for (const status of COVERAGE_STATUSES) {
      expect(totals.byStatus[status]).toBe(1);
    }
  });

  it('does not mutate the provided file coverage', () => {
    const files: FileCoverage[] = [{ path: 'src/a.ts', status: 'failed', reason: 'boom' }];

    const totals = summarizeCoverage(files);

    expect(totals.byStatus.failed).toBe(1);
    expect(files).toEqual([{ path: 'src/a.ts', status: 'failed', reason: 'boom' }]);
  });

  it('ignores unknown persisted statuses instead of producing NaN', () => {
    const files: FileCoverage[] = [
      { path: 'src/a.ts', status: 'deep-reviewed' },
      { path: 'src/legacy.ts', status: 'mystery' as unknown as FileCoverage['status'] },
    ];

    const totals = summarizeCoverage(files);

    expect(totals.files).toBe(2);
    expect(totals.byStatus['deep-reviewed']).toBe(1);
    expect(totals.byStatus).not.toHaveProperty('mystery');
    expect(Object.keys(totals.byStatus)).toEqual([...COVERAGE_STATUSES]);
    expect(Object.values(totals.byStatus).every((count) => Number.isFinite(count))).toBe(true);
    expect(Object.values(totals.byStatus).reduce((sum, count) => sum + count, 0)).toBe(1);
  });
});

function manifestFile(path: string, overrides: Partial<ManifestFile> = {}): ManifestFile {
  return {
    path,
    status: 'modified',
    binary: false,
    ignored: false,
    oversized: false,
    added: 1,
    deleted: 0,
    hunkCount: 1,
    patchBytes: 20,
    ...overrides,
  };
}

const bridgeManifest: ReviewManifest = {
  schemaVersion: 1,
  scope: {
    kind: 'range',
    repoRoot: '/tmp/repo',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    label: 'aaaaaaa..bbbbbbb',
    worktreeDigest: 'b'.repeat(40),
  },
  files: [
    manifestFile('src/a.ts'),
    manifestFile('src/partial.ts', { reason: 'diff-truncated' }),
    manifestFile('src/omitted.ts'),
    manifestFile('src/capped.ts', { oversized: true, hunkCount: 0, reason: 'per-file-cap' }),
    manifestFile('src/unreadable.ts', { hunkCount: 0, reason: 'unreadable' }),
    manifestFile('src/cut.ts', { hunkCount: 0, reason: 'diff-truncated' }),
    manifestFile('docs/old.md', { hunkCount: 0, reason: 'legacy-truncated' }),
    manifestFile('img/logo.png', {
      binary: true,
      hunkCount: 0,
      patchBytes: 0,
      reason: 'binary',
    }),
    manifestFile('dist/app.js', { ignored: true, hunkCount: 0, reason: 'ignored' }),
    manifestFile('src/generated.ts', { hunkCount: 0, reason: 'generated' }),
    manifestFile('src/empty.ts', { hunkCount: 0 }),
  ],
  totals: { files: 11, added: 3, deleted: 0, patchBytes: 40 },
  warnings: [],
};

function ledger(files: FileCoverage[]): ReviewCoverage {
  return { files, totals: summarizeCoverage(files) };
}

describe('coverageFromPrompt', () => {
  it('maps included paths and manifest reasons to explicit file statuses', () => {
    const includedPaths = ['src/a.ts', 'src/partial.ts', 'img/logo.png', 'src/empty.ts'];

    const coverage = coverageFromPrompt(bridgeManifest, includedPaths);

    expect(coverage.files).toEqual([
      { path: 'src/a.ts', status: 'pending' },
      { path: 'src/partial.ts', status: 'pending' },
      { path: 'src/omitted.ts', status: 'skipped', reason: 'render-budget' },
      { path: 'src/capped.ts', status: 'skipped', reason: 'per-file-cap' },
      { path: 'src/unreadable.ts', status: 'skipped', reason: 'unreadable' },
      { path: 'src/cut.ts', status: 'skipped', reason: 'diff-truncated' },
      { path: 'docs/old.md', status: 'skipped', reason: 'legacy-truncated' },
      { path: 'img/logo.png', status: 'manifest-only', reason: 'binary' },
      { path: 'dist/app.js', status: 'manifest-only', reason: 'ignored' },
      { path: 'src/generated.ts', status: 'manifest-only', reason: 'generated' },
      { path: 'src/empty.ts', status: 'skipped', reason: 'render-budget' },
    ]);
    expect(coverage.totals).toEqual({
      files: 11,
      byStatus: {
        pending: 2,
        'deep-reviewed': 0,
        'light-reviewed': 0,
        'manifest-only': 3,
        skipped: 6,
        deferred: 0,
        failed: 0,
      },
    });
  });

  it('does not mutate the manifest or the included-path list', () => {
    const before = structuredClone(bridgeManifest);
    const includedPaths = ['src/a.ts', 'src/partial.ts'];
    const includedBefore = [...includedPaths];

    coverageFromPrompt(bridgeManifest, includedPaths);

    expect(bridgeManifest).toEqual(before);
    expect(includedPaths).toEqual(includedBefore);
  });

  it('marks the ledger incomplete when the manifest listing was truncated', () => {
    const truncated: ReviewManifest = {
      ...bridgeManifest,
      warnings: ['manifest-listing-truncated'],
    };

    const coverage = coverageFromPrompt(truncated, ['src/a.ts', 'src/partial.ts']);

    expect(coverage.incomplete).toBe(true);
  });
});

describe('isCoverageComplete', () => {
  it('accepts deep, light and policy-excluded files only', () => {
    expect(
      isCoverageComplete(
        ledger([
          { path: 'src/a.ts', status: 'deep-reviewed' },
          { path: 'src/b.ts', status: 'light-reviewed' },
          { path: 'logo.png', status: 'manifest-only', reason: 'binary' },
        ]),
      ),
    ).toBe(true);
    expect(isCoverageComplete(ledger([]))).toBe(true);
  });

  it.each<CoverageStatus>(['pending', 'skipped', 'deferred', 'failed'])(
    'rejects any unresolved %s file',
    (status) => {
      expect(
        isCoverageComplete(
          ledger([
            { path: 'src/a.ts', status: 'light-reviewed' },
            { path: 'src/b.ts', status },
          ]),
        ),
      ).toBe(false);
    },
  );

  it('rejects an unknown persisted status even when the totals claim completion', () => {
    const files: FileCoverage[] = [
      { path: 'src/a.ts', status: 'light-reviewed' },
      { path: 'src/b.ts', status: 'mystery' as unknown as FileCoverage['status'] },
    ];
    const coverage: ReviewCoverage = {
      files,
      totals: {
        files: 2,
        byStatus: {
          pending: 0,
          'deep-reviewed': 0,
          'light-reviewed': 2,
          'manifest-only': 0,
          skipped: 0,
          deferred: 0,
          failed: 0,
        },
      },
    };

    expect(isCoverageComplete(coverage)).toBe(false);
  });

  it('rejects inconsistent persisted totals instead of trusting them', () => {
    const files: FileCoverage[] = [{ path: 'src/a.ts', status: 'light-reviewed' }];
    const coverage = ledger(files);
    coverage.totals.files = 2;

    expect(isCoverageComplete(coverage)).toBe(false);
  });

  it('rejects an incomplete manifest even when all known files are final', () => {
    const coverage = ledger([{ path: 'src/a.ts', status: 'light-reviewed' }]);
    coverage.incomplete = true;

    expect(isCoverageComplete(coverage)).toBe(false);
  });

  it('does not let a non-policy manifest-only file prove completeness', () => {
    expect(
      isCoverageComplete(
        ledger([{ path: 'src/a.ts', status: 'manifest-only', reason: 'render-budget' }]),
      ),
    ).toBe(false);
    expect(isCoverageComplete(ledger([{ path: 'src/a.ts', status: 'manifest-only' }]))).toBe(false);
  });
});

describe('promotePendingToLight', () => {
  it('promotes pending files, recomputes totals and leaves the input untouched', () => {
    const input = ledger([
      { path: 'src/a.ts', status: 'pending', reason: 'diff-truncated', shardId: 'shard-1' },
      { path: 'src/b.ts', status: 'light-reviewed' },
      { path: 'src/skip.ts', status: 'skipped', reason: 'render-budget' },
      { path: 'logo.png', status: 'manifest-only', reason: 'binary' },
    ]);
    const before = structuredClone(input);

    const promoted = promotePendingToLight(input);

    expect(promoted.files).toEqual([
      { path: 'src/a.ts', status: 'light-reviewed', reason: 'diff-truncated', shardId: 'shard-1' },
      { path: 'src/b.ts', status: 'light-reviewed' },
      { path: 'src/skip.ts', status: 'skipped', reason: 'render-budget' },
      { path: 'logo.png', status: 'manifest-only', reason: 'binary' },
    ]);
    expect(promoted.totals.byStatus['light-reviewed']).toBe(2);
    expect(promoted.totals.byStatus.pending).toBe(0);
    expect(promoted.totals.byStatus.skipped).toBe(1);
    expect(promoted.totals.byStatus['manifest-only']).toBe(1);
    expect(input).toEqual(before);
    expect(promoted).not.toBe(input);
    expect(promoted.files).not.toBe(input.files);
  });

  it('preserves the incomplete-manifest marker', () => {
    const input = ledger([{ path: 'src/a.ts', status: 'pending' }]);
    input.incomplete = true;

    const promoted = promotePendingToLight(input);

    expect(promoted.incomplete).toBe(true);
    expect(promoted.files).toEqual([{ path: 'src/a.ts', status: 'light-reviewed' }]);
  });
});
