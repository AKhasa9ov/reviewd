// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Comment, ReviewState } from '@dsh-code-review/core';
import { SubmitDialog } from '../src/review/SubmitDialog.js';

const at = '2026-10-31T12:00:00.000Z';

function comment(id: string, author: Comment['author'], overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    reviewId: 'rev_1',
    createdAt: at,
    author,
    body: `Body ${id}`,
    state: 'open',
    replies: [],
    anchors: [],
    outcomes: [],
    ...overrides,
  };
}

const review: ReviewState = {
  id: 'rev_1',
  title: 'Review',
  repoRoot: '/tmp/repo',
  status: 'open',
  createdAt: at,
  rounds: [],
  comments: [
    comment('c_human', { name: 'Ada', kind: 'human' }),
    comment('c_ai', { name: 'AI', kind: 'agent' }, { sourceFindingId: 'f1' }),
    comment(
      'c_deleted',
      { name: 'AI', kind: 'agent' },
      { sourceFindingId: 'f2', deletedAt: at, deletedBy: { name: 'Ada', kind: 'human' } },
    ),
  ],
  version: 1,
};

describe('SubmitDialog pending comments', () => {
  it('labels human and transferred AI comments', () => {
    render(
      <SubmitDialog
        open
        review={review}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onJumpComment={vi.fn()}
      />,
    );

    expect(screen.getByText('Pending comments')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Human')).toBeInTheDocument();
    expect(screen.getByText('Body c_human')).toBeInTheDocument();
    expect(screen.getByText('Body c_ai')).toBeInTheDocument();
    expect(screen.queryByText('Body c_deleted')).not.toBeInTheDocument();
  });
});
