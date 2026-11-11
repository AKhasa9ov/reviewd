import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  createApiClient,
  PortalContainerProvider,
  ThemeProvider,
  ToastProvider,
} from '@sir_yami/reviewd-ui';
import type { ApiClient, PortalContainerRef, Theme } from '@sir_yami/reviewd-ui';
import { AUTH_MODE, BASE_PATH } from './base.js';
import { Shell } from './Shell.js';
import { parseRoute, RouterProvider, useLocation, useNavigate, useRouter } from './router.js';
import type { Router } from './router.js';
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

export interface ReviewThemeOptions {
  initialTheme?: Theme;
  storageKey?: string;
  persist?: boolean;
  targetRef?: { readonly current: Pick<HTMLElement, 'dataset'> | null };
}

export interface ReviewAppProps {
  client?: ApiClient;
  router?: Router;
  header?: ReactNode;
  theme?: ReviewThemeOptions;
  portalContainer?: PortalContainerRef;
  showSettingsLink?: boolean;
  contentClassName?: string;
}

export function ReviewRoot({
  client,
  showSettingsLink = true,
}: {
  client?: ApiClient;
  showSettingsLink?: boolean;
}): JSX.Element {
  const location = useLocation();
  const route = parseRoute(location);
  const navigate = useNavigate();
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
    <>
      {route.name === 'list' ? <ReviewListPage client={activeClient} /> : null}
      {route.name === 'new' ? (
        <NewReviewPage client={activeClient} showSettingsLink={showSettingsLink} />
      ) : null}
      {route.name === 'auth' && AUTH_MODE === 'token' ? <AuthPage client={activeClient} /> : null}
      {route.name === 'health' ? <HealthPage client={activeClient} /> : null}
      {route.name === 'settings' ? <SettingsPage client={activeClient} /> : null}
      {route.name === 'review' ? <ReviewDetailPage client={activeClient} id={route.id} /> : null}
      {route.name === 'edit-review' ? <EditReviewPage client={activeClient} id={route.id} /> : null}
      {route.name === 'not-found' ? <NotFoundPage path={route.path} /> : null}
    </>
  );
}

export function ReviewProviders({
  children,
  router,
  theme,
  portalContainer,
}: ReviewAppProps & { children: ReactNode }): JSX.Element {
  /*
   * Resolve the ambient router instead of creating a second browser router:
   * an outer RouterProvider (native shell) wins, while the standalone app
   * falls back to the single router.tsx singleton.
   */
  const ambientRouter = useRouter();
  const activeRouter = router ?? ambientRouter;
  const themeProps = {
    ...(theme?.initialTheme === undefined ? {} : { initialTheme: theme.initialTheme }),
    ...(theme?.storageKey === undefined ? {} : { storageKey: theme.storageKey }),
    ...(theme?.persist === undefined ? {} : { persist: theme.persist }),
    ...(theme?.targetRef === undefined ? {} : { targetRef: theme.targetRef }),
  };

  return (
    <RouterProvider router={activeRouter}>
      <ThemeProvider {...themeProps}>
        <ToastProvider>
          {portalContainer === undefined ? (
            children
          ) : (
            <PortalContainerProvider container={portalContainer}>
              {children}
            </PortalContainerProvider>
          )}
        </ToastProvider>
      </ThemeProvider>
    </RouterProvider>
  );
}

export function ReviewApp({
  client,
  router,
  header,
  theme,
  portalContainer,
  showSettingsLink = true,
  contentClassName,
}: ReviewAppProps): JSX.Element {
  return (
    <ReviewProviders router={router} theme={theme} portalContainer={portalContainer}>
      {header}
      <main className={contentClassName}>
        <ReviewRoot client={client} showSettingsLink={showSettingsLink} />
      </main>
    </ReviewProviders>
  );
}

export function App({ client }: AppProps = {}): JSX.Element {
  return (
    <ReviewProviders>
      <Shell>
        <ReviewRoot client={client} />
      </Shell>
    </ReviewProviders>
  );
}
