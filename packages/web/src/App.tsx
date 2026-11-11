import { useEffect, useMemo } from 'react';
import { createApiClient, ToastProvider, ThemeProvider } from '@sir_yami/reviewd-ui';
import type { ApiClient } from '@sir_yami/reviewd-ui';
import { AUTH_MODE, BASE_PATH } from './base.js';
import { Shell } from './Shell.js';
import { parseRoute, useLocation, useNavigate } from './router.js';
import { ReviewListPage } from './pages/ReviewListPage.js';
import { NewReviewPage } from './pages/NewReviewPage.js';
import { AuthPage } from './pages/AuthPage.js';
import { HealthPage } from './pages/HealthPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { ReviewDetailPage } from './pages/ReviewDetailPage.js';
import { EditReviewPage } from './pages/EditReviewPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export interface AppProps {
  client?: ApiClient;
}

export function App({ client }: AppProps = {}): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(location);
  const activeClient = useMemo(
    () =>
      client ??
      createApiClient({
        baseUrl: BASE_PATH,
        ...(AUTH_MODE === 'token'
          ? {
              onUnauthorized: (next: string) =>
                navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true }),
            }
          : {}),
      }),
    [client, navigate],
  );

  useEffect(() => {
    if (AUTH_MODE === 'dsh' && route.name === 'auth') navigate('/', { replace: true });
  }, [navigate, route.name]);

  return (
    <ThemeProvider>
      <ToastProvider>
        <Shell>
          {route.name === 'list' ? <ReviewListPage client={activeClient} /> : null}
          {route.name === 'new' ? <NewReviewPage client={activeClient} /> : null}
          {route.name === 'auth' && AUTH_MODE === 'token' ? (
            <AuthPage client={activeClient} />
          ) : null}
          {route.name === 'health' ? <HealthPage client={activeClient} /> : null}
          {route.name === 'settings' ? <SettingsPage client={activeClient} /> : null}
          {route.name === 'review' ? (
            <ReviewDetailPage client={activeClient} id={route.id} />
          ) : null}
          {route.name === 'edit-review' ? (
            <EditReviewPage client={activeClient} id={route.id} />
          ) : null}
          {route.name === 'not-found' ? <NotFoundPage path={route.path} /> : null}
        </Shell>
      </ToastProvider>
    </ThemeProvider>
  );
}
