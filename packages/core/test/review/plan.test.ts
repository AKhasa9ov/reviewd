import { describe, expect, it } from 'vitest';
import type { ManifestFile, ReviewManifest } from '../../src/types.js';
import {
  buildModuleMap,
  buildReviewPlan,
  classifyFile,
  coverageFromPlan,
  isUserFacingDoc,
} from '../../src/review/plan.js';

export function file(path: string, overrides: Partial<ManifestFile> = {}): ManifestFile {
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

export function manifest(files: readonly ManifestFile[]): ReviewManifest {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/repo',
      baseRef: 'main',
      headRef: 'feature',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      label: 'main...feature',
      worktreeDigest: 'b'.repeat(40),
    },
    files: [...files],
    totals: {
      files: files.length,
      added: files.reduce((sum, item) => sum + item.added, 0),
      deleted: files.reduce((sum, item) => sum + item.deleted, 0),
      patchBytes: files.reduce((sum, item) => sum + item.patchBytes, 0),
    },
    warnings: [],
  };
}

describe('module map', () => {
  it('groups package workspaces and conventional source roots deterministically', () => {
    const map = buildModuleMap(
      [
        file('packages/core/src/a.ts'),
        file('packages/web/src/b.tsx'),
        file('src/c.ts'),
        file('ui-tests/login.spec.ts'),
        file('README.md'),
      ],
      [{ id: 'pkg-core', root: 'packages/core' }],
    );

    expect(map.moduleFor('packages/core/src/a.ts')).toBe('pkg-core');
    expect(map.moduleFor('packages/web/src/b.tsx')).toBe('packages/web');
    expect(map.moduleFor('src/c.ts')).toBe('src');
    expect(map.moduleFor('ui-tests/login.spec.ts')).toBe('ui-tests');
    expect(map.moduleFor('README.md')).toBe('.');
    expect(map.modules.map((module) => module.id)).toEqual([
      '.',
      'packages/web',
      'pkg-core',
      'src',
      'ui-tests',
    ]);
  });

  it('chooses the longest matching module root', () => {
    const map = buildModuleMap(
      [file('packages/core/src/deep/a.ts')],
      [
        { id: 'packages', root: 'packages' },
        { id: 'packages-core', root: 'packages/core' },
      ],
    );

    expect(map.moduleFor('packages/core/src/deep/a.ts')).toBe('packages-core');
  });
});

describe('classifyFile', () => {
  it.each([
    ['src/a.ts', 'source'],
    ['src/a.test.ts', 'test'],
    ['tests/a.py', 'test'],
    ['ui-tests/login.spec.ts', 'test'],
    ['e2e/checkout.spec.ts', 'test'],
    ['docs/api.md', 'docs'],
    ['README.md', 'docs'],
    ['AGENTS.md', 'instructions'],
    ['.dsh/skills/review/SKILL.md', 'instructions'],
    ['package.json', 'config'],
    ['docker-compose.yml', 'config'],
    ['migrations/001_init.sql', 'migration'],
    ['pnpm-lock.yaml', 'generated'],
    ['dist/app.js', 'generated'],
  ])('classifies %s as %s', (path, kind) => {
    expect(classifyFile(file(path))).toBe(kind);
  });

  it('classifies binary and ignored files from the manifest', () => {
    expect(classifyFile(file('assets/logo.png', { binary: true }))).toBe('binary');
    expect(classifyFile(file('vendor/x.js', { ignored: true }))).toBe('source');
  });

  it('recognizes user-facing documentation', () => {
    expect(isUserFacingDoc('docs/cli.md')).toBe(true);
    expect(isUserFacingDoc('README.md')).toBe(true);
    expect(isUserFacingDoc('packages/core/README.md')).toBe(true);
    expect(isUserFacingDoc('docs/internal/notes.md')).toBe(false);
  });
});

