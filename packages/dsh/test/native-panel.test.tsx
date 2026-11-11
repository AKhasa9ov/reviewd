// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, ReviewSummary } from '@sir_yami/reviewd-ui';
import { createMemoryRouter } from '../../web/src/router.js';
import { reviewView, snapshotR1, snapshotR2 } from '../../web/test/reviewFixtures.js';
import { ErrorBoundary } from '../src/client/ErrorBoundary.js';
import { NativePanel } from '../src/client/NativePanel.js';
import { SettingsTab } from '../src/client/SettingsTab.js';

function client(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listReviews: vi.fn(async () => ({
      items: [
        {
          id: 'rev_1',
          title: 'Native review',
          repoRoot: '/srv/repo',
          status: 'open',
          createdAt: '2026-11-11T00:00:00Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    })),
    listRepositories: vi.fn(async () => ({ repositories: [] })),
    listBranches: vi.fn(async () => ({ repoRoot: '/srv/repo', branches: ['main'] })),
    ...overrides,
  } as unknown as ApiClient;
}

const reviewSummary: ReviewSummary = {
  id: reviewView.review.id,
  title: reviewView.review.title,
  repoRoot: reviewView.review.repoRoot,
  status: reviewView.review.status,
  createdAt: reviewView.review.createdAt,
  roundCount: reviewView.review.rounds.length,
  commentCount: reviewView.review.comments.length,
  openCommentCount: reviewView.review.comments.filter((item) => item.state === 'open').length,
};

// Loosen override values because the UI tolerates nullable feedback while ApiClient types do not.
function reviewClient(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listReviews: vi.fn(async () => ({
      items: [reviewSummary],
      total: 1,
      limit: 50,
      offset: 0,
    })),
    getReview: vi.fn(async () => reviewView),
    getSnapshot: vi.fn(async (_id: string, round: number) =>
      round === 2 ? snapshotR2 : snapshotR1,
    ),
    latestFeedback: vi.fn(async () => null),
    events: vi.fn(async () => ({ events: [], latestSeq: 0 })),
    ...overrides,
  } as unknown as ApiClient;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stubJsonFetch(payload: unknown): string[] {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return jsonResponse(payload);
    }),
  );
  return requested;
}

describe('NativePanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the compact nav without a Settings tab', async () => {
    render(<NativePanel client={client()} router={createMemoryRouter('/')} />);
    expect(await screen.findByRole('heading', { name: 'Reviews' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Code review sections' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('navigates from the list to New review inside the memory router', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter('/');
    render(<NativePanel client={client()} router={router} />);
    await screen.findByRole('heading', { name: 'Reviews' });

    const nav = screen.getByRole('navigation', { name: 'Code review sections' });
    await user.click(within(nav).getByRole('link', { name: 'New review' }));
    expect(router.location()).toBe('/new');
    expect(await screen.findByRole('heading', { name: 'Set the boundary' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage repositories' })).not.toBeInTheDocument();
  });

  it('opens a review detail from the list inside the native router', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter('/');
    render(<NativePanel client={reviewClient()} router={router} />);
    await user.click(
      await screen.findByRole('link', {
        name: new RegExp(escapeRegExp(reviewView.review.title)),
      }),
    );
    expect(router.location()).toBe('/review/rev_01');
    expect(
      await screen.findByRole('heading', { name: reviewView.review.title }),
    ).toBeInTheDocument();
  });

  it('ignores page-level shortcuts outside the native panel scope', async () => {
    const user = userEvent.setup();
    render(<NativePanel client={reviewClient()} router={createMemoryRouter('/')} />);
    await user.click(
      await screen.findByRole('link', {
        name: new RegExp(escapeRegExp(reviewView.review.title)),
      }),
    );
    const heading = await screen.findByRole('heading', { name: reviewView.review.title });

    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();

    fireEvent.keyDown(heading, { key: '?' });
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('uses the /api/code-review proxy for the default native client', async () => {
    const requested = stubJsonFetch({ items: [], total: 0, limit: 50, offset: 0 });

    render(<NativePanel router={createMemoryRouter('/')} />);
    await waitFor(() => expect(requested).toHaveLength(1));
    expect(requested[0]).toMatch(/^\/api\/code-review\/api\/reviews/);
  });

  it('uses the /api/code-review proxy for the default settings tab client', async () => {
    const requested = stubJsonFetch({ repositories: [] });

    render(<SettingsTab />);
    await waitFor(() => expect(requested).toHaveLength(1));
    expect(requested[0]).toMatch(/^\/api\/code-review\/api\/settings\/repositories/);
  });

  it('renders repository settings in the DSH settings tab surface', async () => {
    render(<SettingsTab client={client()} />);
    expect(await screen.findByRole('heading', { name: 'Repositories' })).toBeInTheDocument();
  });

  it('saves repository settings through the DSH tab', async () => {
    const user = userEvent.setup();
    const saveRepositories = vi.fn(async () => ({ repositories: [] }));
    render(
      <SettingsTab
        client={client({
          listRepositories: vi.fn(async () => ({
            repositories: [{ name: 'demo', path: '/srv/demo', defaultTarget: 'main' }],
          })),
          saveRepositories,
        })}
      />,
    );
    // The Save button stays disabled until the repository list finishes loading.
    await screen.findByDisplayValue('/srv/demo');
    await user.click(screen.getByRole('button', { name: 'Save repositories' }));
    await waitFor(() =>
      expect(saveRepositories).toHaveBeenCalledWith([
        { name: 'demo', path: '/srv/demo', defaultTarget: 'main' },
      ]),
    );
  });

  it('contains a settings render failure instead of blanking the tab', () => {
    function Boom(): JSX.Element {
      throw new Error('settings render failed');
    }
    render(
      <ErrorBoundary title="Could not load repository settings">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load repository settings');
    expect(screen.getByRole('alert')).toHaveTextContent('settings render failed');
  });
});
