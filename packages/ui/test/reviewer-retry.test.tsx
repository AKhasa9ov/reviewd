// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewState, ReviewView, Snapshot } from '@sir_yami/reviewd-core';
import type { ApiClient } from '../src/api/client.js';
import { ToastProvider } from '../src/primitives/Toast.js';
import { ReviewDetail } from '../src/review/ReviewDetail.js';

function failedView(
  status: 'failed' | 'partial' = 'failed',
  backend: 'worker' | 'command' = 'worker',
): ReviewView {
  const review = {
    id: 'rev_1',
    title: 'Retry reviewer',
    repoRoot: '/repo',
    status: 'open',
    createdAt: '2026-10-29T10:00:00.000Z',
    reviewer: { backend },
    rounds: [
      {
        no: 1,
        snapshotId: 'snap_1',
        createdAt: '2026-10-29T10:00:00.000Z',
        baseSha: 'a'.repeat(40),
        headSha: 'b'.repeat(40),
        path: '/repo',
      },
    ],
    comments: [],
    version: 1,
    agent: {
      status,
      round: 1,
      error: 'reviewer crashed',
      coverage: {
        files: [{ path: 'src/a.ts', status: 'failed', reason: 'shard-failed', shardId: 's2' }],
        totals: {
          files: 1,
          byStatus: {
            pending: 0,
            'deep-reviewed': 0,
            'light-reviewed': 0,
            'manifest-only': 0,
            skipped: 0,
            'no-hunks': 0,
            deferred: 0,
            failed: 1,
          },
        },
      },
    },
  } as unknown as ReviewState;
  const snapshot = {
    schemaVersion: 2,
    scope: {
      kind: 'range',
      repoRoot: '/repo',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      headRef: 'HEAD',
    },
    files: [],
    totals: { files: 0, added: 0, deleted: 0, truncated: false },
    warnings: [],
  } as unknown as Snapshot;
  return { review, latestSnapshot: snapshot, report: null };
}

function fakeClient(view: ReviewView): {
  client: ApiClient;
  retryAgent: ReturnType<typeof vi.fn>;
} {
  const retryAgent = vi.fn(async () => view);
  const client = {
    getReview: vi.fn(async () => view),
    latestFeedback: vi.fn(async () => null),
    getSnapshot: vi.fn(async () => ({ snapshot: view.latestSnapshot, round: 1 })),
    retryAgent,
  } as unknown as ApiClient;
  return { client, retryAgent };
}

describe('reviewer retry', () => {
  it('retries a failed reviewer in place without creating a round', async () => {
    const view = failedView('failed');
    const { client, retryAgent } = fakeClient(view);
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <ReviewDetail client={client} id="rev_1" location="/review/rev_1?tab=report" />
      </ToastProvider>,
    );

    expect(await screen.findByText('Reviewer failed')).toBeInTheDocument();
    expect(screen.queryByText(/In-place retry is not exposed/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry reviewer' }));

    expect(retryAgent).toHaveBeenCalledWith('rev_1');
  });

  it('offers the same retry action for a partial reviewer', async () => {
    const { client } = fakeClient(failedView('partial'));

    render(
      <ToastProvider>
        <ReviewDetail client={client} id="rev_1" location="/review/rev_1?tab=report" />
      </ToastProvider>,
    );

    expect(await screen.findByText(/Coverage is incomplete/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry reviewer' })).toBeInTheDocument();
  });

  it('does not offer in-place retry for a command reviewer', async () => {
    const { client } = fakeClient(failedView('failed', 'command'));

    render(
      <ToastProvider>
        <ReviewDetail client={client} id="rev_1" location="/review/rev_1?tab=report" />
      </ToastProvider>,
    );

    expect(await screen.findByText('Reviewer failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry reviewer' })).not.toBeInTheDocument();
  });
});
