// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, ReviewSummary } from '@sir_yami/reviewd-ui';
import { App, ReviewApp } from '../src/App.js';
import { repoName } from '../src/pages/ReviewListPage.js';
import { createMemoryRouter, RouterProvider } from '../src/router.js';
import { latestFeedback, reviewView, snapshotR1, snapshotR2 } from './reviewFixtures.js';

const review: ReviewSummary = {
  id: 'rev_01',
  title: 'Billing retry semantics',
  repoRoot: '/srv/repo',
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
    getReview: vi.fn(async () => reviewView),
    getSnapshot: vi.fn(async (_id: string, round: number) =>
      round === 2 ? snapshotR2 : snapshotR1,
    ),
    latestFeedback: vi.fn(async () => latestFeedback),
    cancelAgent: vi.fn(async () => undefined),
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
      version: '0.2.0',
    })),
    listRepositories: vi.fn(async () => ({ repositories: [] })),
    listDirectories: vi.fn(async () => ({
      path: '/srv',
      parent: '/',
      breadcrumbs: [{ name: '/', path: '/' }],
      entries: [],
      truncated: false,
    })),
    saveRepositories: vi.fn(async (repositories) => ({ repositories })),
    listBranches: vi.fn(async () => ({ repoRoot: '/srv/repo', branches: [] })),
    listCommits: vi.fn(async () => ({
      repoRoot: '/srv/repo',
      baseRef: 'main',
      headRef: 'feature',
      mergeBase: 'a',
      headSha: 'b',
      commits: [],
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

  it('navigates to a deep-linked review detail', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await user.click(await screen.findByRole('link', { name: /Billing retry semantics/ }));
    expect(
      await screen.findByRole('heading', { name: 'Billing retry semantics' }),
    ).toBeInTheDocument();
    expect(screen.getByText('rev_01')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'All reviews' }));
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeInTheDocument();
  });
});

describe('router context', () => {
  it('navigates inside a supplied memory router without changing window.history', async () => {
    const router = createMemoryRouter('/', { hrefBase: '/code-review' });
    const user = userEvent.setup();
    render(
      <RouterProvider router={router}>
        <App client={fakeClient()} />
      </RouterProvider>,
    );

    await user.click(screen.getAllByRole('button', { name: /new review/i })[0]!);
    expect(router.location()).toBe('/new');
    expect(window.location.pathname).not.toBe('/new');
  });
});

