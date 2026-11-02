// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@sir_yami/reviewd-ui';
import type { ReviewView } from '@sir_yami/reviewd-ui';
import { App } from '../src/App.js';
import { reviewView } from './reviewFixtures.js';

function go(path: string): void {
  window.history.replaceState({}, '', path);
}

function fakeClient(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listReviews: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })),
    getReview: vi.fn(async () => reviewView),
    getSnapshot: vi.fn(async () => null),
    latestFeedback: vi.fn(async () => null),
    addComment: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    reply: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    setCommentState: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    updateReview: vi.fn(async () => reviewView),
    deleteReview: vi.fn(async () => undefined),
    editComment: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    deleteComment: vi.fn(async () => ({ comment: reviewView.review.comments[0] })),
    decideFinding: vi.fn(async (_id: string, findingId: string) => ({
      decision: {
        findingId,
        round: 2,
        state: 'accepted' as const,
        by: { name: 'Ada', kind: 'human' as const },
        at: '2026-10-27T12:00:00.000Z',
      },
    })),
    submit: vi.fn(),
    refresh: vi.fn(),
    events: vi.fn(async () => ({ events: [], latestSeq: 0 })),
    health: vi.fn(),
    authenticate: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    cancelAgent: vi.fn(async () => undefined),
    listBranches: vi.fn(async () => ({
      repoRoot: '/srv/repo',
      branches: ['main', 'feature/billing'],
    })),
    ...overrides,
  } as unknown as ApiClient;
}

function withReviewer(backend: 'none' | 'worker'): ReviewView {
  const view = structuredClone(reviewView);
  view.review.reviewer = { backend };
  return view;
}

beforeEach(() => {
  go('/review/rev_01/edit');
});

describe('edit review page', () => {
  it('prefills the title, reviewer and scope and keeps the repository read-only', async () => {
    render(<App client={fakeClient({ getReview: vi.fn(async () => withReviewer('worker')) })} />);

    expect(await screen.findByRole('heading', { name: 'Edit the request' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Billing retry semantics');
    expect(screen.getByLabelText('Reviewer')).toHaveValue('worker');
    expect(screen.getByLabelText('Repository path')).toHaveValue('/srv/repo');
    expect(screen.getByLabelText('Repository path')).toBeDisabled();
    expect(screen.getByLabelText('Source branch')).toHaveValue('feature/billing');
    expect(screen.getByLabelText('Target branch')).toHaveValue('main');
    expect(screen.getByText(/main → feature\/billing/)).toBeInTheDocument();
    expect(screen.queryByText(/creates round/i)).not.toBeInTheDocument();
  });

  it('saves only the changed title without resending the scope', async () => {
    const user = userEvent.setup();
    const updateReview = vi.fn(async () => reviewView);
    render(<App client={fakeClient({ updateReview })} />);
    await screen.findByRole('heading', { name: 'Edit the request' });

    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, '  Corrected title  ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateReview).toHaveBeenCalledWith('rev_01', { title: 'Corrected title' }),
    );
    await waitFor(() => expect(window.location.pathname).toBe('/review/rev_01'));
  });

  it('saves a reviewer change', async () => {
    const user = userEvent.setup();
    const updateReview = vi.fn(async () => reviewView);
    render(<App client={fakeClient({ updateReview })} />);
    await screen.findByRole('heading', { name: 'Edit the request' });

    await user.selectOptions(screen.getByLabelText('Reviewer'), 'worker');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateReview).toHaveBeenCalledWith('rev_01', {
        reviewer: { backend: 'worker' },
      }),
    );
  });

  it('warns that a scope change creates the next round and sends only the scope', async () => {
    const user = userEvent.setup();
    const updateReview = vi.fn(async () => reviewView);
    render(<App client={fakeClient({ updateReview })} />);
    await screen.findByRole('heading', { name: 'Edit the request' });

    const source = screen.getByLabelText('Source branch');
    await user.clear(source);
    await user.type(source, 'feature/billing-v2');

    expect(screen.getByTestId('scope-warning')).toHaveTextContent(/round 3/i);
    expect(screen.getByText(/re-anchors every comment/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateReview).toHaveBeenCalledWith('rev_01', {
        scope: { kind: 'range', baseRef: 'main', headRef: 'feature/billing-v2' },
      }),
    );
  });

  it('explains that a closed review cannot be edited', async () => {
    const closed = structuredClone(reviewView);
    closed.review.status = 'closed';
    render(<App client={fakeClient({ getReview: vi.fn(async () => closed) })} />);

    expect(await screen.findByText(/Closed reviews cannot be edited/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeDisabled();
    expect(screen.getByLabelText('Reviewer')).toBeDisabled();
  });

  it('shows a retryable error when the update is rejected', async () => {
    const user = userEvent.setup();
    const updateReview = vi.fn(async () => {
      throw new Error('a reviewer is active');
    });
    render(<App client={fakeClient({ updateReview })} />);
    await screen.findByRole('heading', { name: 'Edit the request' });

    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('a reviewer is active');
    expect(window.location.pathname).toBe('/review/rev_01/edit');
  });
});
