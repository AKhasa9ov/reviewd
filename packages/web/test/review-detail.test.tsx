// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@dsh-code-review/ui';
import { ApiError } from '@dsh-code-review/ui';
import { App } from '../src/App.js';
import {
  comment,
  latestFeedback,
  makeAnchor,
  reviewView,
  snapshotR1,
  snapshotR2,
} from './reviewFixtures.js';

function go(path: string): void {
  window.history.replaceState({}, '', path);
}

function fakeClient(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listReviews: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })),
    getReview: vi.fn(async () => reviewView),
    getSnapshot: vi.fn(async (_id: string, round: number) =>
      round === 2 ? snapshotR2 : snapshotR1,
    ),
    latestFeedback: vi.fn(async () => null),
    addComment: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    reply: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    setCommentState: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    updateReview: vi.fn(async () => reviewView),
    deleteReview: vi.fn(async () => undefined),
    editComment: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    deleteComment: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    decideFinding: vi.fn(async (_id: string, findingId: string, input: { state: string }) => ({
      decision: {
        findingId,
        round: 2,
        state: input.state,
        by: { name: 'Ada', kind: 'human' },
        at: '2026-10-27T12:00:00.000Z',
      },
    })),
    decideFindings: vi.fn(async () => ({ decisions: [], skipped: 0 })),
    submit: vi.fn(),
    refresh: vi.fn(),
    events: vi.fn(async () => ({ events: [], latestSeq: 0 })),
    health: vi.fn(),
    authenticate: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    cancelAgent: vi.fn(async () => undefined),
    listBranches: vi.fn(async () => ({ repoRoot: '/srv/repo', branches: [] })),
    ...overrides,
  } as unknown as ApiClient;
}

beforeEach(() => {
  go('/review/rev_01');
});

