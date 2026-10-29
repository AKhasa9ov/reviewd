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
    const { text, truncated, includedFiles } = renderBoundedDiff([file()]);
    expect(truncated).toBe(false);
    expect(includedFiles).toEqual(['src/a.ts']);
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
    expect(binary.includedFiles).toEqual(['logo.png']);

    const ignored = renderBoundedDiff([file({ path: 'dist/app.js', ignored: true })]);
    expect(ignored.text).not.toContain('@@');
    expect(ignored.includedFiles).toEqual([]);
  });

  it('caps the rendered text and appends a truncation marker', () => {
    const { text, truncated, includedFiles } = renderBoundedDiff(
      [bigFile(4000), file({ path: 'src/after.ts' })],
      5_000,
    );
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(5_100);
    expect(text).toContain('diff --git a/src/big.ts b/src/big.ts');
    expect(text).toContain('[diff truncated');
    expect(text).not.toContain('src/after.ts');
    expect(includedFiles).toEqual(['src/big.ts']);
  });

  it('does not end mid-marker when the limit is zero', () => {
    const { text, truncated } = renderBoundedDiff([file()], 0);
    expect(truncated).toBe(true);
    expect(text).toContain('[diff truncated');
  });
});

describe('buildReviewPrompt', () => {
  it('scopes a shard prompt and tells the worker not to report outside it', () => {
    const result = buildReviewPrompt({
      title: 'Large review',
      reviewId: 'rev_1',
      round: 1,
      kind: 'initial',
      files: [file()],
      shard: {
        id: 'shard_001',
        index: 0,
        count: 3,
        tier: 'deep',
        moduleId: 'src',
      },
    });

    expect(result.prompt).toContain('Shard: 1/3 (deep, module src)');
    expect(result.prompt).toContain('Review only the files in this shard');
    expect(result.includedFiles).toEqual(['src/a.ts']);
  });

  it('describes the review, the read-only contract and the strict JSON schema', () => {
    const { prompt, includedFiles } = buildReviewPrompt({
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
    expect(prompt).toContain('at most 15 tool calls');
    expect(prompt).toContain('review_report');
    expect(prompt).toContain('If the tool is unavailable');
    expect(prompt).toContain('ONLY one fenced');
    expect(prompt).toContain('"schemaVersion": 1');
    expect(prompt).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(includedFiles).toEqual(['src/a.ts']);
  });

  it('gives a verification round the previous report and unresolved comments', () => {
    const { prompt } = buildReviewPrompt({
      title: 'Fix login',
      reviewId: 'rev_1',
      round: 2,
      kind: 'verify',
      files: [file()],
      context: {
        previousRound: 1,
        previousReport: { summary: 'token checked too late', findings: [] },
        unresolved: [
          { path: 'src/a.ts', lineStart: 2, body: 'Check token before write', state: 'open' },
        ],
      },
    });
    expect(prompt).toContain('Verification round');
    expect(prompt).toContain('Previous round: 1');
    expect(prompt).toContain('token checked too late');
    expect(prompt).toContain('src/a.ts:2 [open] Check token before write');
    expect(prompt).toContain('`fixed`, `not-fixed` or `unclear`');
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
    expect(prompt).toContain('"schemaVersion": 1');
  });

  it('honours a custom limit and reports only fully introduced files', () => {
    const { prompt, truncated, includedFiles } = buildReviewPrompt({
      title: 'Big',
      reviewId: 'rev_3',
      round: 1,
      kind: 'initial',
      files: [bigFile(4000), file({ path: 'src/after.ts' })],
      diffLimit: 4_000,
    });
    expect(truncated).toBe(true);
    expect(prompt.length).toBeLessThan(6_000);
    expect(prompt).toContain('[diff truncated');
    expect(prompt).not.toContain('src/after.ts');
    expect(includedFiles).toEqual(['src/big.ts']);
  });
});
