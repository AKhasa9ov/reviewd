import { describe, expect, it } from 'vitest';
import { COVERAGE_STATUSES, initialCoverage, summarizeCoverage } from '../../src/index.js';
import type { FileCoverage, ReviewManifest } from '../../src/index.js';

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
});
