import { describe, expect, it } from 'vitest';
import type { ManifestFile, ReviewManifest } from '../../src/types.js';
import { buildModuleMap, classifyFile, isUserFacingDoc } from '../../src/review/plan.js';

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
