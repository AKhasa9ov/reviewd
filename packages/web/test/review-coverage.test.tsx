// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewCoverage } from '@dsh-code-review/core';
import type { ApiClient, ReviewView } from '@dsh-code-review/ui';
import { App } from '../src/App.js';
import { reviewView, snapshotR1, snapshotR2 } from './reviewFixtures.js';

function go(path: string): void {
  window.history.replaceState({}, '', path);
}

const partialCoverage: ReviewCoverage = {
  files: [
    { path: 'src/auth.ts', status: 'light-reviewed' },
    { path: 'src/skipped.ts', status: 'skipped', reason: 'render-budget' },
    { path: 'logo.png', status: 'manifest-only', reason: 'binary' },
  ],
  totals: {
    files: 3,
    byStatus: {
      pending: 0,
      'deep-reviewed': 0,
      'light-reviewed': 1,
      'manifest-only': 1,
      skipped: 1,
      'no-hunks': 0,
      deferred: 0,
      failed: 0,
    },
  },
};

const partialView: ReviewView = {
  ...reviewView,
  review: {
    ...reviewView.review,
    agent: { status: 'partial', round: 2, findings: [], coverage: partialCoverage },
  },
};

const queuedView: ReviewView = {
  ...reviewView,
  review: {
    ...reviewView.review,
    agent: { status: 'queued', round: 2, findings: [], coverage: partialCoverage },
  },
};

const unresolvedCoverage: ReviewCoverage = {
  files: [
    { path: 'src/reviewed.ts', status: 'light-reviewed' },
    { path: 'src/pending.ts', status: 'pending' },
    { path: 'src/deferred.ts', status: 'deferred', reason: 'shard-budget' },
    { path: 'src/failed.ts', status: 'failed', reason: 'agent-error' },
    { path: 'src/renamed.ts', status: 'no-hunks' },
    { path: 'src/skipped.ts', status: 'skipped', reason: 'render-budget' },
    { path: 'logo.png', status: 'manifest-only', reason: 'binary' },
  ],
  totals: {
    files: 7,
    byStatus: {
      pending: 1,
      'deep-reviewed': 0,
      'light-reviewed': 1,
      'manifest-only': 1,
      skipped: 1,
      'no-hunks': 1,
      deferred: 1,
      failed: 1,
    },
  },
  incomplete: true,
};

const unresolvedView: ReviewView = {
  ...reviewView,
  review: {
    ...reviewView.review,
    agent: { status: 'partial', round: 2, findings: [], coverage: unresolvedCoverage },
  },
};

function fakeClient(view: ReviewView = partialView): ApiClient {
  return {
    listReviews: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })),
    getReview: vi.fn(async () => view),
    getSnapshot: vi.fn(async (_id: string, round: number) =>
      round === 2 ? snapshotR2 : snapshotR1,
    ),
    latestFeedback: vi.fn(async () => null),
    addComment: vi.fn(),
    reply: vi.fn(),
    setCommentState: vi.fn(),
    updateReview: vi.fn(),
    deleteReview: vi.fn(async () => undefined),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
    decideFinding: vi.fn(),
    submit: vi.fn(),
    refresh: vi.fn(),
    events: vi.fn(async () => ({ events: [], latestSeq: 0 })),
    health: vi.fn(),
    authenticate: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    cancelAgent: vi.fn(async () => undefined),
    listBranches: vi.fn(async () => ({ repoRoot: '/srv/repo', branches: [] })),
  } as unknown as ApiClient;
}

beforeEach(() => {
  go('/review/rev_01?tab=conversation');
});

describe('review coverage', () => {
  it('shows a warning badge and reviewed, skipped and manifest-only counts', async () => {
    render(<App client={fakeClient()} />);

    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    const badge = screen.getByText('partial');
    expect(badge).toHaveAttribute('data-tone', 'warning');
    expect(
      screen.getByText('Reviewed 1/3 files · 1 skipped · 1 manifest-only'),
    ).toBeInTheDocument();
    expect(screen.getByText(/did not inspect every changed file/i)).toBeInTheDocument();
  });

  it('surfaces unresolved and incomplete coverage counts', async () => {
    render(<App client={fakeClient(unresolvedView)} />);

    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    expect(
      screen.getByText(
        'Reviewed 1/7 files · 1 pending · 1 deferred · 1 failed · 1 no-hunks · 1 skipped · 1 manifest-only · manifest incomplete',
      ),
    ).toBeInTheDocument();
  });

  it('offers cancellation and blocks refresh while a worker is queued', async () => {
    render(<App client={fakeClient(queuedView)} />);

    await screen.findByRole('heading', { name: 'Billing retry semantics' });
    expect(screen.getByRole('button', { name: 'Cancel reviewer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });
});
