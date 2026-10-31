// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@dsh-code-review/core';
import { CommentThread } from '../src/review/CommentThread.js';

const at = '2026-10-27T12:00:00.000Z';

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'cmt_1',
    reviewId: 'rev_1',
    createdAt: at,
    author: { name: 'Ada', kind: 'human' },
    body: 'Original body',
    state: 'open',
    replies: [],
    anchors: [],
    outcomes: [],
    ...overrides,
  };
}

function renderThread(
  value: Comment,
  handlers: {
    onEdit?: (comment: Comment, body: string) => Promise<void>;
    onDelete?: (comment: Comment) => Promise<void>;
  } = {},
) {
  return render(
    <CommentThread
      comment={value}
      onReply={vi.fn()}
      onState={vi.fn()}
      onJump={vi.fn()}
      onEdit={handlers.onEdit ?? vi.fn()}
      onDelete={handlers.onDelete ?? vi.fn()}
    />,
  );
}

describe('CommentThread CRUD', () => {
  it('renders a tombstone with replies but without the deleted body', () => {
    renderThread(
      comment({
        deletedAt: at,
        deletedBy: { name: 'Ada', kind: 'human' },
        replies: [
          {
            id: 'rep_1',
            author: { name: 'Bob', kind: 'human' },
            body: 'Still here',
            createdAt: at,
          },
        ],
      }),
    );

    expect(screen.getByText('Comment deleted')).toBeInTheDocument();
    expect(screen.queryByText('Original body')).not.toBeInTheDocument();
    expect(screen.getByText('Still here')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('edits the body inline and marks the comment as edited', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn(async () => undefined);
    const value = comment({ editedAt: at, editedBy: { name: 'Ada', kind: 'human' } });
    renderThread(value, { onEdit });

    expect(screen.getByText(/edited/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByLabelText('Edit comment');
    await user.clear(input);
    await user.type(input, 'Corrected body');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEdit).toHaveBeenCalledWith(value, 'Corrected body');
    expect(screen.queryByLabelText('Edit comment')).not.toBeInTheDocument();
  });

  it('labels human and AI authors in the header and replies', () => {
    renderThread(
      comment({
        author: { name: 'Reviewer', kind: 'agent' },
        replies: [
          {
            id: 'rep_ai',
            author: { name: 'AI Reviewer', kind: 'agent' },
            body: 'A reply',
            createdAt: at,
          },
        ],
      }),
    );

    expect(screen.getAllByText('AI')).toHaveLength(2);
  });

  it('does not repeat the AI label as both the author name and badge', () => {
    renderThread(
      comment({
        author: { name: 'AI', kind: 'agent' },
        replies: [
          {
            id: 'rep_ai',
            author: { name: 'AI', kind: 'agent' },
            body: 'A reply',
            createdAt: at,
          },
        ],
      }),
    );

    expect(screen.getAllByText('AI')).toHaveLength(2);
  });

  it('does not offer edit or delete for a transferred AI finding', () => {
    renderThread(
      comment({
        author: { name: 'Reviewer', kind: 'agent' },
        sourceFindingId: 'f1',
      }),
    );

    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('labels a human comment', () => {
    renderThread(comment());
    expect(screen.getByText('Human')).toBeInTheDocument();
  });

  it('requires confirmation before deleting a comment', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    const value = comment();
    renderThread(value, { onDelete });

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete this comment?')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(onDelete).toHaveBeenCalledWith(value);
  });
});
