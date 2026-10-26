// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, ReviewSummary } from '@dsh-code-review/ui';
import { App } from '../src/App.js';

const review: ReviewSummary = {
  id: 'rev_01',
  title: 'Billing retry semantics',
  status: 'open',
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  roundCount: 2,
  commentCount: 3,
  openCommentCount: 2,
  scope: '9f3a1c2d → 4b8e7a10',
  author: 'alex',
  notFixedCount: 2,
};

function fakeClient(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listReviews: vi.fn(async () => ({ items: [review], total: 1, limit: 50, offset: 0 })),
    getReview: vi.fn(),
    getSnapshot: vi.fn(),
    addComment: vi.fn(),
    reply: vi.fn(),
    setCommentState: vi.fn(),
    submit: vi.fn(),
    refresh: vi.fn(),
    events: vi.fn(),
    health: vi.fn(async () => ({
      status: 'ok',
      store: { writable: true },
      git: { ok: true },
      version: '0.1.0',
    })),
    authenticate: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as ApiClient;
}

function go(path: string): void {
  window.history.replaceState({}, '', path);
}

beforeEach(() => {
  go('/');
});

describe('review list', () => {
  it('renders loading skeleton, then review rows with scope, author, age and not-fixed count', async () => {
    let resolvePage: ((value: unknown) => void) | undefined;
    const client = fakeClient({
      listReviews: vi.fn(
        () =>
          new Promise((resolve) => {
            resolvePage = resolve;
          }),
      ),
    });
    render(<App client={client} />);
    expect(screen.getByTestId('review-list-loading')).toBeInTheDocument();
    resolvePage?.({ items: [review], total: 1, limit: 50, offset: 0 });
    const row = await screen.findByRole('link', { name: /Billing retry semantics/ });
    expect(within(row).getByText('9f3a1c2d → 4b8e7a10')).toBeInTheDocument();
    expect(within(row).getByText('alex')).toBeInTheDocument();
    expect(within(row).getByText('2 not fixed')).toBeInTheDocument();
    expect(within(row).getByText('open')).toBeInTheDocument();
    expect(within(row).getByText('2h ago')).toBeInTheDocument();
  });

  it('filters by search query and shows a clear empty state', async () => {
    const user = userEvent.setup();
    const second = { ...review, id: 'rev_02', title: 'Auth callback state' };
    const client = fakeClient({
      listReviews: vi.fn(async () => ({
        items: [review, second],
        total: 2,
        limit: 50,
        offset: 0,
      })),
    });
    render(<App client={client} />);
    expect(await screen.findByText('Billing retry semantics')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search reviews'), 'auth');
    expect(screen.queryByText('Billing retry semantics')).not.toBeInTheDocument();
    expect(screen.getByText('Auth callback state')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search reviews'));
    await user.type(screen.getByLabelText('Search reviews'), 'nothing');
    expect(screen.getByText('No matching reviews')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Billing retry semantics')).toBeInTheDocument();
  });

  it('shows the empty state with a create CTA', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      listReviews: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })),
    });
    render(<App client={client} />);
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create the first review' }));
    expect(screen.getByRole('heading', { name: 'Set the boundary' })).toBeInTheDocument();
  });

  it('shows an error with retry and recovers', async () => {
    const user = userEvent.setup();
    const listReviews = vi
      .fn()
      .mockRejectedValueOnce(new Error('daemon offline'))
      .mockResolvedValueOnce({ items: [review], total: 1, limit: 50, offset: 0 });
    const client = fakeClient({ listReviews });
    render(<App client={client} />);
    expect(await screen.findByText('The review daemon is unreachable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Billing retry semantics')).toBeInTheDocument();
  });

  it('navigates to a deep-linked review placeholder', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await user.click(await screen.findByRole('link', { name: /Billing retry semantics/ }));
    expect(screen.getByRole('heading', { name: 'Review detail' })).toBeInTheDocument();
    expect(screen.getByText('rev_01')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'All reviews' }));
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeInTheDocument();
  });
});

