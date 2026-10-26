import type { FileDiff } from '@dsh-code-review/core';
import { describe, expect, it } from 'vitest';
import { buildReviewPrompt, renderBoundedDiff } from '../../src/daemon/prompt.js';

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: 'src/a.ts',
    status: 'modified',
    binary: false,
    oversized: false,
    added: 1,
    deleted: 1,
    hunks: [
      {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        header: 'function main()',
        lines: [
          { kind: 'context', oldNo: 1, newNo: 1, text: 'const a = 1;' },
          { kind: 'del', oldNo: 2, newNo: null, text: 'const b = 2;' },
          { kind: 'add', oldNo: null, newNo: 2, text: 'const b = 3;' },
        ],
      },
    ],
    contentHash: 'hash',
    ...overrides,
  };
}

function bigFile(lines: number): FileDiff {
  return file({
    path: 'src/big.ts',
    added: lines,
    deleted: 0,
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: lines,
        header: '',
        lines: Array.from({ length: lines }, (_, index) => ({
          kind: 'add' as const,
          oldNo: null,
          newNo: index + 1,
          text: `const value${index} = ${'x'.repeat(60)};`,
        })),
      },
    ],
  });
}

describe('renderBoundedDiff', () => {
  it('renders unified diff headers and line prefixes instead of JSON', () => {
    const { text, truncated } = renderBoundedDiff([file()]);
    expect(truncated).toBe(false);
    expect(text).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(text).toContain('--- a/src/a.ts');
    expect(text).toContain('+++ b/src/a.ts');
    expect(text).toContain('@@ -1,2 +1,2 @@ function main()');
    expect(text).toContain(' const a = 1;');
    expect(text).toContain('-const b = 2;');
    expect(text).toContain('+const b = 3;');
    expect(text).not.toContain('"oldLines"');
    expect(text).not.toContain('"kind"');
  });

  it('uses /dev/null for added and deleted files and keeps rename headers', () => {
    const added = renderBoundedDiff([file({ path: 'src/new.ts', status: 'added' })]);
    expect(added.text).toContain('--- /dev/null');
    expect(added.text).toContain('+++ b/src/new.ts');

    const deleted = renderBoundedDiff([file({ path: 'src/old.ts', status: 'deleted' })]);
    expect(deleted.text).toContain('--- a/src/old.ts');
    expect(deleted.text).toContain('+++ /dev/null');

    const renamed = renderBoundedDiff([
      file({ path: 'src/new-name.ts', oldPath: 'src/old-name.ts', status: 'renamed' }),
    ]);
    expect(renamed.text).toContain('diff --git a/src/old-name.ts b/src/new-name.ts');
  });

  it('notes binary, ignored and empty files without emitting content', () => {
    const binary = renderBoundedDiff([file({ path: 'logo.png', binary: true, hunks: [] })]);
    expect(binary.text).toContain('Binary files a/logo.png and b/logo.png differ');
    expect(binary.text).not.toContain('@@');

    const ignored = renderBoundedDiff([file({ path: 'dist/app.js', ignored: true })]);
    expect(ignored.text).not.toContain('@@');
  });

  it('caps the rendered text and appends a truncation marker', () => {
    const { text, truncated } = renderBoundedDiff([bigFile(4000)], 5_000);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(5_100);
    expect(text).toContain('diff --git a/src/big.ts b/src/big.ts');
    expect(text).toContain('[diff truncated');
  });

  it('does not end mid-marker when the limit is zero', () => {
    const { text, truncated } = renderBoundedDiff([file()], 0);
    expect(truncated).toBe(true);
    expect(text).toContain('[diff truncated');
  });
});

describe('buildReviewPrompt', () => {
  it('describes the review, the read-only contract and the strict JSON schema', () => {
    const { prompt } = buildReviewPrompt({
      title: 'Add search',
      reviewId: 'rev_1',
      round: 2,
      kind: 'verify',
      files: [file()],
    });
    expect(prompt).toContain('# Independent code review: Add search');
    expect(prompt).toContain('Review: rev_1');
    expect(prompt).toContain('Round: 2');
    expect(prompt).toContain('Kind: verify');
    expect(prompt).toContain('Read-only review');
    expect(prompt).toContain('schemaVersion 1');
    expect(prompt).toContain('diff --git a/src/a.ts b/src/a.ts');
  });

  it('still produces a complete prompt when there are no file changes', () => {
    const { prompt, truncated } = buildReviewPrompt({
      title: 'Empty',
      reviewId: 'rev_2',
      round: 1,
      kind: 'initial',
      files: [],
    });
    expect(truncated).toBe(false);
    expect(prompt).toContain('no file changes');
    expect(prompt).toContain('schemaVersion 1');
  });

  it('honours a custom limit', () => {
    const { prompt, truncated } = buildReviewPrompt({
      title: 'Big',
      reviewId: 'rev_3',
      round: 1,
      kind: 'initial',
      files: [bigFile(4000)],
      diffLimit: 4_000,
    });
    expect(truncated).toBe(true);
    expect(prompt.length).toBeLessThan(5_000);
    expect(prompt).toContain('[diff truncated');
  });
});