describe('native composition root', () => {
  it('renders the native header and route through ReviewApp', async () => {
    const router = createMemoryRouter('/');
    render(
      <ReviewApp client={fakeClient()} router={router} header={<header>Native header</header>} />,
    );

    expect(screen.getByText('Native header')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Reviews' })).toBeInTheDocument();
  });
});

describe('review repository groups', () => {
  const webReview = {
    ...review,
    id: 'rev_web_1',
    title: 'Web shell polish',
    repoRoot: '/srv/apps/web',
  };
  const apiReview = {
    ...review,
    id: 'rev_api_1',
    title: 'Auth callback state',
    repoRoot: '/srv/apps/api',
  };
  const webReviewTwo = {
    ...review,
    id: 'rev_web_2',
    title: 'Web routing table',
    repoRoot: '/srv/apps/web',
  };

  function groupedClient(items: ReviewSummary[]): ApiClient {
    return fakeClient({
      listReviews: vi.fn(async () => ({ items, total: items.length, limit: 50, offset: 0 })),
    });
  }

  it('groups reviews by exact repository with basenames, counts and order', async () => {
    render(<App client={groupedClient([webReview, apiReview, webReviewTwo])} />);

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent('/srv/apps/web');
    expect(headings[1]).toHaveTextContent('/srv/apps/api');
    expect(within(headings[0]!).getByText('web', { exact: true })).toBeInTheDocument();
    expect(within(headings[0]!).getByText('2 reviews')).toBeInTheDocument();
    expect(within(headings[1]!).getByText('api', { exact: true })).toBeInTheDocument();
    expect(within(headings[1]!).getByText('1 review')).toBeInTheDocument();

    const webRows = within(screen.getByRole('region', { name: /\/srv\/apps\/web/ })).getAllByRole(
      'link',
    );
    expect(webRows).toHaveLength(2);
    expect(webRows[0]).toHaveTextContent('Web shell polish');
    expect(webRows[1]).toHaveTextContent('Web routing table');
    expect(
      within(screen.getByRole('region', { name: /\/srv\/apps\/api/ })).getByRole('link', {
        name: /Auth callback state/,
      }),
    ).toBeVisible();
  });

  it('shows one group even when every review shares a repository', async () => {
    render(<App client={fakeClient()} />);

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('/srv/repo');
    expect(within(heading).getByText('repo', { exact: true })).toBeInTheDocument();
    expect(within(heading).getByText('1 review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Billing retry semantics/ })).toBeVisible();
  });

  it('collapses one repository group without hiding the others and restores it', async () => {
    const user = userEvent.setup();
    render(<App client={groupedClient([webReview, apiReview])} />);

    const webToggle = await screen.findByRole('button', { name: /\/srv\/apps\/web/ });
    const rowsId = webToggle.getAttribute('aria-controls');
    expect(rowsId).toBeTruthy();
    expect(webToggle).toHaveAttribute('aria-expanded', 'true');
    const rows = document.getElementById(rowsId!);
    expect(rows).not.toHaveAttribute('hidden');

    await user.click(webToggle);
    expect(webToggle).toHaveAttribute('aria-expanded', 'false');
    expect(rows).toHaveAttribute('hidden');
    expect(screen.queryByRole('link', { name: /Web shell polish/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Auth callback state/ })).toBeVisible();

    await user.click(webToggle);
    expect(webToggle).toHaveAttribute('aria-expanded', 'true');
    expect(rows).not.toHaveAttribute('hidden');
    expect(await screen.findByRole('link', { name: /Web shell polish/ })).toBeVisible();
  });

  it('removes an empty repository group while filtering and restores it when cleared', async () => {
    const user = userEvent.setup();
    render(<App client={groupedClient([webReview, apiReview])} />);

    expect(await screen.findByRole('heading', { name: /\/srv\/apps\/web/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /\/srv\/apps\/api/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search reviews'), 'auth');
    expect(screen.queryByRole('heading', { name: /\/srv\/apps\/web/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /\/srv\/apps\/api/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Auth callback state/ })).toBeVisible();

    await user.clear(screen.getByLabelText('Search reviews'));
    expect(await screen.findByRole('heading', { name: /\/srv\/apps\/web/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /\/srv\/apps\/api/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Web shell polish/ })).toBeVisible();
  });

  it('derives repository labels from unix, windows and root paths', async () => {
    render(
      <App
        client={groupedClient([
          { ...review, id: 'rev_slash', title: 'Trailing slash', repoRoot: '/srv/apps/web/' },
          { ...review, id: 'rev_windows', title: 'Windows checkout', repoRoot: 'C:\\work\\api' },
          { ...review, id: 'rev_root', title: 'Root checkout', repoRoot: '/' },
        ])}
      />,
    );

    const trailing = await screen.findByRole('heading', { name: /\/srv\/apps\/web\// });
    expect(within(trailing).getByText('web', { exact: true })).toBeInTheDocument();
    const windows = screen.getByRole('heading', { name: /C:\\work\\api/ });
    expect(within(windows).getByText('api', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getByRole('link', { name: /Root checkout/ })).toBeVisible();
    expect(repoName('/srv/apps/web/')).toBe('web');
    expect(repoName('C:\\work\\api')).toBe('api');
    expect(repoName('C:\\')).toBe('C:\\');
    expect(repoName('/')).toBe('/');
    expect(repoName('')).toBe('');
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
    await user.type(screen.getByLabelText('Source branch'), 'feature/billing');
    await user.click(screen.getByRole('button', { name: 'Create review' }));
    await waitFor(() => expect(createReview).toHaveBeenCalledOnce());
    expect(createReview.mock.calls[0]?.[0]).toMatchObject({
      repoRoot: '/srv/repo',
      title: 'Billing retry semantics',
      scope: { kind: 'range', baseRef: 'main', headRef: 'feature/billing' },
      reviewer: { backend: 'none' },
    });
    expect(
      await screen.findByRole('heading', { name: 'Billing retry semantics' }),
    ).toBeInTheDocument();
  });

  it('clears only the field error that was edited', async () => {
    const user = userEvent.setup();
    render(<App client={fakeClient()} />);
    await user.click(screen.getByRole('button', { name: 'New review' }));
    await user.click(screen.getByRole('button', { name: 'Create review' }));
    expect(screen.getByText('Enter the repository path on the daemon.')).toBeInTheDocument();
    expect(screen.getByText('Give this review a title.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Repository path'), '/srv/repo');
    expect(screen.queryByText('Enter the repository path on the daemon.')).not.toBeInTheDocument();
    expect(screen.getByText('Give this review a title.')).toBeInTheDocument();
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

describe('repository settings', () => {
  it('loads git branches after a repository path is entered and saves the selection', async () => {
    const user = userEvent.setup();
    const saveRepositories = vi.fn(async (repositories: unknown) => ({ repositories }));
    const listBranches = vi.fn(async (path: string) => ({
      repoRoot: path,
      branches: ['feature', 'main'],
    }));
    go('/settings');
    render(
      <App
        client={fakeClient({
          listRepositories: vi.fn(async () => ({ repositories: [] })),
          listDirectories: vi.fn(async () => ({
            path: '/srv',
            parent: '/',
            breadcrumbs: [{ name: '/', path: '/' }],
            entries: [],
            truncated: false,
          })),
          listBranches,
          saveRepositories,
        })}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Repositories' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add repository' }));
    await user.type(screen.getByLabelText('Repository name'), 'Checkout');
    await user.type(screen.getByLabelText('Path on daemon'), '/srv/checkout');
    await waitFor(() => expect(listBranches.mock.calls[0]?.[0]).toBe('/srv/checkout'));
    const target = screen.getByLabelText('Default target branch');
    await waitFor(() => expect(target).toBeEnabled());
    await user.selectOptions(target, 'main');
    await user.click(screen.getByRole('button', { name: 'Save repositories' }));

    await waitFor(() =>
      expect(saveRepositories).toHaveBeenCalledWith([
        { name: 'Checkout', path: '/srv/checkout', defaultTarget: 'main' },
      ]),
    );
    expect(await screen.findByText('Repository settings saved.')).toBeInTheDocument();
  });

  it('resets the selected branch when the repository path changes', async () => {
    const user = userEvent.setup();
    const checkout = { name: 'Checkout', path: '/srv/checkout', defaultTarget: 'main' };
    go('/settings');
    render(
      <App
        client={fakeClient({
          listRepositories: vi.fn(async () => ({ repositories: [checkout] })),
          listBranches: vi.fn(async (path: string) => ({
            repoRoot: path,
            branches: ['main', 'release'],
          })),
        })}
      />,
    );

    const target = await screen.findByLabelText('Default target branch');
    await waitFor(() => expect(target).toBeEnabled());
    expect(target).toHaveValue('main');

    const path = screen.getByLabelText('Path on daemon');
    await user.clear(path);
    await user.type(path, '/srv/other');

    expect(target).toHaveValue('');
    await waitFor(() => expect(target).toBeEnabled());
    expect(target).toHaveValue('');
  });

  it('shows a disabled loading selector while the first branch list is fetched', async () => {
    const checkout = { name: 'Checkout', path: '/srv/checkout', defaultTarget: 'main' };
    const listBranches = vi.fn(() => new Promise<never>(() => undefined));
    go('/settings');
    render(
      <App
        client={fakeClient({
          listRepositories: vi.fn(async () => ({ repositories: [checkout] })),
          listBranches,
        })}
      />,
    );

    const target = await screen.findByLabelText('Default target branch');
    expect(target).toBeDisabled();
    expect(within(target).getByRole('option', { name: 'Loading branches…' })).toBeInTheDocument();
    await waitFor(() => expect(listBranches).toHaveBeenCalledTimes(1));
    expect(target).toBeDisabled();
    expect(within(target).getByRole('option', { name: 'Loading branches…' })).toBeInTheDocument();
  });

  it('offers a retry when git branches cannot be loaded', async () => {
    const user = userEvent.setup();
    const checkout = { name: 'Checkout', path: '/srv/checkout' };
    let attempts = 0;
    const listBranches = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('git unavailable');
      return { repoRoot: '/srv/checkout', branches: ['main'] };
    });
    go('/settings');
    render(
      <App
        client={fakeClient({
          listRepositories: vi.fn(async () => ({ repositories: [checkout] })),
          listBranches,
        })}
      />,
    );

    expect(await screen.findByText(/git unavailable/)).toBeInTheDocument();
    expect(screen.getByLabelText('Default target branch')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry branches' }));

    await waitFor(() => expect(listBranches).toHaveBeenCalledTimes(2));
    const target = screen.getByLabelText('Default target branch');
    await waitFor(() => expect(target).toBeEnabled());
    expect(within(target).getByRole('option', { name: 'main' })).toBeInTheDocument();
  });

  it('keeps a saved target that is absent from the branch list', async () => {
    const checkout = { name: 'Checkout', path: '/srv/checkout', defaultTarget: 'release-1' };
    go('/settings');
    render(
      <App
        client={fakeClient({
          listRepositories: vi.fn(async () => ({ repositories: [checkout] })),
          listBranches: vi.fn(async () => ({ repoRoot: '/srv/checkout', branches: ['main'] })),
        })}
      />,
    );

    const target = await screen.findByLabelText('Default target branch');
    await waitFor(() => expect(target).toBeEnabled());
    expect(target).toHaveValue('release-1');
    expect(within(target).getByRole('option', { name: 'release-1 (saved)' })).toBeInTheDocument();
  });

  it('does not let an empty save overwrite settings while loading', async () => {
    go('/settings');
    const listRepositories = vi.fn(() => new Promise(() => undefined));
    render(<App client={fakeClient({ listRepositories })} />);
    await screen.findByRole('heading', { name: /^Repositories$/ });
    expect(screen.getByRole('button', { name: 'Save repositories' })).toBeDisabled();
  });

  it('locks repository fields while a save is in flight', async () => {
    const user = userEvent.setup();
    const checkout = { name: 'Checkout', path: '/srv/checkout', defaultTarget: 'main' };
    const saveRepositories = vi.fn(() => new Promise(() => undefined));
    go('/settings');
    render(
      <App
        client={fakeClient({
          listRepositories: vi.fn(async () => ({ repositories: [checkout] })),
          saveRepositories,
        })}
      />,
    );
    await screen.findByDisplayValue('Checkout');
    await user.click(screen.getByRole('button', { name: 'Save repositories' }));

    expect(screen.getByLabelText('Path on daemon')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add repository' })).toBeDisabled();
  });

  it('picks a repository folder from the daemon browser', async () => {
    const user = userEvent.setup();
    const listDirectories = vi.fn(async (path?: string) =>
      path === '/srv/checkout'
        ? {
            path: '/srv/checkout',
            parent: '/srv',
            breadcrumbs: [
              { name: '/', path: '/' },
              { name: 'srv', path: '/srv' },
              { name: 'checkout', path: '/srv/checkout' },
            ],
            entries: [],
            truncated: false,
          }
        : {
            path: '/srv',
            parent: '/',
            breadcrumbs: [
              { name: '/', path: '/' },
              { name: 'srv', path: '/srv' },
            ],
            entries: [{ name: 'checkout', path: '/srv/checkout', isGit: true }],
            truncated: false,
          },
    );
    go('/settings');
    render(<App client={fakeClient({ listDirectories })} />);
    await screen.findByRole('heading', { name: /^Repositories$/ });
    await user.click(screen.getByRole('button', { name: 'Add repository' }));
    await user.click(screen.getByRole('button', { name: 'Browse folders for repository 1' }));

    const dialog = await screen.findByRole('dialog', { name: 'Choose a repository folder' });
    await user.click(within(dialog).getByRole('button', { name: /checkout/ }));
    await screen.findByText('This folder has no subfolders. You can still choose it.');
    await user.click(within(dialog).getByRole('button', { name: 'Use this folder' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Path on daemon')).toHaveValue('/srv/checkout');
    expect(screen.getByLabelText('Repository name')).toHaveValue('checkout');
  });

  it('rejects an incomplete repository before saving', async () => {
    const user = userEvent.setup();
    const saveRepositories = vi.fn();
    go('/settings');
    render(
      <App
        client={fakeClient({
          listRepositories: vi.fn(async () => ({ repositories: [] })),
          listDirectories: vi.fn(async () => ({
            path: '/srv',
            parent: '/',
            breadcrumbs: [{ name: '/', path: '/' }],
            entries: [],
            truncated: false,
          })),
          saveRepositories,
        })}
      />,
    );
    await screen.findByRole('heading', { name: 'Repositories' });
    await user.click(screen.getByRole('button', { name: 'Add repository' }));
    await user.click(screen.getByRole('button', { name: 'Save repositories' }));
    expect(screen.getByText('Repository name is required.')).toBeInTheDocument();
    expect(screen.getByText('Repository path is required.')).toBeInTheDocument();
    expect(saveRepositories).not.toHaveBeenCalled();
  });
});

describe('merge request setup', () => {
  const repo = { name: 'Checkout', path: '/srv/checkout', defaultTarget: 'main' };
  const commits = [
    {
      sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      shortSha: 'aaaaaaa',
      author: 'alex',
      date: '2026-10-01T10:00:00+03:00',
      subject: 'Add retry counter',
    },
    {
      sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      shortSha: 'bbbbbbb',
      author: 'alex',
      date: '2026-10-02T10:00:00+03:00',
      subject: 'Fix retry budget',
    },
  ];

  function clientWith(overrides: Record<string, unknown>): ApiClient {
    return fakeClient({
      listRepositories: vi.fn(async () => ({ repositories: [repo] })),
      listBranches: vi.fn(async () => ({
        repoRoot: repo.path,
        branches: ['feature', 'main'],
      })),
      listCommits: vi.fn(async () => ({
        repoRoot: repo.path,
        baseRef: 'main',
        headRef: 'feature',
        mergeBase: 'a',
        headSha: 'b',
        commits,
      })),
      ...overrides,
    });
  }

  it('defaults to a branch merge request and posts the range boundary', async () => {
    const user = userEvent.setup();
    const createReview = vi.fn(async (input: unknown) => ({
      review: { review: { id: 'rev_11' } },
      url: '',
      warnings: [],
      input,
    }));
    render(<App client={clientWith({ createReview })} />);
    await user.click(screen.getByRole('button', { name: 'New review' }));
    expect(await screen.findByDisplayValue('/srv/checkout')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Target branch')).toHaveValue('main'));
    await user.type(screen.getByLabelText('Title'), 'Retry merge request');
    await user.type(screen.getByLabelText('Source branch'), 'feature');
    await user.click(screen.getByRole('button', { name: 'Create review' }));

    await waitFor(() => expect(createReview).toHaveBeenCalledOnce());
    expect(createReview.mock.calls[0]?.[0]).toMatchObject({
      repoRoot: '/srv/checkout',
      title: 'Retry merge request',
      scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
    });
  });

  it('posts the selected commits when choosing commits', async () => {
    const user = userEvent.setup();
    const createReview = vi.fn(async (input: unknown) => ({
      review: { review: { id: 'rev_12' } },
      url: '',
      warnings: [],
      input,
    }));
    const listCommits = vi.fn(async () => ({
      repoRoot: repo.path,
      baseRef: 'main',
      headRef: 'feature',
      mergeBase: 'a',
      headSha: 'b',
      commits,
    }));
    render(<App client={clientWith({ createReview, listCommits })} />);
    await user.click(screen.getByRole('button', { name: 'New review' }));
    await user.type(await screen.findByLabelText('Title'), 'Selected retries');
    await user.type(screen.getByLabelText('Source branch'), 'feature');
    await user.click(screen.getByRole('radio', { name: /Choose commits/ }));
    await waitFor(() => expect(listCommits).toHaveBeenCalled());
    await user.click(await screen.findByRole('checkbox', { name: /aaaaaaa Add retry counter/ }));
    await user.click(screen.getByRole('checkbox', { name: /bbbbbbb Fix retry budget/ }));
    await user.click(screen.getByRole('button', { name: 'Create review' }));

    await waitFor(() => expect(createReview).toHaveBeenCalledOnce());
    expect(createReview.mock.calls[0]?.[0]).toMatchObject({
      scope: { kind: 'commits', shas: [commits[0]?.sha, commits[1]?.sha] },
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

  it('collapses and expands the desktop sidebar and remembers the choice', async () => {
    const user = userEvent.setup();
    const first = render(<App client={fakeClient()} />);
    const shell = document.querySelector('.cr-shell');
    expect(shell).toHaveAttribute('data-sidebar', 'expanded');

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(shell).toHaveAttribute('data-sidebar', 'collapsed');
    expect(window.localStorage.getItem('cr-sidebar-collapsed')).toBe('1');

    first.unmount();
    render(<App client={fakeClient()} />);
    expect(document.querySelector('.cr-shell')).toHaveAttribute('data-sidebar', 'collapsed');

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(document.querySelector('.cr-shell')).toHaveAttribute('data-sidebar', 'expanded');
    expect(window.localStorage.getItem('cr-sidebar-collapsed')).toBeNull();
  });
});