describe('tier policy', () => {
  it('assigns deep source/config/migrations/instructions and deep tests when module source changed', () => {
    const plan = buildReviewPlan({
      manifest: manifest([
        file('src/auth.ts'),
        file('src/auth.test.ts'),
        file('package.json'),
        file('migrations/001.sql'),
        file('AGENTS.md'),
        file('README.md'),
        file('docs/api.md'),
        file('docs/internal/notes.md'),
        file('ui-tests/login.spec.ts'),
        file('e2e/checkout.spec.ts'),
        file('pnpm-lock.yaml'),
        file('dist/app.js', { ignored: true, reason: 'generated' }),
      ]),
    });
    const tiers = Object.fromEntries(plan.files.map((item) => [item.path, item.tier]));
    expect(tiers).toMatchObject({
      'src/auth.ts': 'deep',
      'src/auth.test.ts': 'deep',
      'package.json': 'deep',
      'migrations/001.sql': 'deep',
      'AGENTS.md': 'deep',
      'README.md': 'deep',
      'docs/api.md': 'deep',
      'docs/internal/notes.md': 'light',
      'ui-tests/login.spec.ts': 'light',
      'e2e/checkout.spec.ts': 'light',
      'pnpm-lock.yaml': 'manifest-only',
      'dist/app.js': 'manifest-only',
    });
    expect(plan.coveragePlan).toEqual({
      total: 12,
      byTier: { deep: 7, light: 3, 'manifest-only': 2 },
    });
    expect(plan.riskFlags).toContain('generated-heavy');
  });

  it('marks every deep/light file pending and manifest-only files policy-excluded', () => {
    const plan = buildReviewPlan({
      manifest: manifest([
        file('src/a.ts'),
        file('pnpm-lock.yaml'),
        file('assets/logo.png', { binary: true, added: 0, hunkCount: 0, patchBytes: 0 }),
        file('src/old.ts', {
          status: 'renamed',
          added: 0,
          deleted: 0,
          hunkCount: 0,
          patchBytes: 0,
        }),
      ]),
    });
    const byPath = new Map(plan.coverage.files.map((item) => [item.path, item]));
    expect(byPath.get('src/a.ts')).toMatchObject({ status: 'pending' });
    expect(byPath.get('pnpm-lock.yaml')).toMatchObject({ status: 'manifest-only' });
    expect(byPath.get('assets/logo.png')).toMatchObject({ status: 'manifest-only' });
    expect(byPath.get('src/old.ts')).toMatchObject({ status: 'no-hunks' });
    expect(coverageFromPlan(plan)).toEqual(plan.coverage);
  });

  it('keeps a manifest incomplete when its listing was truncated', () => {
    const source = manifest([file('src/a.ts')]);
    const plan = buildReviewPlan({
      manifest: { ...source, warnings: ['manifest-listing-truncated'] },
    });
    expect(plan.coverage.incomplete).toBe(true);
  });
});

describe('shards', () => {
  it('packs deterministically by module and tier under file and byte limits', () => {
    const files = Array.from({ length: 5 }, (_, index) =>
      file(`src/file-${index}.ts`, { patchBytes: 40 }),
    );
    const plan = buildReviewPlan({
      manifest: manifest(files),
      limits: { maxFiles: 2, maxPatchBytes: 100_000 },
    });
    expect(plan.shards).toHaveLength(3);
    expect(plan.shards.map((shard) => shard.paths)).toEqual([
      ['src/file-0.ts', 'src/file-1.ts'],
      ['src/file-2.ts', 'src/file-3.ts'],
      ['src/file-4.ts'],
    ]);
    expect(plan.shards.every((shard) => shard.tier === 'deep')).toBe(true);
    expect(plan.shards.every((shard) => shard.effort === 'deep')).toBe(true);
    expect(
      plan.files.filter((item) => item.tier === 'deep').every((item) => item.shardId !== undefined),
    ).toBe(true);
  });

  it('does not merge modules and keeps a single oversized file in its own shard', () => {
    const plan = buildReviewPlan({
      manifest: manifest([
        file('src/a.ts', { patchBytes: 500 }),
        file('src/b.ts', { patchBytes: 500 }),
        file('backend/c.ts', { patchBytes: 10 }),
      ]),
      limits: { maxFiles: 10, maxPatchBytes: 100 },
    });
    expect(plan.shards).toHaveLength(3);
    expect(new Set(plan.shards.map((shard) => shard.moduleId))).toEqual(
      new Set(['src', 'backend']),
    );
    expect(plan.shards.find((shard) => shard.paths.includes('src/a.ts'))?.paths).toEqual([
      'src/a.ts',
    ]);
  });

  it('is byte-for-byte deterministic', () => {
    const input = {
      manifest: manifest([
        file('src/b.ts'),
        file('src/a.ts'),
        file('docs/api.md'),
        file('pnpm-lock.yaml'),
      ]),
    };
    expect(JSON.stringify(buildReviewPlan(input))).toBe(JSON.stringify(buildReviewPlan(input)));
  });
});
