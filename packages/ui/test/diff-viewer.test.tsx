// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FileDiff, ReviewQuestion, Snapshot } from '@dsh-code-review/core';
import { DiffViewer } from '../src/review/DiffViewer.js';

function snapshot(): Snapshot {
  return {
    schemaVersion: 2,
    scope: {
      kind: 'range',
      repoRoot: '/repo',
      baseSha: 'a',
      headSha: 'b',
      label: 'main → feature',
      worktreeDigest: 'd',
    },
    files: [],
    manifest: {
      schemaVersion: 1,
      scope: {
        kind: 'range',
        repoRoot: '/repo',
        baseSha: 'a',
        headSha: 'b',
        label: 'main → feature',
        worktreeDigest: 'd',
      },
      files: [
        {
          path: 'src/a.ts',
          status: 'added',
          binary: false,
          ignored: false,
          oversized: false,
          added: 1,
          deleted: 0,
          hunkCount: 0,
          patchBytes: 0,
          reason: 'diff-truncated',
        },
      ],
      totals: { files: 1, added: 1, deleted: 0, patchBytes: 0 },
      warnings: ['diff-truncated'],
    },
    totals: { files: 1, added: 1, deleted: 0, truncated: true },
    warnings: ['diff-truncated'],
  };
}

function loadedFile(): FileDiff {
  return {
    path: 'src/a.ts',
    status: 'added',
    binary: false,
    oversized: false,
    added: 1,
    deleted: 0,
    contentHash: 'h1',
    hunks: [
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        header: '@@ -0,0 +1 @@',
        lines: [{ kind: 'add', oldNo: null, newNo: 1, text: 'const value = 1;' }],
      },
    ],
    newLines: ['const value = 1;'],
  };
}

function question(overrides: Partial<ReviewQuestion> = {}): ReviewQuestion {
  return {
    id: 'q1',
    file: 'src/a.ts',
    line: 1,
    question: 'Why is this value 1?',
    why: 'The initial value controls the retry budget.',
    ...overrides,
  };
}

describe('DiffViewer lazy diffs', () => {
  it('loads a diff omitted from the bounded round snapshot', async () => {
    const onLoadDiff = vi.fn(async () => loadedFile());
    render(
      <DiffViewer
        snapshot={snapshot()}
        comments={[]}
        round={1}
        delta={false}
        canDelta={false}
        changedPaths={new Set()}
        onDeltaChange={() => undefined}
        onJump={() => undefined}
        onSelectLine={() => undefined}
        onSelectRange={() => undefined}
        onOpenComposer={() => undefined}
        onReply={async () => undefined}
        onCommentState={async () => undefined}
        onCommentJump={() => undefined}
        onCommentFocus={() => undefined}
        onLoadDiff={onLoadDiff}
      />,
    );

    expect(screen.getAllByText('src/a.ts').length).toBeGreaterThan(0);
    await waitFor(() => expect(onLoadDiff).toHaveBeenCalledWith('src/a.ts'));
    expect(await screen.findByText('const value = 1;')).toBeInTheDocument();
  });

  it('renders an agent question under its line on the current diff', async () => {
    const onLoadDiff = vi.fn(async () => loadedFile());
    render(
      <DiffViewer
        snapshot={snapshot()}
        comments={[]}
        round={1}
        delta={false}
        canDelta={false}
        changedPaths={new Set()}
        questions={[question()]}
        onDeltaChange={() => undefined}
        onJump={() => undefined}
        onSelectLine={() => undefined}
        onSelectRange={() => undefined}
        onOpenComposer={() => undefined}
        onReply={async () => undefined}
        onCommentState={async () => undefined}
        onCommentJump={() => undefined}
        onCommentFocus={() => undefined}
        onLoadDiff={onLoadDiff}
      />,
    );

    await screen.findByText('const value = 1;');
    const line = screen.getByRole('row', { name: /line 1, added:/ });
    const card = screen.getByLabelText('question: Why is this value 1?');

    expect(card).toHaveTextContent('The initial value controls the retry budget.');
    expect(line.nextElementSibling).toContainElement(card);
  });
});