describe('new review form', () => {
  it('validates required fields and posts a range scope', async () => {
    const user = userEvent.setup();
    const createReview = vi.fn(async (input: unknown) => ({
      input,
      review: { review: { id: 'rev_09' } },
      url: 'http://localhost/review/rev_09',
      warnings: [],
    }));
    const client = fakeClient({ createReview });
    render(<App client={client} />);
    await user.click(screen.getByRole('button', { name: 'New review' }));
    expect(screen.getByRole('heading', { name: 'Set the boundary' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create review' }));
    expect(screen.getByText('Enter the repository path on the daemon.')).toBeInTheDocument();
    expect(createReview).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Repository path'), '/srv/repo');
    await user.type(screen.getByLabelText('Title'), 'Billing retry semantics');
    await user.type(screen.getByLabelText('Head ref'), 'feature/billing');
    await user.click(screen.getByRole('button', { name: 'Create review' }));
    await waitFor(() => expect(createReview).toHaveBeenCalledOnce());
    expect(createReview.mock.calls[0]?.[0]).toMatchObject({
      repoRoot: '/srv/repo',
      title: 'Billing retry semantics',
      scope: { kind: 'range', baseRef: 'main', headRef: 'feature/billing' },
      reviewer: { backend: 'none' },
    });
    expect(screen.getByRole('heading', { name: 'Review detail' })).toBeInTheDocument();
  });

  it('switches the scope fields and posts a commit scope', async () => {
    const user = userEvent.setup();
    const createReview = vi.fn(async (input: unknown) => ({
      input,
      review: { review: { id: 'rev_10' } },
      url: '',
      warnings: [],
    }));
    render(<App client={fakeClient({ createReview })} />);
    await user.click(screen.getByRole('button', { name: 'New review' }));
    await user.type(screen.getByLabelText('Repository path'), '/srv/repo');
    await user.type(screen.getByLabelText('Title'), 'Single fix');
    await user.selectOptions(screen.getByLabelText('Diff scope'), 'commit');
    await user.type(screen.getByLabelText('Commit SHA'), '4f3a2c1');
    await user.click(screen.getByRole('button', { name: 'Create review' }));
    await waitFor(() => expect(createReview).toHaveBeenCalledOnce());
    expect(createReview.mock.calls[0]?.[0]).toMatchObject({
      scope: { kind: 'commit', sha: '4f3a2c1' },
    });
  });
});

describe('auth, health and shell', () => {
  it('signs in and navigates to the next path without storing the token', async () => {
    go('/auth?next=/new');
    const user = userEvent.setup();
    const authenticate = vi.fn(async () => undefined);
    render(<App client={fakeClient({ authenticate })} />);
    await user.type(screen.getByLabelText('Access token'), 'secret-token');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(authenticate).toHaveBeenCalledWith('secret-token'));
    expect(screen.getByRole('heading', { name: 'Set the boundary' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/new');
    expect(window.localStorage.getItem('secret-token')).toBeNull();
    expect(window.localStorage.getItem('cr-token')).toBeNull();
  });

  it('renders daemon health and raw JSON', async () => {
    go('/health');
    render(<App client={fakeClient()} />);
    expect(await screen.findByRole('heading', { name: 'Daemon health' })).toBeInTheDocument();
    expect(screen.getByText(/store writable/)).toBeInTheDocument();
    expect(screen.getByLabelText('Raw health response')).toHaveTextContent('"status": "ok"');
  });

  it('toggles theme and persists the preference', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getAllByRole('button', { name: 'Switch to light theme' })[0]!);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('cr-theme')).toBe('light');
    expect(screen.getAllByRole('button', { name: 'Switch to dark theme' }).length).toBeGreaterThan(
      0,
    );
  });

  it('opens and closes the mobile navigation drawer', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(document.querySelector('.cr-shell')).toHaveAttribute('data-drawer', 'open');
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(document.querySelector('.cr-shell')).toHaveAttribute('data-drawer', 'closed');
  });
});
