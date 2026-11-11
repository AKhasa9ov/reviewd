import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, Theme } from '@sir_yami/reviewd-ui';
import { createApiClient } from '@sir_yami/reviewd-ui';
import { createMemoryRouter, Link, parseRoute, useLocation } from '../../../web/src/router.js';
import type { Router } from '../../../web/src/router.js';
import { ReviewApp } from '../../../web/src/App.js';
import { ErrorBoundary } from './ErrorBoundary.js';

const ROUTE_STORAGE_KEY = 'cr-dsh-route';

function readHostTheme(): Theme {
  return typeof document !== 'undefined' && document.body.hasAttribute('data-ds-dark-theme')
    ? 'dark'
    : 'light';
}

function NativeHeader(): JSX.Element {
  const route = parseRoute(useLocation());
  const active = route.name === 'new' ? '/new' : route.name === 'health' ? '/health' : '/';
  return (
    <header className="cr-native-bar">
      <span className="cr-native-brand">Code review</span>
      <nav className="cr-native-nav" aria-label="Code review sections">
        <Link className="cr-native-tab" to="/" aria-current={active === '/' ? 'page' : undefined}>
          Reviews
        </Link>
        <Link
          className="cr-native-tab"
          to="/new"
          aria-current={active === '/new' ? 'page' : undefined}
        >
          New review
        </Link>
        <Link
          className="cr-native-tab"
          to="/health"
          aria-current={active === '/health' ? 'page' : undefined}
        >
          Health
        </Link>
      </nav>
    </header>
  );
}

export interface NativePanelProps {
  client?: ApiClient;
  router?: Router;
  initialTheme?: Theme;
}

export function NativePanel({
  client,
  router,
  initialTheme = readHostTheme(),
}: NativePanelProps): JSX.Element {
  const [panelRouter] = useState(
    () =>
      router ??
      createMemoryRouter('/', {
        hrefBase: '/code-review',
        storageKey: ROUTE_STORAGE_KEY,
        storage: window.sessionStorage,
      }),
  );
  const scopeRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const activeClient = useMemo(
    () => client ?? createApiClient({ baseUrl: '/api/code-review' }),
    [client],
  );
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const syncTheme = (): void => setTheme(readHostTheme());
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    syncTheme();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncSelection = (): void => {
      scopeRef.current?.classList.toggle(
        'cr-selecting-lines',
        document.body.classList.contains('cr-selecting-lines'),
      );
    };
    const observer = new MutationObserver(syncSelection);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    syncSelection();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={scopeRef} className="cr-native-scope cr-native-panel" data-theme={theme}>
      <ErrorBoundary title="Code review failed to render">
        <ReviewApp
          client={activeClient}
          router={panelRouter}
          header={<NativeHeader />}
          theme={{ initialTheme: theme, persist: false, targetRef: scopeRef }}
          portalContainer={portalRef}
          showSettingsLink={false}
          contentClassName="cr-native-main"
        />
      </ErrorBoundary>
      <div ref={portalRef} />
    </div>
  );
}
