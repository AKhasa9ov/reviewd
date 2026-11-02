// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, ReviewSummary } from '@sir_yami/reviewd-ui';

vi.hoisted(() => {
  vi.stubEnv('BASE_URL', '/code-review/');
  vi.stubEnv('VITE_AUTH_MODE', 'dsh');
});

import { App } from '../src/App.js';
import { navigate } from '../src/router.js';
import { AppProviders } from '../src/Shell.js';

const review: ReviewSummary = {
  id: 'rev_01',
  title: 'Billing retry semantics',
  repoRoot: '/srv/repo',
  status: 'open',
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  roundCount: 1,
  commentCount: 0,
  openCommentCount: 0,
  scope: 'a → b',
};

function fakeClient(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listReviews: vi.fn(async () => ({ items: [review], total: 1, limit: 50, offset: 0 })),
    ...overrides,
  } as unknown as ApiClient;
}

function go(path: string): void {
  window.history.replaceState({}, '', path);
}

beforeEach(() => {
  go('/code-review/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('embedded DSH auth mode', () => {
  it('keeps a 401 on the list instead of redirecting to the token form', async () => {
    const unauthorized = {
      status: 401,
      ok: false,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({ error: { code: 'unauthorized', message: 'Authentication required' } }),
    } as unknown as Response;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return unauthorized;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/^\/code-review\/api\/reviews(\?|$)/);
    expect(window.location.pathname).toBe('/code-review/');
    expect(screen.queryByRole('heading', { name: 'Sign in to reviewd' })).not.toBeInTheDocument();
  });

  it('normalizes /auth to the review list without rendering the token form', async () => {
    go('/code-review/auth?next=%2Fnew');

    render(<App client={fakeClient()} />);

    await waitFor(() => expect(window.location.pathname).toBe('/code-review/'));
    expect(screen.queryByLabelText('Access token')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Reviews' })).toBeInTheDocument();
  });

  it('prefixes links and navigation with the base exactly once', async () => {
    render(<App client={fakeClient()} />);

    const link = await screen.findByRole('link', { name: /Billing retry semantics/ });
    expect(link).toHaveAttribute('href', '/code-review/review/rev_01');

    navigate('/missing');
    expect(window.location.pathname).toBe('/code-review/missing');
    navigate('/code-review/other');
    expect(window.location.pathname).toBe('/code-review/other');
  });

  it('marks the active navigation item below the base path', () => {
    go('/code-review/settings');

    render(
      <AppProviders>
        <div />
      </AppProviders>,
    );

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Reviews' })).not.toHaveAttribute('aria-current');
  });

  it('marks Reviews current on the base root', () => {
    render(
      <AppProviders>
        <div />
      </AppProviders>,
    );

    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });
});
