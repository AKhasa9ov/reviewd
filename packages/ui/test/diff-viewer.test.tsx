// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Anchor, Comment, FileDiff, ReviewQuestion, Snapshot } from '@sir_yami/reviewd-core';
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

function comment(overrides: Partial<Comment> = {}): Comment {
  const anchor: Anchor = {
    id: 'a1',
    round: 1,
    path: 'src/a.ts',
    side: 'new',
    lineStart: 1,
    lineEnd: 1,
    quote: 'const value = 1;',
    contextBefore: [],
    contextAfter: [],
    hunkHeader: '@@ -0,0 +1 @@',
    contentHash: 'hash',
    state: 'active',
  };
  return {
    id: 'c1',
    reviewId: 'rev_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    author: { name: 'Reviewer', kind: 'human' },
    body: 'Existing answer',
    state: 'open',
    replies: [],
    anchors: [anchor],
    outcomes: [],
    ...overrides,
  };
}

describe('DiffViewer merge conflicts', () => {
  it('surfaces unresolved conflicts in a banner and on the file', () => {
    const base = snapshot();
    const file = { ...loadedFile(), conflicted: true };
    const conflicted: Snapshot = {
      ...base,
      files: [file],
      manifest: {
        ...base.manifest!,
        files: [{ ...base.manifest!.files[0]!, conflicted: true }],
        warnings: ['merge-conflict:src/a.ts'],
      },
      warnings: ['merge-conflict:src/a.ts'],
    };
    render(
      <DiffViewer
        snapshot={conflicted}
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
      />,
    );

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Merge conflicts');
    expect(banner).toHaveTextContent('src/a.ts');
    expect(screen.getAllByText('conflict').length).toBeGreaterThan(0);
  });
});

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
    const user = userEvent.setup();
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
        onAnswerQuestion={async () => undefined}
        onLoadDiff={onLoadDiff}
      />,
    );

    await screen.findByText('const value = 1;');
    const line = screen.getByRole('row', { name: /line 1, added:/ });
    const card = screen.getByLabelText('question: Why is this value 1?');

    const toggle = within(card).getByRole('button', { name: 'Expand question' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(card).not.toHaveTextContent('Why is this value 1?');
    expect(card).not.toHaveTextContent('The initial value controls the retry budget.');
    expect(within(card).getByRole('button', { name: 'Answer question' })).toBeInTheDocument();
    await user.click(toggle);
    expect(card).toHaveTextContent('Why is this value 1?');
    expect(card).toHaveTextContent('The initial value controls the retry budget.');
    expect(within(card).getByRole('button', { name: 'Collapse question' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(line.nextElementSibling).toContainElement(card);
  });

  it('answers a question inside its inline thread', async () => {
    const user = userEvent.setup();
    const onLoadDiff = vi.fn(async () => loadedFile());
    const onAnswerQuestion = vi.fn(async () => undefined);
    render(
      <DiffViewer
        snapshot={snapshot()}
        comments={[comment()]}
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
        onAnswerQuestion={onAnswerQuestion}
        onLoadDiff={onLoadDiff}
      />,
    );

    await screen.findByText('const value = 1;');
    const card = screen.getByLabelText('question: Why is this value 1?');
    await user.click(within(card).getByRole('button', { name: 'Expand question' }));

    expect(within(card).getByText('Existing answer')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Answer' }));
    await user.type(within(card).getByLabelText('Your answer'), 'Because it is the default');
    await user.click(within(card).getByRole('button', { name: 'Send answer' }));

    expect(onAnswerQuestion).toHaveBeenCalledWith(question(), 'Because it is the default');
  });
});
