import { useMemo } from 'react';
import { createApiClient, ToastProvider, ThemeProvider } from '@dsh-code-review/ui';
import type { ApiClient } from '@dsh-code-review/ui';
import { Shell } from './Shell.js';
import { navigate, parseRoute, useLocation } from './router.js';
import { ReviewListPage } from './pages/ReviewListPage.js';
import { NewReviewPage } from './pages/NewReviewPage.js';
import { AuthPage } from './pages/AuthPage.js';
import { HealthPage } from './pages/HealthPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { ReviewDetailPage } from './pages/ReviewDetailPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export interface AppProps {
  client?: ApiClient;
}

export function App({ client }: AppProps = {}): JSX.Element {
  const location = useLocation();
  const route = parseRoute(location);
  const activeClient = useMemo(
    () =>
      client ??
      createApiClient({
        onUnauthorized: (next) =>
          navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true }),
      }),
    [client],
  );

  return (
    <ThemeProvider>
      <ToastProvider>
        <Shell>
          {route.name === 'list' ? <ReviewListPage client={activeClient} /> : null}
          {route.name === 'new' ? <NewReviewPage client={activeClient} /> : null}
          {route.name === 'auth' ? <AuthPage client={activeClient} /> : null}
          {route.name === 'health' ? <HealthPage client={activeClient} /> : null}
          {route.name === 'settings' ? <SettingsPage client={activeClient} /> : null}
          {route.name === 'review' ? (
            <ReviewDetailPage client={activeClient} id={route.id} />
          ) : null}
          {route.name === 'not-found' ? <NotFoundPage path={route.path} /> : null}
        </Shell>
      </ToastProvider>
    </ThemeProvider>
  );
}