describe('review detail', () => {
  it('renders a deep-linked file, line, inline thread and fix signals', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient()} />);

    expect(
      await screen.findByRole('heading', { name: 'Billing retry semantics' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Files changed/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      await screen.findByRole('row', { name: /line 11, added: const retry = attempt < 3;/ }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('This should use the configured max attempts.').length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: /Conversation/ }));
    expect(screen.getByRole('button', { name: '2 Addressed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 Outdated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0 Needs decision' })).toBeInTheDocument();
  });

  it('navigates to the edit page and deletes the review after confirmation', async () => {
    const user = userEvent.setup();
    go('/review/rev_01');
    const deleteReview = vi.fn(async () => undefined);
    render(<App client={fakeClient({ deleteReview })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(window.location.pathname).toBe('/review/rev_01/edit');

    go('/review/rev_01');
    render(<App client={fakeClient({ deleteReview })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this review?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete review' }));

    expect(deleteReview).toHaveBeenCalledWith('rev_01');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('edits and deletes a comment from the conversation', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?tab=conversation');
    const editComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    const deleteComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ editComment, deleteComment })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    const thread = await screen.findByTestId('comment-c1');
    await user.click(within(thread).getByRole('button', { name: 'Edit' }));
    const input = within(thread).getByLabelText('Edit comment');
    await user.clear(input);
    await user.type(input, 'Corrected comment');
    await user.click(within(thread).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(editComment).toHaveBeenCalledWith('rev_01', 'c1', 'Corrected comment'),
    );

    await user.click(within(thread).getByRole('button', { name: 'Delete' }));
    await user.click(within(thread).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(deleteComment).toHaveBeenCalledWith('rev_01', 'c1'));
  });

  it('switches rounds and keeps the selected file deep link', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    const getSnapshot = vi.fn(async (_id: string, round: number) =>
      round === 2 ? snapshotR2 : snapshotR1,
    );
    render(<App client={fakeClient({ getSnapshot })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(screen.getByRole('button', { name: /Round 1, 3 comments/ }));
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledWith('rev_01', 1));
    expect(window.location.search).toContain('round=1');
    expect(window.location.hash).toContain('file=src%2Fauth.ts');
    expect(screen.getByRole('button', { name: /Round 1, 3 comments/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByLabelText(/reviewer risk/)).not.toBeInTheDocument();
  });

  it('opens on the diff and wraps long lines by default', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    expect(screen.getByRole('tab', { name: /Files changed/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const wrap = await screen.findByRole('button', { name: 'Wrap lines' });
    expect(wrap).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.cr-diff-files')).toHaveClass('cr-diff-wrap');
    await user.click(wrap);
    expect(wrap).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('.cr-diff-files')).not.toHaveClass('cr-diff-wrap');
  });

  it('explains why Delta is gated in round 1 and offers the next round', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=1&tab=files');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    expect(await screen.findByRole('button', { name: 'Delta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Full diff to base' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/Delta compares this round with the previous one/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create the next round' }));
    expect(screen.getByRole('dialog', { name: 'Re-review this branch' })).toBeInTheDocument();
  });

  it('opens the full file with changed lines and switches to the base version', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await screen.findByRole('row', { name: /line 11, added:/ });

    await user.click(screen.getByRole('button', { name: 'View full file for src/auth.ts' }));
    const dialog = await screen.findByRole('dialog', { name: 'src/auth.ts' });
    expect(
      within(dialog).getByRole('row', { name: /Line 11, added: const retry = attempt < 3;/ }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Current' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Base' }));
    expect(
      within(dialog).getByRole('row', { name: /Line 11, removed: const retry = attempt < 2;/ }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('row', { name: /Line 11, added:/ })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog', { name: 'src/auth.ts' })).not.toBeInTheDocument();
  });

  it('opens the report from an agent finding in the full file dialog', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await screen.findByRole('row', { name: /line 11, added:/ });

    await user.click(screen.getByRole('button', { name: 'View full file for src/auth.ts' }));
    const dialog = await screen.findByRole('dialog', { name: 'src/auth.ts' });
    const finding = within(dialog).getByLabelText('major finding: Retry budget is hard-coded');
    await user.click(
      within(finding).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(finding).toHaveTextContent('The retry count cannot be configured per environment.');

    await user.click(within(finding).getByRole('button', { name: 'Open in report' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'src/auth.ts' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: /Report/ })).toHaveAttribute('aria-selected', 'true');
    const reportFinding = document.getElementById('finding-f1');
    await waitFor(() => expect(reportFinding).toHaveFocus());
  });

  it('posts a range comment on base lines outside the diff and keeps the full file open', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    const addComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ addComment })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await screen.findByRole('row', { name: /line 11, added:/ });

    await user.click(screen.getByRole('button', { name: 'View full file for src/auth.ts' }));
    const dialog = await screen.findByRole('dialog', { name: 'src/auth.ts' });
    await user.click(within(dialog).getByRole('button', { name: 'Base' }));

    await user.click(within(dialog).getByRole('row', { name: /Line 2, unchanged:/ }));
    await user.keyboard('{Shift>}');
    await user.click(within(dialog).getByRole('row', { name: /Line 4, unchanged:/ }));
    await user.keyboard('{/Shift}');
    await user.click(within(dialog).getByRole('button', { name: 'Comment on lines 2–4' }));

    const composer = within(dialog).getByRole('form', { name: 'Comment on lines 2–4' });
    await user.type(within(composer).getByLabelText('Comment'), 'The old fallback needs a note.');
    await user.click(within(composer).getByRole('button', { name: 'Post comment' }));

    await waitFor(() =>
      expect(addComment).toHaveBeenCalledWith(
        'rev_01',
        expect.objectContaining({
          body: 'The old fallback needs a note.',
          path: 'src/auth.ts',
          side: 'old',
          lineStart: 2,
          lineEnd: 4,
        }),
      ),
    );
    expect(screen.getByRole('dialog', { name: 'src/auth.ts' })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('form', { name: 'Comment on lines 2–4' }),
    ).not.toBeInTheDocument();
  });

  it('routes c to the open full file dialog and posts a line comment inline', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    const addComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ addComment })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await screen.findByRole('row', { name: /line 11, added:/ });

    await user.click(screen.getByRole('button', { name: 'View full file for src/auth.ts' }));
    const dialog = await screen.findByRole('dialog', { name: 'src/auth.ts' });
    await user.click(within(dialog).getByRole('row', { name: /Line 12, added:/ }));
    await user.keyboard('c');

    const composer = await within(dialog).findByRole('form', { name: 'Comment on line 12' });
    expect(document.querySelector('.cr-inline-composer')).toBeNull();

    await user.type(within(composer).getByLabelText('Comment'), 'Retry twice needs a comment.');
    await user.click(within(composer).getByRole('button', { name: 'Post comment' }));

    await waitFor(() =>
      expect(addComment).toHaveBeenCalledWith(
        'rev_01',
        expect.objectContaining({
          path: 'src/auth.ts',
          side: 'new',
          lineStart: 12,
          lineEnd: 12,
        }),
      ),
    );
    expect(screen.getByRole('dialog', { name: 'src/auth.ts' })).toBeInTheDocument();
  });

  it('shows comments anchored to base lines inside the full file', async () => {
    const user = userEvent.setup();
    const withBaseComment = structuredClone(reviewView);
    withBaseComment.review.comments.push(
      comment(
        'c4',
        'Old fallback line needs context.',
        [
          {
            ...makeAnchor(2, 'src/auth.ts', 3, 3, 'active', '  // old line 3'),
            side: 'old',
          },
        ],
        'open',
      ),
    );
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient({ getReview: vi.fn(async () => withBaseComment) })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await screen.findByRole('row', { name: /line 11, added:/ });

    await user.click(screen.getByRole('button', { name: 'View full file for src/auth.ts' }));
    const dialog = await screen.findByRole('dialog', { name: 'src/auth.ts' });
    await user.click(within(dialog).getByRole('button', { name: 'Base' }));

    expect(within(dialog).getByText('Old fallback line needs context.')).toBeInTheDocument();
  });

  it('jumps to a diff line without opening the full file', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=conversation');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    const thread = (
      await screen.findByText('This should use the configured max attempts.')
    ).closest('.cr-thread');
    await user.click(within(thread as HTMLElement).getByRole('button', { name: /jump to line/ }));

    const row = await screen.findByRole('row', { name: /line 11, added:/ });
    await waitFor(() => expect(row).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.hash).toContain('line=11');
  });

  it('opens the full file at an anchor that is outside the diff', async () => {
    const user = userEvent.setup();
    const withBaseComment = structuredClone(reviewView);
    withBaseComment.review.comments.push(
      comment(
        'c5',
        'Old fallback line needs context.',
        [
          {
            ...makeAnchor(2, 'src/auth.ts', 3, 3, 'active', '  // old line 3'),
            side: 'old',
          },
        ],
        'open',
      ),
    );
    go('/review/rev_01?round=2&tab=conversation');
    render(<App client={fakeClient({ getReview: vi.fn(async () => withBaseComment) })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    const jump = await screen.findByRole('button', {
      name: /src\/auth\.ts line 3 \(jump to line\)/,
    });
    await user.click(jump);

    const dialog = await screen.findByRole('dialog', { name: 'src/auth.ts' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Base' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(within(dialog).getByRole('row', { name: /Line 3, unchanged:/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('updates the active file in the tree while the diff scrolls', async () => {
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await screen.findByRole('button', { name: 'Wrap lines' });

    const rect = (top: number): DOMRect =>
      ({
        top,
        bottom: top + 300,
        left: 0,
        right: 800,
        width: 800,
        height: 300,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const file = this.dataset.file;
      if (file === 'src/auth.ts') return rect(-400);
      if (file === 'docs/retries.md') return rect(80);
      return rect(500);
    });

    fireEvent.scroll(window);
    await waitFor(() =>
      expect(document.querySelector('.cr-tree-file[aria-current="true"]')).toHaveTextContent(
        'retries.md',
      ),
    );
    expect(window.location.hash).toBe('#file=src%2Fauth.ts&line=11');
  });

  it('posts a range comment from the diff composer', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    const addComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ addComment })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(await screen.findByRole('row', { name: /line 11, added:/ }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('row', { name: /line 13, context:/ }));
    await user.keyboard('{/Shift}');
    await user.keyboard('c');

    const composer = await screen.findByRole('form', { name: 'Comment on lines 11–13' });
    expect(within(composer).getByLabelText('Start line')).toHaveValue(11);
    expect(within(composer).getByLabelText('End line')).toHaveValue(13);
    await user.type(within(composer).getByLabelText('Comment'), 'Please cover the retry budget.');
    await user.click(within(composer).getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(addComment).toHaveBeenCalledOnce());
    expect(addComment).toHaveBeenCalledWith(
      'rev_01',
      expect.objectContaining({
        body: 'Please cover the retry budget.',
        path: 'src/auth.ts',
        side: 'new',
        lineStart: 11,
        lineEnd: 13,
      }),
    );
    expect(await screen.findByText('Comment posted')).toBeInTheDocument();
  });

  it('answers a reviewer question from the report', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=report');
    const addComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ addComment })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(screen.getByRole('tab', { name: /Questions/ }));
    const question = await screen.findByText('Is fetchCharge idempotent?');
    const item = question.closest('li');
    expect(item).not.toBeNull();
    await user.click(within(item!).getByRole('button', { name: 'Answer' }));
    await user.type(within(item!).getByLabelText('Your answer'), 'Yes, it is keyed by charge id.');
    await user.click(within(item!).getByRole('button', { name: 'Send answer' }));

    await waitFor(() =>
      expect(addComment).toHaveBeenCalledWith(
        'rev_01',
        expect.objectContaining({
          body: 'Yes, it is keyed by charge id.',
          path: 'src/auth.ts',
          side: 'new',
          lineStart: 13,
          lineEnd: 13,
        }),
      ),
    );
    expect(await screen.findByText('Comment posted')).toBeInTheDocument();
  });

  it('moves an accepted finding into comments and hides the report card', async () => {
    const user = userEvent.setup();
    const withTransferred = structuredClone(reviewView);
    withTransferred.review.comments.push(
      comment(
        'c_ai',
        'Retry budget is hard-coded. AI transferred this accepted finding.',
        [makeAnchor(2, 'src/auth.ts', 11, 12)],
        'open',
        {
          author: { name: 'Reviewer', kind: 'agent' },
          sourceFindingId: 'f1',
        },
      ),
    );
    go('/review/rev_01?round=2&tab=report');
    render(<App client={fakeClient({ getReview: vi.fn(async () => withTransferred) })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(screen.getByRole('tab', { name: /Issues/ }));
    expect(screen.queryByText('Retry budget is hard-coded')).not.toBeInTheDocument();
    expect(screen.getByText('1 accepted')).toBeInTheDocument();
    expect(screen.getByText('moved to comments')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open Conversation' }));
    expect(
      await screen.findByText('Retry budget is hard-coded. AI transferred this accepted finding.'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('comment-c_ai')).getByText('AI')).toBeInTheDocument();
  });

  it('shows and posts a finding comment from the report', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=report');
    const addComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ addComment })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(screen.getByRole('tab', { name: /Issues/ }));
    const item = document.getElementById('finding-f1');
    expect(item).not.toBeNull();
    await user.click(
      within(item!).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(
      within(item!).getByText('This should use the configured max attempts.'),
    ).toBeInTheDocument();
    await user.click(within(item!).getByRole('button', { name: 'Comment' }));
    await user.type(within(item!).getByLabelText('Your comment'), 'Please add a regression test.');
    await user.click(within(item!).getByRole('button', { name: 'Post comment' }));

    await waitFor(() =>
      expect(addComment).toHaveBeenCalledWith(
        'rev_01',
        expect.objectContaining({
          body: 'Please add a regression test.',
          path: 'src/auth.ts',
          side: 'new',
          lineStart: 11,
          lineEnd: 12,
        }),
      ),
    );
  });

  it('keeps keyboard focus on a clicked diff line', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    const row = await screen.findByRole('row', { name: /line 11, added:/ });

    await user.click(row);
    expect(row).toHaveFocus();
  });

  it('shows reviewer risks in the file tree and on their exact diff lines', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    const treeRisk = await screen.findByLabelText('1 reviewer risk, highest major');
    expect(treeRisk).toBeInTheDocument();
    expect(treeRisk).toHaveClass('cr-tree-risk', 'cr-risk-major');

    const pins = screen.getAllByRole('button', {
      name: 'Open major finding Retry budget is hard-coded',
    });
    expect(pins).toHaveLength(2);
    expect(screen.getByRole('row', { name: /line 11, added:/ })).toContainElement(pins[0]!);
    expect(screen.getByRole('row', { name: /line 12, added:/ })).toContainElement(pins[1]!);

    expect(screen.getAllByLabelText('major finding: Retry budget is hard-coded')).toHaveLength(1);
    const inline = screen.getByLabelText('major finding: Retry budget is hard-coded');
    await user.click(
      within(inline).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(inline).toHaveTextContent('The retry count cannot be configured per environment.');
    expect(inline).toHaveTextContent('Suggested change');
    await user.click(pins[0]!);
    expect(screen.getByRole('tab', { name: /Report/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Retry budget is hard-coded')).toBeInTheDocument();
    expect(window.location.search).toContain('tab=report');
    const finding = document.getElementById('finding-f1');
    await waitFor(() => expect(finding).toHaveFocus());
  });

  it('accepts an inline finding with an optional note for the agent', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    const decideFinding = vi.fn(
      async (_id: string, findingId: string, input: { state: string; note?: string }) => ({
        decision: {
          findingId,
          round: 2,
          state: input.state,
          ...(input.note === undefined ? {} : { note: input.note }),
          by: { name: 'Ada', kind: 'human' },
          at: '2026-10-27T12:00:00.000Z',
        },
      }),
    );
    render(<App client={fakeClient({ decideFinding })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    const inline = await screen.findByLabelText('major finding: Retry budget is hard-coded');
    await user.click(
      within(inline).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    await user.click(within(inline).getByRole('button', { name: 'Accept' }));

    const form = await within(inline).findByRole('form', { name: 'Accept finding' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.type(
      within(form).getByLabelText('Note for the agent (optional)'),
      'Please fix this before merge.',
    );
    await user.click(within(form).getByRole('button', { name: 'Accept finding' }));

    await waitFor(() =>
      expect(decideFinding).toHaveBeenCalledWith('rev_01', 'f1', {
        state: 'accepted',
        note: 'Please fix this before merge.',
      }),
    );
    await waitFor(() =>
      expect(
        within(inline).queryByRole('form', { name: 'Accept finding' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Finding accepted')).toBeInTheDocument();
  });

  it('shows persisted finding decisions with their notes', async () => {
    const user = userEvent.setup();
    const decided = structuredClone(reviewView);
    decided.review.findingDecisions = [
      {
        findingId: 'f1',
        round: 2,
        state: 'accepted',
        note: 'Will fix in this branch.',
        by: { name: 'Ada', kind: 'human' },
        at: '2026-10-27T12:00:00.000Z',
      },
    ];
    go('/review/rev_01?round=2&tab=report');
    render(<App client={fakeClient({ getReview: vi.fn(async () => decided) })} />);

    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    const finding = await screen.findByText('Retry budget is hard-coded');
    const card = finding.closest('.cr-finding') as HTMLElement;
    await user.click(
      within(card).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(within(card).getByText('Accepted')).toBeInTheDocument();
    expect(within(card).getByText('Will fix in this branch.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Accept' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(card).getByRole('button', { name: 'Dismiss' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('submits selected findings through the selected bulk action', async () => {
    const user = userEvent.setup();
    const decideFindings = vi.fn(async (_id: string, state: string, findingIds: string[]) => ({
      decisions: findingIds.map((findingId) => ({
        findingId,
        round: 2,
        state,
        by: { name: 'Ada', kind: 'human' },
        at: '2026-10-27T12:00:00.000Z',
      })),
      skipped: 0,
    }));
    go('/review/rev_01?round=2&tab=report');
    render(<App client={fakeClient({ decideFindings })} />);

    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await user.click(screen.getByRole('tab', { name: /Issues/ }));
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Select finding Retry budget is hard-coded',
      }),
    );
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept selected (1)' }));
    await user.click(screen.getByRole('button', { name: 'Accept 1 finding' }));

    await waitFor(() => expect(decideFindings).toHaveBeenCalledWith('rev_01', 'accepted', ['f1']));
    expect(await screen.findByText('Accepted 1 finding')).toBeInTheDocument();
  });

  it('hides finding decisions on a closed review', async () => {
    const user = userEvent.setup();
    const closed = structuredClone(reviewView);
    closed.review.status = 'closed';
    go('/review/rev_01?round=2&tab=report');
    render(<App client={fakeClient({ getReview: vi.fn(async () => closed) })} />);

    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    expect(await screen.findByText('Retry budget is hard-coded')).toBeInTheDocument();
    const card = document.querySelector('#finding-f1 .cr-finding') as HTMLElement;
    await user.click(
      within(card).getByRole('button', {
        name: 'Expand finding Retry budget is hard-coded',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('posts a suggestion with the selected replacement', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    const addComment = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ addComment })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(await screen.findByRole('row', { name: /line 11, added:/ }));
    await user.keyboard('c');
    const composer = await screen.findByRole('form', { name: 'Comment on line 11' });
    await user.type(within(composer).getByLabelText('Comment'), 'Use the configured budget.');
    await user.click(within(composer).getByLabelText('Add a code suggestion'));
    expect(within(composer).getByLabelText('Original snippet')).toHaveValue(
      '  const retry = attempt < 3;',
    );
    await user.clear(within(composer).getByLabelText('Replacement'));
    await user.type(
      within(composer).getByLabelText('Replacement'),
      '  const retry = attempt < config.maxAttempts;',
    );
    expect(within(composer).getByLabelText('Suggestion preview')).toHaveTextContent(
      'config.maxAttempts',
    );
    await user.click(within(composer).getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(addComment).toHaveBeenCalledOnce());
    expect(addComment).toHaveBeenCalledWith(
      'rev_01',
      expect.objectContaining({
        body: 'Use the configured budget.',
        path: 'src/auth.ts',
        side: 'new',
        lineStart: 11,
        lineEnd: 11,
        suggestion: {
          original: '  const retry = attempt < 3;',
          replacement: '  const retry = attempt < config.maxAttempts;',
        },
      }),
    );
  });

  it('replies to and resolves a thread', async () => {
    const user = userEvent.setup();
    const reply = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    const setCommentState = vi.fn(async () => ({ comment: reviewView.review.comments[0] }));
    render(<App client={fakeClient({ reply, setCommentState })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await user.click(screen.getByRole('tab', { name: /Conversation/ }));

    const thread = await screen.findByTestId('comment-c1');
    await user.click(within(thread).getByRole('button', { name: 'Reply' }));
    await user.type(within(thread).getByLabelText('Reply to alex'), 'Thanks, applied.');
    await user.click(within(thread).getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(reply).toHaveBeenCalledWith('rev_01', 'c1', 'Thanks, applied.'));

    await user.click(within(thread).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(setCommentState).toHaveBeenCalledWith('rev_01', 'c1', 'resolved'));
  });

  it('filters threads by fix status and jumps back to the diff line', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await user.click(screen.getByRole('tab', { name: /Conversation/ }));
    expect(screen.getByText('Outdated', { selector: '.cr-fix-label' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1 Outdated' }));
    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeInTheDocument();
    expect(screen.getAllByText('Clear filter').length).toBeGreaterThan(0);
    expect(
      screen.queryByText('This should use the configured max attempts.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('The docs claim three retries but the code says two.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /docs\/retries.md/ }));
    await waitFor(() => expect(window.location.search).toContain('tab=files'));
    expect(window.location.hash).toContain('line=3');
  });

  it('submits feedback with the selected verdict and shows a pending delivery', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => ({
      submission: {
        reviewId: 'rev_01',
        round: 2,
        verdict: 'request-changes' as const,
        feedback: latestFeedback.feedback,
        deliveryKey: 'delivery-key',
      },
      delivery: {
        id: 'd1',
        deliveryKey: 'delivery-key',
        reviewId: 'rev_01',
        round: 2,
        harness: 'claude-code',
      },
    }));
    render(<App client={fakeClient({ submit })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit review' });
    await user.type(within(dialog).getByLabelText('Summary'), 'Please fix the retry budget.');
    await user.click(within(dialog).getByRole('button', { name: 'Submit feedback' }));

    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit).toHaveBeenCalledWith('rev_01', {
      verdict: 'request-changes',
      summary: 'Please fix the retry budget.',
      includeResolved: false,
    });
    expect(
      await screen.findByText('Feedback submitted for round 2. Delivery is pending.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Submit review' })).not.toBeInTheDocument();
  });

  it('creates a new round after confirmation and reports the re-anchor result', async () => {
    const user = userEvent.setup();
    const refreshed = {
      ...reviewView,
      review: {
        ...reviewView.review,
        rounds: [
          ...reviewView.review.rounds,
          {
            no: 3,
            snapshotId: 'snap_3',
            createdAt: new Date().toISOString(),
            baseSha: '9f3a1c2d4e5f60718293a4b5c6d7e8f901234567',
            headSha: 'ffffffffffffffffffffffffffffffffffffffff',
            path: '/srv/repo',
          },
        ],
      },
    };
    const refresh = vi.fn(async () => refreshed);
    render(<App client={fakeClient({ refresh })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    const dialog = await screen.findByRole('dialog', { name: 'Re-review this branch' });
    await user.click(within(dialog).getByRole('button', { name: 'Create round' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledWith('rev_01'));
    expect(await screen.findByText(/Round 3 created/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Round 3, 0 comments/ })).toBeInTheDocument();
  });

  it('exposes keyboard help, file navigation and comment shortcuts', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    render(<App client={fakeClient()} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.keyboard('?');
    const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(help).getByText('Comment on the selected line')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();

    await user.keyboard('j');
    await waitFor(() => expect(window.location.hash).toContain('file=docs%2Fretries.md'));
    await user.keyboard('j');
    await waitFor(() => expect(window.location.hash).toContain('file=src%2Flegacy.ts'));
    await user.keyboard('k');
    await waitFor(() => expect(window.location.hash).toContain('file=docs%2Fretries.md'));

    await user.keyboard('c');
    expect(await screen.findByRole('form', { name: /Comment on line/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form', { name: /Comment on line/ })).not.toBeInTheDocument();
  });

  it('shows a not-found state for an unknown review', async () => {
    const getReview = vi.fn(async () => {
      throw new ApiError('Review missing', { status: 404, code: 'not-found' });
    });
    render(<App client={fakeClient({ getReview })} />);
    expect(await screen.findByText('Review not found')).toBeInTheDocument();
    expect(screen.getByText('No review exists for rev_01.')).toBeInTheDocument();
  });

  it('shows a recoverable snapshot error', async () => {
    go('/review/rev_01?round=2&tab=files');
    const getSnapshot = vi.fn(async () => {
      throw new Error('snapshot store offline');
    });
    const getReview = vi.fn(async () => reviewView);
    render(<App client={fakeClient({ getSnapshot, getReview })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    expect(await screen.findByText('Could not load this round')).toBeInTheDocument();
    expect(screen.getByText('snapshot store offline')).toBeInTheDocument();
  });
});
