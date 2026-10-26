import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  IconButton,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  PulseIcon,
  ReviewsIcon,
  SunIcon,
  ThemeProvider,
  Tooltip,
  useTheme,
} from '@dsh-code-review/ui';
import { Link, useCloseOnNavigate, useLocation } from './router.js';

export interface ShellProps {
  children: ReactNode;
}

function navCurrent(pathname: string, target: string): 'page' | undefined {
  if (target === '/') return pathname === '/' ? 'page' : undefined;
  return pathname === target || pathname.startsWith(`${target}/`) ? 'page' : undefined;
}

function ThemeToggle(): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip label={`Switch to ${next} theme`}>
      <IconButton
        label={`Switch to ${next} theme`}
        onClick={toggleTheme}
        data-testid="theme-toggle"
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </IconButton>
    </Tooltip>
  );
}

export function Shell({ children }: ShellProps): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const location = useLocation();
  const routePath = new URL(location, 'http://local').pathname;
  useCloseOnNavigate(closeDrawer);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="cr-shell" data-drawer={drawerOpen ? 'open' : 'closed'}>
      <a className="cr-skip-link" href="#main">
        Skip to content
      </a>
      <aside className="cr-sidebar" aria-label="Primary navigation">
        <Link className="cr-brand" to="/" aria-label="reviewd home">
          <span className="cr-brand-mark" aria-hidden="true">
            r/
          </span>
          <span className="cr-brand-copy">
            <span className="cr-brand-name">reviewd</span>
            <span className="cr-brand-sub">code review</span>
          </span>
        </Link>

        <nav>
          <p className="cr-nav-label">Workspace</p>
          <div className="cr-nav">
            <Link
              className="cr-nav-link"
              to="/"
              aria-current={navCurrent(routePath, '/')}
              aria-label="Reviews"
            >
              <span className="cr-nav-icon">
                <ReviewsIcon />
              </span>
              <span className="cr-nav-text">Reviews</span>
            </Link>
            <Link
              className="cr-nav-link"
              to="/new"
              aria-current={navCurrent(routePath, '/new')}
              aria-label="New review"
            >
              <span className="cr-nav-icon">
                <PlusIcon />
              </span>
              <span className="cr-nav-text">New review</span>
            </Link>
            <Link
              className="cr-nav-link"
              to="/health"
              aria-current={navCurrent(routePath, '/health')}
              aria-label="Daemon health"
            >
              <span className="cr-nav-icon">
                <PulseIcon />
              </span>
              <span className="cr-nav-text">Health</span>
            </Link>
          </div>
        </nav>

        <div className="cr-sidebar-footer">
          <div className="cr-theme-row">
            <span className="cr-theme-label cr-meta">Theme</span>
            <ThemeToggle />
          </div>
          <div className="cr-daemon">
            <span className="cr-dot" aria-hidden="true" />
            <span>reviewd · local</span>
          </div>
        </div>
      </aside>

      {drawerOpen ? (
        <button
          type="button"
          className="cr-drawer-backdrop"
          aria-label="Close navigation"
          onClick={closeDrawer}
        />
      ) : null}

      <div className="cr-main">
        <div className="cr-topbar">
          <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </IconButton>
          <Link className="cr-brand" to="/" aria-label="reviewd home">
            <span className="cr-brand-mark" aria-hidden="true">
              r/
            </span>
            <span className="cr-brand-name">reviewd</span>
          </Link>
          <span style={{ marginLeft: 'auto' }}>
            <ThemeToggle />
          </span>
        </div>
        <main className="cr-content" id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  return (
    <ThemeProvider>
      <Shell>{children}</Shell>
    </ThemeProvider>
  );
}
