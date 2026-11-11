// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@sir_yami/reviewd-ui';
import { createMemoryRouter } from '../../web/src/router.js';
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
    ...overrides,
  } as unknown as ApiClient;
}

describe('NativePanel', () => {
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

  it('renders repository settings in the DSH settings tab surface', async () => {
    render(<SettingsTab client={client()} />);
    expect(await screen.findByRole('heading', { name: 'Repositories' })).toBeInTheDocument();
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
