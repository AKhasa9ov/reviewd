// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FileDiff, ReviewView, Snapshot } from '@sir_yami/reviewd-core';
import type { ApiClient } from '../src/api/client.js';
import { ToastProvider } from '../src/primitives/Toast.js';
import { ReviewDetail } from '../src/review/ReviewDetail.js';

const loaded: FileDiff = {
  path: 'src/loaded.ts',
  status: 'modified',
  binary: false,
  oversized: false,
  added: 1,
  deleted: 1,
  contentHash: 'h1',
  hunks: [],
};

const scope = {
  kind: 'range' as const,
  repoRoot: '/repo',
  baseSha: 'a',
  headSha: 'b',
  label: 'main → feature',
  worktreeDigest: 'd',
};

function view(): ReviewView {
  const snapshot: Snapshot = {
    schemaVersion: 2,
    scope,
    files: [loaded],
    manifest: {
      schemaVersion: 1,
      scope,
      files: [
        {
          path: 'src/loaded.ts',
          status: 'modified',
          binary: false,
          ignored: false,
          oversized: false,
          added: 1,
          deleted: 1,
          hunkCount: 0,
          patchBytes: 0,
        },
        {
          path: 'src/omitted.ts',
          status: 'added',
          binary: false,
          ignored: false,
          oversized: false,
          added: 3,
          deleted: 0,
          hunkCount: 0,
          patchBytes: 0,
          reason: 'diff-truncated',
        },
      ],
      totals: { files: 2, added: 4, deleted: 1, patchBytes: 0 },
      warnings: ['diff-truncated'],
    },
    totals: { files: 1, added: 1, deleted: 1, truncated: true },
    warnings: ['diff-truncated'],
  };
  const review = {
    id: 'rev_1',
    title: 'Bounded snapshot',
    repoRoot: '/repo',
    status: 'open',
    createdAt: '2026-10-29T10:00:00.000Z',
    rounds: [
      {
        no: 1,
        snapshotId: 'snap_1',
        createdAt: '2026-10-29T10:00:00.000Z',
        baseSha: 'a',
        headSha: 'b',
        path: '/repo',
      },
    ],
    comments: [],
    version: 1,
  };
  return { review, latestSnapshot: snapshot, report: null } as unknown as ReviewView;
}

describe('review detail file counts', () => {
  it('counts every manifest path in the Files changed tab', async () => {
    const value = view();
    const client = {
      getReview: vi.fn(async () => value),
      latestFeedback: vi.fn(async () => null),
      getSnapshot: vi.fn(async () => ({ snapshot: value.latestSnapshot, round: 1 })),
    } as unknown as ApiClient;

    render(
      <ToastProvider>
        <ReviewDetail client={client} id="rev_1" location="/review/rev_1?tab=files" />
      </ToastProvider>,
    );

    await screen.findByText('omitted.ts', { selector: '.cr-tree-path' });
    const tab = screen.getByRole('tab', { name: /Files changed/ });
    expect(tab).toHaveTextContent('2');
  });
});
