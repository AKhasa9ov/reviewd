// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@dsh-code-review/ui';
import { ApiError } from '@dsh-code-review/ui';
import { App } from '../src/App.js';
import { latestFeedback, reviewView, snapshotR1, snapshotR2 } from './reviewFixtures.js';

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
    submit: vi.fn(),
    refresh: vi.fn(),
    events: vi.fn(async () => ({ events: [], latestSeq: 0 })),
    health: vi.fn(),
    authenticate: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    cancelAgent: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as ApiClient;
}

beforeEach(() => {
  go('/review/rev_01');
});

describe('review detail', () => {
  it('renders a deep-linked file, line, inline thread and fix signals', async () => {
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
    expect(screen.getByRole('button', { name: 'Addressed: 2 comments' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outdated: 1 comments' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Needs decision: 0 comments' })).toBeInTheDocument();
  });

  it('switches rounds and keeps the selected file deep link', async () => {
    const user = userEvent.setup();
    go('/review/rev_01?round=2&tab=files#file=src%2Fauth.ts&line=11');
    const getSnapshot = vi.fn(async (_id: string, round: number) =>
      round === 2 ? snapshotR2 : snapshotR1,
    );
    render(<App client={fakeClient({ getSnapshot })} />);
    await screen.findByRole('heading', { name: 'Billing retry semantics' });

    await user.click(screen.getByRole('button', { name: 'Round 1, 3 comments' }));
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledWith('rev_01', 1));
    expect(window.location.search).toContain('round=1');
    expect(window.location.hash).toContain('file=src%2Fauth.ts');
    expect(screen.getByRole('button', { name: 'Round 1, 3 comments' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

    await user.click(screen.getByRole('button', { name: 'Outdated: 1 comments' }));
    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeInTheDocument();
    expect(screen.getAllByText('Clear filter').length).toBeGreaterThan(0);
    expect(
      screen.queryByText('This should use the configured max attempts.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('The docs claim three retries but the code says two.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Jump to docs\/retries.md/ }));
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
    expect(await screen.findByRole('button', { name: 'Round 3, 0 comments' })).toBeInTheDocument();
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
