import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  IconButton,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  PulseIcon,
  ReviewsIcon,
  SettingsIcon,
  SunIcon,
  ThemeProvider,
  Tooltip,
  useTheme,
} from '@sir_yami/reviewd-ui';
import { BASE_PATH, normalizeBase } from './base.js';
import { Link, useCloseOnNavigate, useLocation } from './router.js';

const SIDEBAR_STORAGE_KEY = 'cr-sidebar-collapsed';

function readCollapsedSidebar(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface ShellProps {
  children: ReactNode;
}

function navCurrent(pathname: string, target: string): 'page' | undefined {
  if (target === '/') return pathname === '/' ? 'page' : undefined;
  return pathname === target || pathname.startsWith(`${target}/`) ? 'page' : undefined;
}

/**
 * Nav targets are root-relative routes, but the location keeps the SPA's mount
 * base (`/code-review/...` in the fat build), so strip it before comparing.
 */
function routePathname(location: string): string {
  const pathname = new URL(location, 'http://local').pathname;
  const base = normalizeBase(BASE_PATH);
  if (base === '') return pathname;
  if (pathname === base) return '/';
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  return pathname;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsedSidebar);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const location = useLocation();
  const routePath = routePathname(location);
  useCloseOnNavigate(closeDrawer);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function toggleSidebar(): void {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      if (next) window.localStorage.setItem(SIDEBAR_STORAGE_KEY, '1');
      else window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in privacy modes; collapsing still works for this session.
    }
  }

  return (
    <div
      className="cr-shell"
      data-drawer={drawerOpen ? 'open' : 'closed'}
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
    >
      <a className="cr-skip-link" href="#main">
        Skip to content
      </a>
      <aside className="cr-sidebar" id="primary-sidebar" aria-label="Primary navigation">
        <div className="cr-sidebar-head">
          <Link className="cr-brand" to="/">
            <span className="cr-brand-mark" aria-hidden="true">
              r/
            </span>
            <span className="cr-brand-copy" aria-hidden="true">
              <span className="cr-brand-name">reviewd</span>
              <span className="cr-brand-sub">code review</span>
            </span>
            <span className="cr-visually-hidden">reviewd code review home</span>
          </Link>
          <IconButton
            label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="cr-sidebar-toggle"
            aria-controls="primary-sidebar"
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <ArrowRightIcon /> : <ArrowLeftIcon />}
          </IconButton>
        </div>

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
              to="/settings"
              aria-current={navCurrent(routePath, '/settings')}
              aria-label="Settings"
            >
              <span className="cr-nav-icon">
                <SettingsIcon />
              </span>
              <span className="cr-nav-text">Settings</span>
            </Link>
            <Link
              className="cr-nav-link"
              to="/health"
              aria-label="Health"
              aria-current={navCurrent(routePath, '/health')}
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
          <Link className="cr-brand" to="/">
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
