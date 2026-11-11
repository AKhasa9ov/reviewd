# DSH Native Review UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the approved spec before starting: `docs/superpowers/specs/2026-11-11-dsh-native-review-ui-design.md`.

**Goal:** Make the DSH `Code Review` panel the full native review UI, and move reviewd repository settings into a DSH Settings plugin tab, without breaking the standalone SPA.

**Architecture:** Extract a router-provider-based composition root from the standalone web app, reuse the existing review pages and `ReviewDetail`, scope the existing CSS under `.cr-native-scope`, and compile a new `packages/dsh/client.js` that mounts the app natively in the DSH `main` slot. Repository settings are rendered in `settings.plugins.tab` using the same scoped UI and daemon API.

**Tech Stack:** TypeScript, React 18, Vite 8, Vitest, Testing Library, Playwright, esbuild 0.28.2, PostCSS 8.5.31, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-11-11-dsh-native-review-ui-design.md`

## Global Constraints

- Work in `/home/superuser/projects/dsh-code-review-fat`, branch `feat/review-quality-r1`, based on `662b70a`.
- The three pre-existing modified files are unrelated WIP and must never be staged, formatted, reverted, or included in a task commit: `packages/core/src/diff/snapshot.ts`, `packages/server/src/daemon/routes.ts`, `packages/server/src/daemon/server.ts`.
- No iframe, no Shadow DOM, no duplicate React installation.
- No unscoped `html`, `body`, `:root`, or `#root` selectors in the DSH client bundle.
- English UI copy, matching the standalone SPA.
- Settings is not a tab in the native panel. It is a `settings.plugins.tab` contribution in DSH Settings → Built-in plugins → **Code Review**.
- The standalone SPA and `/code-review/...` URLs must continue to work.
- Do not change either existing store by default. Current profile uses the external daemon; embedded `storeDir` remains an explicit override.
- One task = one atomic commit. Run the task's verify command before committing.
- After every wave run `pnpm test`; at the end run the full `pnpm verify`.
- Do not publish, bump npm versions, or mutate the active DSH profile without a separate human approval.

## File Structure

```text
packages/ui/src/primitives/PortalContainer.tsx   portal container context
packages/ui/src/primitives/Dialog.tsx             use the context instead of document.body
packages/ui/src/theme.tsx                         target/persist options for native scopes
packages/ui/src/index.ts                          export the new public APIs

packages/web/src/router.tsx                       browser + memory router adapters
packages/web/src/App.tsx                          ReviewProviders / ReviewRoot / ReviewApp / App
packages/web/src/pages/*.tsx                      useNavigate instead of global navigate

packages/dsh/src/client.tsx                       DSH browser entry + slot registration
packages/dsh/src/client/ErrorBoundary.tsx          shared native surface error boundary
packages/dsh/src/client/NativePanel.tsx           compact panel frame and nav
packages/dsh/src/client/SettingsTab.tsx           Settings > Built-in plugins tab
packages/dsh/src/client/native.css                native frame/nav/tab styles

scripts/scope-review-css.mjs                      PostCSS scoping and CSS assembly
scripts/build.mjs                                 emits packages/dsh/client.js

packages/dsh/test/client.test.ts                  bundle contract test
packages/dsh/test/native-panel.test.tsx           native app integration tests
packages/dsh/test/scope-css.test.ts               scoping tests
```

## Dependency Order / Waves

- **Wave 1 — standalone foundation:** Tasks 1–5.
- **Wave 2 — native rendering:** Tasks 6–8.
- **Wave 3 — parity and settings:** Tasks 9–10.
- **Wave 4 — docs and verification:** Tasks 11–12.

Tasks within a wave that touch disjoint files may run in parallel. Do not run Tasks 6–8 before Tasks 1–5 are green.

---

### Task 1: Add injectable browser and memory routers

**Files:**

- Modify: `packages/web/src/router.tsx`
- Create: `packages/web/test/router-context.test.tsx`

**Interfaces:**

- Consumes: existing `BASE_PATH`, `withBase`, `parseRoute`.
- Produces:
  ```ts
  export interface Router {
    location(): string;
    subscribe(listener: () => void): () => void;
    navigate(to: string, options?: { replace?: boolean }): void;
    href(to: string): string;
  }
  export function createBrowserRouter(base?: string): Router;
  export function createMemoryRouter(
    initial?: string,
    options?: {
      storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
      storageKey?: string;
      hrefBase?: string;
    },
  ): Router;
  export function RouterProvider(props: { router: Router; children: ReactNode }): JSX.Element;
  export function useNavigate(): Router['navigate'];
  export function useLocation(): string;
  ```
- `navigate(to, options)` and `Link` keep their current public signatures. The module-level `navigate` remains the browser default for compatibility with tests that import it.

- [ ] **Step 1: Write the failing router-context tests**

```tsx
// packages/web/test/router-context.test.tsx
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { RouterProvider, createMemoryRouter, useLocation, useNavigate } from '../src/router.js';

function wrapper(router: ReturnType<typeof createMemoryRouter>) {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <RouterProvider router={router}>{children}</RouterProvider>;
  };
}

describe('memory router', () => {
  it('keeps navigation local without touching window.history', () => {
    const router = createMemoryRouter('/review/rev_1?round=2');
    const { result } = renderHook(() => ({ location: useLocation(), navigate: useNavigate() }), {
      wrapper: wrapper(router),
    });

    expect(result.current.location).toBe('/review/rev_1?round=2');
    act(() => result.current.navigate('/new'));
    expect(result.current.location).toBe('/new');
    expect(window.location.pathname).not.toBe('/new');
  });

  it('persists and restores its logical location', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    const first = createMemoryRouter('/', { storage, storageKey: 'cr-test-route' });
    first.navigate('/health');
    const restored = createMemoryRouter('/', { storage, storageKey: 'cr-test-route' });
    expect(restored.location()).toBe('/health');
  });

  it('uses the standalone URL as the real link fallback', () => {
    const router = createMemoryRouter('/review/rev_1', { hrefBase: '/code-review' });
    expect(router.href('/review/rev_1')).toBe('/code-review/review/rev_1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/web/test/router-context.test.tsx`
Expected: FAIL because `RouterProvider`, `createMemoryRouter`, and `useNavigate` are missing.

- [ ] **Step 3: Implement the router adapters**

Replace the module-level listener/snapshot logic in `packages/web/src/router.tsx` with:

````tsx
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { BASE_PATH, normalizeBase, withBase } from './base.js';

export interface Router {
  location(): string;
  subscribe(listener: () => void): () => void;
  navigate(to: string, options?: { replace?: boolean }): void;
  href(to: string): string;
}

const RouterContext = createContext<Router | null>(null);

A browser router must keep the `popstate` listener for the lifetime of the page. Use this exact browser implementation:

```tsx
export function createBrowserRouter(base = BASE_PATH): Router {
  const listeners = new Set<() => void>();
  const read = (): string => `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  window.addEventListener('popstate', emit);
  return {
    location: read,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate: (to, options = {}) => {
      const target = withBase(to, base);
      if (options.replace === true) window.history.replaceState({}, '', target);
      else window.history.pushState({}, '', target);
      emit();
    },
    href: (to) => withBase(to, base),
  };
}
````

Memory implementation:

```tsx
export function createMemoryRouter(
  initial = '/',
  options: {
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    storageKey?: string;
    hrefBase?: string;
  } = {},
): Router {
  const key = options.storageKey;
  const stored = key === undefined ? null : (options.storage?.getItem(key) ?? null);
  let current = stored ?? initial;
  const listeners = new Set<() => void>();
  const persist = (value: string): void => {
    if (key !== undefined) options.storage?.setItem(key, value);
  };
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    location: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate: (to, navigateOptions = {}) => {
      current = to;
      persist(to);
      emit();
      // Keep the variable used so the API stays symmetric with the browser adapter.
      void navigateOptions;
    },
    href: (to) => withBase(to, options.hrefBase ?? ''),
  };
}
```

Then add:

```tsx
const browserRouter = createBrowserRouter();

export function RouterProvider({
  router,
  children,
}: {
  router: Router;
  children: ReactNode;
}): JSX.Element {
  return <RouterContext.Provider value={router}>{children}</RouterContext.Provider>;
}

export function useRouter(): Router {
  const router = useContext(RouterContext) ?? browserRouter;
  return router;
}

export function useLocation(): string {
  const router = useRouter();
  return useSyncExternalStore(router.subscribe, router.location, router.location);
}

export function useNavigate(): Router['navigate'] {
  return useRouter().navigate;
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  browserRouter.navigate(to, options);
}
```

Update `Link` to use `useRouter()` and its `href`/`navigate`. Keep the same modifier-click handling. Update `useCloseOnNavigate` to use `useLocation()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/web/test/router-context.test.tsx packages/web/test/router.test.ts`
Expected: PASS. The existing `parseRoute` tests remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/router.tsx packages/web/test/router-context.test.tsx
git commit -m "refactor(web): add injectable router adapters"
```

---

### Task 2: Convert web pages to the router hooks

**Files:**

- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/Shell.tsx`
- Modify: `packages/web/src/pages/NewReviewPage.tsx`
- Modify: `packages/web/src/pages/ReviewListPage.tsx`
- Modify: `packages/web/src/pages/ReviewDetailPage.tsx`
- Modify: `packages/web/src/pages/EditReviewPage.tsx`
- Modify: `packages/web/src/pages/AuthPage.tsx`
- Modify: `packages/web/src/pages/NotFoundPage.tsx`
- Test: existing `packages/web/test/app.test.tsx`, `auth-mode.test.tsx`, `edit-review.test.tsx`, `review-detail.test.tsx`, `review-coverage.test.tsx`

**Interfaces:**

- Consumes: `useNavigate`, `useLocation`, `useRouter` from Task 1.
- Produces: pages that no longer import the module-level browser `navigate`; `ReviewDetailPage` passes the active router's navigate function into `ReviewDetail`.

- [ ] **Step 1: Write the failing integration assertion**

Add this test to `packages/web/test/app.test.tsx`:

```tsx
it('navigates inside a supplied memory router without changing window.history', async () => {
  const router = createMemoryRouter('/', { hrefBase: '/code-review' });
  const user = userEvent.setup();
  render(
    <RouterProvider router={router}>
      <App client={fakeClient()} />
    </RouterProvider>,
  );

  await user.click(screen.getAllByRole('link', { name: /new review/i })[0]);
  expect(router.location()).toBe('/new');
  expect(window.location.pathname).not.toBe('/new');
});
```

Import `createMemoryRouter` and `RouterProvider` from `../src/router.js`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/web/test/app.test.tsx`
Expected: FAIL because pages still use the module-level browser `navigate`, so the memory router's location stays `/`.

- [ ] **Step 3: Replace the imports and calls**

In each page:

```tsx
// before
import { navigate } from '../router.js';

// after
import { useNavigate } from '../router.js';
```

Inside the component:

```tsx
const navigate = useNavigate();
```

Apply to `NewReviewPage`, `ReviewListPage`, `EditReviewPage`, `AuthPage`, and `NotFoundPage`.

`NewReviewPage` also gets a native-surface switch so the panel has no Settings navigation entry:

Add this interface above the existing component:

```tsx
export interface NewReviewPageProps {
  client: ApiClient;
  showSettingsLink?: boolean;
}
```

Change the existing component signature to:

```tsx
export function NewReviewPage({
  client,
  showSettingsLink = true,
}: NewReviewPageProps): JSX.Element {
  const navigate = useNavigate();
```

Leave the existing state, effects, and the rest of the JSX in place. Replace only the existing repository section header (the `<div className="cr-form-section-head">` around the "Repository" heading) with:

```tsx
<div className="cr-form-section-head">
  <div>
    <h2 className="cr-form-section-title">Repository</h2>
    <p className="cr-form-section-copy">
      Paths are resolved on the daemon.{' '}
      {showSettingsLink
        ? 'Manage saved repositories in Settings.'
        : 'Manage saved repositories in DSH Settings → Built-in plugins → Code Review.'}
    </p>
  </div>
  {showSettingsLink ? (
    <Link className="cr-link-button" to="/settings">
      Manage repositories
    </Link>
  ) : null}
</div>
```

Keep the rest of the page unchanged. `showSettingsLink` defaults to `true`, so the standalone SPA keeps the link.

`ReviewDetailPage` becomes:

```tsx
import type { ApiClient } from '@sir_yami/reviewd-ui';
import { ReviewDetail } from '@sir_yami/reviewd-ui';
import { useLocation, useNavigate } from '../router.js';

export interface ReviewDetailPageProps {
  client: ApiClient;
  id: string;
}

export function ReviewDetailPage({ client, id }: ReviewDetailPageProps): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  return <ReviewDetail client={client} id={id} location={location} navigate={navigate} />;
}
```

`App.tsx` must call `useLocation` and `useNavigate` inside a router-provider child. Do not call `useNavigate` in `App` before `ReviewProviders` exists; Task 5 will split the component. For this task, temporarily wrap the body of `App` in a small `AppContent` function:

```tsx
export function App({ client }: AppProps = {}): JSX.Element {
  return (
    <RouterProvider router={createBrowserRouter()}>
      <AppContent client={client} />
    </RouterProvider>
  );
}
```

Move the existing `useLocation`/`useEffect`/`Shell`/`ToastProvider` body into `AppContent`. This intermediate shape is replaced by Task 5; it must still pass all web tests.

- [ ] **Step 4: Run the affected tests**

Run:

```bash
pnpm vitest run packages/web/test/app.test.tsx packages/web/test/auth-mode.test.tsx packages/web/test/edit-review.test.tsx packages/web/test/review-detail.test.tsx packages/web/test/review-coverage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/Shell.tsx packages/web/src/pages/NewReviewPage.tsx packages/web/src/pages/ReviewListPage.tsx packages/web/src/pages/ReviewDetailPage.tsx packages/web/src/pages/EditReviewPage.tsx packages/web/src/pages/AuthPage.tsx packages/web/src/pages/NotFoundPage.tsx packages/web/test/app.test.tsx
git commit -m "refactor(web): use router context in review pages"
```

---

### Task 3: Add a panel-local dialog portal

**Files:**

- Create: `packages/ui/src/primitives/PortalContainer.tsx`
- Modify: `packages/ui/src/primitives/Dialog.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/test/primitives.test.tsx`

**Interfaces:**

- Consumes: `createPortal` from `react-dom`.
- Produces:
  ```ts
  export interface PortalContainerRef {
    current: HTMLElement | null;
  }
  export function PortalContainerProvider(props: {
    container: PortalContainerRef;
    children: ReactNode;
  }): JSX.Element;
  export function usePortalContainer(): HTMLElement | null;
  ```
- `Dialog` uses the nearest container, otherwise `document.body`.

- [ ] **Step 1: Write the failing portal test**

```tsx
it('portals a dialog into the panel container when one is provided', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const close = vi.fn();

  render(
    <PortalContainerProvider container={{ current: container }}>
      <Dialog open title="Scoped dialog" onClose={close}>
        body
      </Dialog>
    </PortalContainerProvider>,
  );

  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.querySelector(':scope > .cr-overlay')).toBeNull();
  container.remove();
});
```

Add the imports for `PortalContainerProvider` and `vi` if not already present.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/ui/test/primitives.test.tsx`
Expected: FAIL because the provider and hook do not exist.

- [ ] **Step 3: Implement the provider and update Dialog**

Create `PortalContainer.tsx`:

```tsx
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface PortalContainerRef {
  readonly current: HTMLElement | null;
}

const PortalContainerContext = createContext<PortalContainerRef | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: PortalContainerRef;
  children: ReactNode;
}): JSX.Element {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  );
}

export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext)?.current ?? null;
}
```

In `Dialog.tsx`, add the import:

```tsx
import { usePortalContainer } from './PortalContainer.js';
```

Read the container once inside the component:

```tsx
const portalContainer = usePortalContainer();
```

At the existing final `createPortal` call, apply two exact edits:

1. Insert `const portalContainer = usePortalContainer();` immediately before `return createPortal(`.
2. Replace the existing final target argument `document.body,` with `portalContainer ?? document.body,`.

The dialog body and all other attributes are unchanged.

Export both symbols from `packages/ui/src/index.ts`:

```ts
export { PortalContainerProvider, usePortalContainer } from './primitives/PortalContainer.js';
export type { PortalContainerRef } from './primitives/PortalContainer.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/ui/test/primitives.test.tsx packages/ui/test/full-file-dialog.test.tsx`
Expected: PASS. The standalone full-file dialog still portals to `document.body` when no provider exists.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/primitives/PortalContainer.tsx packages/ui/src/primitives/Dialog.tsx packages/ui/src/index.ts packages/ui/test/primitives.test.tsx
git commit -m "feat(ui): add scoped dialog portal container"
```

---

### Task 4: Make ThemeProvider targetable and non-persistent

**Files:**

- Modify: `packages/ui/src/theme.tsx`
- Modify: `packages/ui/src/index.ts` if types need exporting
- Test: `packages/ui/test/primitives.test.tsx`

**Interfaces:**

- Produces:
  ```ts
  export interface ThemeProviderProps {
    children: ReactNode;
    initialTheme?: Theme;
    storageKey?: string;
    persist?: boolean;
    targetRef?: { readonly current: Pick<HTMLElement, 'dataset'> | null };
  }
  ```
- Default behavior remains `document.documentElement` + localStorage persistence.

- [ ] **Step 1: Write the failing theme-target test**

```tsx
it('applies and persists a theme only on the supplied target when requested', () => {
  const target = document.createElement('div');
  document.documentElement.dataset.theme = 'light';
  window.localStorage.setItem('cr-theme', 'light');

  render(
    <ThemeProvider initialTheme="dark" persist={false} targetRef={{ current: target }}>
      <span>themed</span>
    </ThemeProvider>,
  );

  expect(target.dataset.theme).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(window.localStorage.getItem('cr-theme')).toBe('light');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/ui/test/primitives.test.tsx`
Expected: FAIL because `ThemeProvider` has no `targetRef` or `persist`.

- [ ] **Step 3: Implement the options**

```tsx
export interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
  storageKey?: string;
  persist?: boolean;
  targetRef?: { readonly current: Pick<HTMLElement, 'dataset'> | null };
}

export function ThemeProvider({
  children,
  initialTheme,
  storageKey = THEME_STORAGE_KEY,
  persist = true,
  targetRef,
}: ThemeProviderProps): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(
    () => initialTheme ?? (persist ? readStoredTheme(storageKey) : DEFAULT_THEME),
  );

  useEffect(() => {
    if (targetRef !== undefined) {
      if (targetRef.current !== null) applyTheme(theme, targetRef.current);
    } else {
      applyTheme(theme);
    }
    if (!persist) return;
    try {
      globalThis.localStorage?.setItem(storageKey, theme);
    } catch {
      // Storage can be unavailable in private mode; the in-memory theme still works.
    }
  }, [persist, storageKey, targetRef, theme]);

  // Leave setTheme, toggleTheme, and the context value implementation unchanged.
}
```

Do not write `document.documentElement` when `targetRef` is supplied and `current` is `null`; the native panel sets the initial `data-theme` on its own wrapper before the effect runs.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/ui/test/primitives.test.tsx packages/web/test/app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/theme.tsx packages/ui/src/index.ts packages/ui/test/primitives.test.tsx
git commit -m "feat(ui): allow scoped non-persistent themes"
```

---

### Task 5: Extract ReviewProviders, ReviewRoot, and ReviewApp

**Files:**

- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/test/app.test.tsx`
- Test: `packages/web/test/auth-mode.test.tsx`

**Interfaces:**

- Consumes: `createBrowserRouter`, `RouterProvider`, `ThemeProvider`, `ToastProvider`, `PortalContainerProvider`, pages.
- Produces:

  ```ts
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
  export function ReviewProviders(props: ReviewAppProps & { children: ReactNode }): JSX.Element;
  export function ReviewRoot(props: {
    client?: ApiClient;
    showSettingsLink?: boolean;
  }): JSX.Element;
  export function ReviewApp(props: ReviewAppProps): JSX.Element;
  export function App(props: { client?: ApiClient }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing native composition test**

```tsx
it('renders the native header and route through ReviewApp', async () => {
  const router = createMemoryRouter('/');
  render(
    <ReviewApp client={fakeClient()} router={router} header={<header>Native header</header>} />,
  );

  expect(screen.getByText('Native header')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Reviews' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/web/test/app.test.tsx`
Expected: FAIL because `ReviewApp` is not exported.

- [ ] **Step 3: Extract the composition root**

Use this structure:

```tsx
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
import {
  createBrowserRouter,
  parseRoute,
  RouterProvider,
  useLocation,
  useNavigate,
} from './router.js';
import type { Router } from './router.js';
import { ReviewListPage } from './pages/ReviewListPage.js';
import { NewReviewPage } from './pages/NewReviewPage.js';
import { AuthPage } from './pages/AuthPage.js';
import { HealthPage } from './pages/HealthPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { ReviewDetailPage } from './pages/ReviewDetailPage.js';
import { EditReviewPage } from './pages/EditReviewPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

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

const browserRouter = createBrowserRouter();

export function ReviewProviders({
  children,
  router = browserRouter,
  theme,
  portalContainer,
}: ReviewAppProps & { children: ReactNode }): JSX.Element {
  const themeProps = {
    ...(theme?.initialTheme === undefined ? {} : { initialTheme: theme.initialTheme }),
    ...(theme?.storageKey === undefined ? {} : { storageKey: theme.storageKey }),
    ...(theme?.persist === undefined ? {} : { persist: theme.persist }),
    ...(theme?.targetRef === undefined ? {} : { targetRef: theme.targetRef }),
  };

  return (
    <RouterProvider router={router}>
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
  router = browserRouter,
  header,
"  theme,
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

export function App({ client }: { client?: ApiClient } = {}): JSX.Element {
  return (
    <ReviewProviders>
      <Shell>
        <ReviewRoot client={client} />
      </Shell>
    </ReviewProviders>
  );
}
```

Keep `AppProps` if tests import it. `browserRouter` is created once at module scope; `ReviewProviders` and `ReviewApp` default to it so a render never resets the standalone route.

- [ ] **Step 4: Run the web tests**

Run:

```bash
pnpm vitest run packages/web/test/app.test.tsx packages/web/test/auth-mode.test.tsx packages/web/test/edit-review.test.tsx packages/web/test/review-detail.test.tsx
```

Expected: PASS. `App` output is unchanged visually.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/test/app.test.tsx
git commit -m "refactor(web): extract reusable review app composition"
```

---

### Task 6: Add CSS scoping and assembly

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/scope-review-css.mjs`
- Create: `packages/dsh/test/scope-css.test.ts`
- Create: `packages/dsh/src/client/native.css`

**Interfaces:**

- Produces:

  ```js
  export function scopeSelector(selector, scope = '.cr-native-scope'): string;
  export function scopeReviewCss(css, scope = '.cr-native-scope'): string;
  export async function buildReviewCss(options: {
    uiDir: string;
    nativeCssPath: string;
    scope?: string;
  }): Promise<string>;
  ```

- [ ] **Step 1: Add PostCSS**

Run:

```bash
pnpm add -D -w postcss@8.5.31
```

Expected: root `package.json` gains `postcss` and `pnpm-lock.yaml` changes. Commit both with this task.

- [ ] **Step 2: Write the failing scoping tests**

```ts
// packages/dsh/test/scope-css.test.ts
import { describe, expect, it } from 'vitest';
import { scopeReviewCss, scopeSelector } from '../../../scripts/scope-review-css.mjs';

describe('scopeReviewCss', () => {
  it('maps root and document selectors onto the scope', () => {
    expect(scopeSelector(':root')).toBe('.cr-native-scope');
    expect(scopeSelector(":root[data-theme='light']")).toBe(".cr-native-scope[data-theme='light']");
    expect(scopeSelector('html')).toBe('.cr-native-scope');
    expect(scopeSelector('body.cr-selecting-lines')).toBe('.cr-native-scope.cr-selecting-lines');
    expect(scopeSelector('#root')).toBe('.cr-native-scope');
  });

  it('prefixes ordinary selectors and leaves already-scoped ones alone', () => {
    expect(scopeSelector('.cr-button')).toBe('.cr-native-scope .cr-button');
    expect(scopeSelector('button, a')).toBe('.cr-native-scope button, .cr-native-scope a');
    expect(scopeSelector('.cr-native-scope .cr-native-bar')).toBe(
      '.cr-native-scope .cr-native-bar',
    );
  });

  it('scopes nested media rules but not keyframe steps', () => {
    const output = scopeReviewCss(
      '@media (max-width: 600px){body{margin:0}.cr-card{padding:1px}}@keyframes cr-spin{from{opacity:0}to{opacity:1}}',
    );
    expect(output).toContain('@media (max-width: 600px)');
    expect(output).toContain('.cr-native-scope .cr-card');
    expect(output).toContain('@keyframes cr-spin');
    expect(output).toContain('from{opacity:0}');
    expect(output).not.toMatch(/(^|\n)\s*(html|body|:root|#root)\s*[{,]/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/dsh/test/scope-css.test.ts`
Expected: FAIL because `scripts/scope-review-css.mjs` does not exist.

- [ ] **Step 4: Implement the scoper**

Create `scripts/scope-review-css.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postcss from 'postcss';

export function scopeSelector(selector, scope = '.cr-native-scope') {
  const value = selector.trim();
  if (value === '') return value;
  if (
    value.startsWith(`${scope} `) ||
    value === scope ||
    value.startsWith(`${scope}[`) ||
    value.startsWith(`${scope}.`)
  ) {
    return value;
  }
  if (value === ':root') return scope;
  if (value.startsWith(':root[')) return `${scope}${value.slice(':root'.length)}`;
  if (value === 'html' || value === 'body' || value === '#root') return scope;
  if (value.startsWith('html')) return `${scope}${value.slice('html'.length)}`;
  if (value.startsWith('body')) return `${scope}${value.slice('body'.length)}`;
  if (value.startsWith('#root')) return `${scope}${value.slice('#root'.length)}`;
  return `${scope} ${value}`;
}

export function scopeReviewCss(css, scope = '.cr-native-scope') {
  const root = postcss.parse(css);
  root.walkAtRules('import', (rule) => rule.remove());
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    const selectors = rule.selectors
      .map((selector) => scopeSelector(selector, scope))
      .filter(Boolean);
    rule.selectors = [...new Set(selectors)];
  });
  return root.toString();
}

export async function buildReviewCss({ uiDir, nativeCssPath, scope = '.cr-native-scope' }) {
  const tokens = await readFile(join(uiDir, 'tokens.css'), 'utf8');
  const styles = await readFile(join(uiDir, 'styles.css'), 'utf8');
  const native = await readFile(nativeCssPath, 'utf8');
  return scopeReviewCss(`${tokens}\n${styles.replace(/^@import[^;]+;\s*/m, '')}\n${native}`, scope);
}
```

Keep `ROOT` only if lint allows; remove it if unused. The `styles.css` `@import` is removed before concatenation; the tokens are prepended once.

- [ ] **Step 5: Create the native frame stylesheet**

Create `packages/dsh/src/client/native.css`:

```css
.cr-native-scope {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--cr-bg);
  color: var(--cr-text);
  font-family: var(--dsw-font-family, var(--cr-font-ui));
}

.cr-native-scope.cr-native-panel .cr-native-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--cr-border);
  background: var(--cr-surface);
}

.cr-native-brand {
  flex: 0 0 auto;
  color: var(--cr-text);
  font-family: var(--dsw-font-family, var(--cr-font-ui));
  font-size: 13px;
  font-weight: 600;
}

.cr-native-nav {
  display: flex;
  flex: 1 1 auto;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.cr-native-tab {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 5px 9px;
  border: 1px solid transparent;
  border-radius: var(--cr-radius-control);
  color: var(--cr-text-muted);
  font-size: 12px;
  text-decoration: none;
  white-space: nowrap;
}

.cr-native-tab:hover {
  background: var(--cr-surface-raised);
  color: var(--cr-text);
}

.cr-native-tab[aria-current='page'] {
  border-color: var(--cr-border);
  background: var(--cr-surface-raised);
  color: var(--cr-text);
}

.cr-native-main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.cr-native-main > .cr-content {
  max-width: none;
  padding: 20px 24px 48px;
}

.cr-native-scope.cr-native-panel {
  --cr-bg: var(--dsw-alias-bg-layer-1, #0d1117);
  --cr-surface: var(--dsw-alias-bg-layer-2, #161b22);
  --cr-surface-raised: var(--dsw-alias-bg-layer-3, #21262d);
  --cr-text: var(--dsw-alias-label-primary, #e6edf3);
  --cr-text-muted: var(--dsw-alias-label-tertiary, #9da7b3);
  --cr-border: var(--dsw-alias-border-l2, #5b6572);
  --cr-primary: var(--dsw-alias-brand-primary, #58a6ff);
  --cr-on-primary: var(--dsw-alias-label-primary-foreground, #08111f);
}

.cr-native-scope.cr-settings-tab {
  height: auto;
  min-height: 0;
  overflow: visible;
  padding: 4px 0 24px;
}

.cr-native-scope.cr-settings-tab > .cr-page-head {
  margin-bottom: 16px;
}

@media (max-width: 640px) {
  .cr-native-scope.cr-native-panel .cr-native-bar {
    padding-inline: 12px;
  }

  .cr-native-main > .cr-content {
    padding: 16px 16px 40px;
  }
}

.cr-native-scope .cr-native-error {
  padding: 24px;
  color: var(--cr-text);
}

.cr-native-scope .cr-native-error h1 {
  margin: 0 0 8px;
  font-size: 20px;
}

.cr-native-scope .cr-native-error p {
  margin: 0 0 16px;
  color: var(--cr-text-muted);
}
```

The native CSS selectors already include `.cr-native-scope`; the scoper must leave them unchanged.

- [ ] **Step 6: Run the scoping test**

Run: `pnpm vitest run packages/dsh/test/scope-css.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/scope-review-css.mjs packages/dsh/test/scope-css.test.ts packages/dsh/src/client/native.css
git commit -m "build(dsh): scope review styles for native embedding"
```

---

### Task 7: Build the native panel and settings tab components

**Files:**

- Create: `packages/dsh/src/client/ErrorBoundary.tsx`
- Create: `packages/dsh/src/client/NativePanel.tsx`
- Create: `packages/dsh/src/client/SettingsTab.tsx`
- Test: `packages/dsh/test/native-panel.test.tsx`

**Interfaces:**

- Consumes: `ReviewApp`, `SettingsPage` from `packages/web/src`, `createMemoryRouter`, `useLocation`, `parseRoute`, `Link`, UI providers.
- Produces:
  ```ts
  export interface NativePanelProps {
    client?: ApiClient;
    router?: Router;
    initialTheme?: Theme;
  }
  export function NativePanel(props: NativePanelProps): JSX.Element;
  export interface SettingsTabProps {
    client?: ApiClient;
  }
  export function SettingsTab(props: SettingsTabProps): JSX.Element;
  ```
- `SettingsTab` is registered into `settings.plugins.tab` in Task 8.

- [ ] **Step 1: Write the failing native panel tests**

```tsx
// packages/dsh/test/native-panel.test.tsx
// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
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
        { id: 'rev_1', title: 'Native review', status: 'open', createdAt: '2026-11-11T00:00:00Z' },
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/dsh/test/native-panel.test.tsx`
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement NativePanel**

````tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient, Theme } from '@sir_yami/reviewd-ui';
import { createApiClient } from '@sir_yami/reviewd-ui';
import { createMemoryRouter, Link, parseRoute, useLocation } from '../../../web/src/router.js';
import type { Router } from '../../../web/src/router.js';
import { ReviewApp } from '../../../web/src/App.js';
import { ErrorBoundary } from './ErrorBoundary.js';

const ROUTE_STORAGE_KEY = 'cr-dsh-route';

function readHostTheme(): Theme {
  return typeof document !== 'undefined' &&
    document.body.hasAttribute('data-ds-dark-theme')
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
        <Link className="cr-native-tab" to="/new" aria-current={active === '/new' ? 'page' : undefined}>
          New review
        </Link>
        <Link className="cr-native-tab" to="/health" aria-current={active === '/health' ? 'page' : undefined}>
          Health
        </Link>
      </nav>
    </header>
  );
}

Create `packages/dsh/src/client/ErrorBoundary.tsx` first:

```tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the DSH slot usable; the browser console retains the stack.
    console.error('reviewd native surface failed', error, info);
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="cr-native-error" role="alert">
          <h1>{this.props.title ?? 'Code review failed to render'}</h1>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
````

Then create `NativePanel.tsx`:

```tsx
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
```

`NativePanelProps.router` is typed as the shared `Router` interface; do not use `any`.

The `portalContainer` is rendered after `ReviewApp`; `Dialog` reads `portalRef.current` only when opened, so the ref is populated by then.

- [ ] **Step 4: Implement SettingsTab**

```tsx
import { useMemo, useRef } from 'react';
import type { ApiClient } from '@sir_yami/reviewd-ui';
import {
  PortalContainerProvider,
  ThemeProvider,
  ToastProvider,
  createApiClient,
} from '@sir_yami/reviewd-ui';
import { SettingsPage } from '../../../web/src/pages/SettingsPage.js';
import { ErrorBoundary } from './ErrorBoundary.js';

export interface SettingsTabProps {
  client?: ApiClient;
}

function readHostTheme(): 'light' | 'dark' {
  return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
}

export function SettingsTab({ client }: SettingsTabProps): JSX.Element {
  const scopeRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const activeClient = useMemo(
    () => client ?? createApiClient({ baseUrl: '/api/code-review' }),
    [client],
  );

  return (
    <div ref={scopeRef} className="cr-native-scope cr-settings-tab" data-theme={readHostTheme()}>
      <ErrorBoundary title="Could not load repository settings">
        <ThemeProvider initialTheme={readHostTheme()} persist={false} targetRef={scopeRef}>
          <ToastProvider>
            <PortalContainerProvider container={portalRef}>
              <SettingsPage client={activeClient} />
            </PortalContainerProvider>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
      <div ref={portalRef} />
    </div>
  );
}
```

`SettingsPage` has no router dependency. If importing it from the web package creates a build edge that is undesirable, move only the page import to a small `web/src/native-exports.ts`; do not duplicate the page.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/dsh/test/native-panel.test.tsx`
Expected: PASS. If `NewReviewPage` requires additional API methods during render, extend the fake client, not the component.

- [ ] **Step 6: Commit**

```bash
git add packages/dsh/src/client/ErrorBoundary.tsx packages/dsh/src/client/NativePanel.tsx packages/dsh/src/client/SettingsTab.tsx packages/dsh/test/native-panel.test.tsx
git commit -m "feat(dsh): add native review panel and settings tab"
```

---

### Task 8: Compile the DSH client bundle and register slots

**Files:**

- Create: `packages/dsh/src/client.tsx`
- Modify: `scripts/build.mjs`
- Modify: `packages/dsh/test/client.test.ts`
- Generated: `packages/dsh/client.js`

**Interfaces:**

- Consumes: `NativePanel`, `SettingsTab`, `__REVIEW_CSS__`.
- Produces:
  - `client.js` with `window.__ModuleLoader__.load({ id: '@sir_yami/reviewd', factory(require) { ... } })`.
  - Sidebar `sidebar.panellist` entry `code-review`.
  - `main` panel `code-review` → `NativePanel`.
  - `settings.plugins.tab` entry `code-review` → `SettingsTab`.
  - One scoped `<style>` element injected by `apply` and removed by its effect cleanup.

- [ ] **Step 1: Write the failing bundle test**

Replace the old style/link tests in `packages/dsh/test/client.test.ts` with:

```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import { describe, expect, it, vi } from 'vitest';

const client = readFileSync(join(process.cwd(), 'packages', 'dsh', 'client.js'), 'utf8');

interface Definition {
  id: string;
  factory(require: (id: string) => unknown): {
    inject: string[];
    apply(ctx: unknown): void;
  };
}

function loadBundle(): Definition {
  const definitions: Definition[] = [];
  const window = {
    __ModuleLoader__: { load: (definition: Definition) => definitions.push(definition) },
  };
  runInNewContext(client, { window, document, console });
  const definition = definitions.at(-1);
  if (definition === undefined) throw new Error('client module was not registered');
  return definition;
}

function moduleRequire(id: string): unknown {
  if (id === 'react') return React;
  if (id === 'react-dom') return ReactDOM;
  if (id === 'react-dom/client') return ReactDOMClient;
  if (id === 'react/jsx-runtime') return ReactJSXRuntime;
  throw new Error(`unexpected require: ${id}`);
}

describe('DSH client bundle', () => {
  it('registers the module under the package id', () => {
    expect(loadBundle().id).toBe('@sir_yami/reviewd');
  });

  it('registers the panel and the settings plugin tab', () => {
    const loaded = loadBundle().factory(moduleRequire);
    const registrations: Array<{ name: string; id?: string; key?: string }> = [];
    const ctx = {
      effect: (setup: () => () => void) => setup(),
      slots: {
        inject: (_name: string, callback: () => void) => callback(),
        register: (config: { name: string; id?: string; key?: string }) => {
          registrations.push(config);
          return () => undefined;
        },
      },
    };

    loaded.apply(ctx);

    expect(registrations).toContainEqual(
      expect.objectContaining({ name: 'main', key: 'code-review' }),
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({ name: 'sidebar.panellist', id: 'code-review' }),
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({ name: 'settings.plugins.tab', id: 'code-review' }),
    );
    expect(document.head.querySelector('style[data-reviewd-native]')).not.toBeNull();
  });

  it('ships only scoped document selectors', () => {
    expect(client).toContain('.cr-native-scope');
    expect(client).not.toMatch(/(^|\n)\s*(html|body|:root|#root)\s*[{,]/);
  });
});
```

`ReactJSXRuntime` is imported as an ESM namespace at the top of the test; do not call Node's `require` from the Vitest ESM module.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/dsh/test/client.test.ts`
Expected: FAIL because the current `client.js` still registers the old thin panel and has no settings tab.

- [ ] **Step 3: Implement the client entry**

```tsx
import type { ComponentType } from 'react';
import { NativePanel } from './client/NativePanel.js';
import { SettingsTab } from './client/SettingsTab.js';

declare const __REVIEW_CSS__: string;

const PANEL_ID = 'code-review';

function Icon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <rect x="2" y="4" width="20" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 9h9M6 13h12M6 17h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="18" cy="16" r="4.5" fill="var(--dsw-alias-state-success-primary, #22c55e)" />
      <path
        d="m16.3 16 1.2 1.2 2.2-2.6"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ClientContext {
  effect?: (setup: () => () => void, label?: string) => void;
  slots: {
    inject(name: string, callback: () => void): void;
    register(
      config: { name: string; id?: string; key?: string; order?: number; label?: () => string },
      component: ComponentType,
    ): () => void;
  };
}

export const inject = ['slots'];

export function apply(ctx: ClientContext): void {
  ctx.effect?.(() => {
    const style = document.createElement('style');
    style.dataset.reviewdNative = 'true';
    style.textContent = __REVIEW_CSS__;
    document.head.append(style);
    return () => style.remove();
  }, 'reviewd: scoped styles');

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 12, label: () => 'Code Review' },
      Icon,
    ),
  );
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, NativePanel));
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      { name: 'settings.plugins.tab', id: PANEL_ID, order: 20, label: () => 'Code Review' },
      SettingsTab,
    ),
  );
}
```

If `ctx.effect` is absent in a test context, the style is not injected; production DSH supplies it. Do not append the style at module scope; the factory must stay side-effect-free.

- [ ] **Step 4: Add the build step**

In `scripts/build.mjs`, import and call the scoper before the client build:

```js
import { buildReviewCss } from './scope-review-css.mjs';

const dshClientEntry = join(root, 'packages/dsh/src/client.tsx');
const dshClientOut = join(root, 'packages/dsh/client.js');
const nativeCssPath = join(root, 'packages/dsh/src/client/native.css');
const reviewCss = await buildReviewCss({
  uiDir: join(root, 'packages/ui/src'),
  nativeCssPath,
});

await build({
  absWorkingDir: root,
  entryPoints: [dshClientEntry],
  outfile: dshClientOut,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  define: {
    __REVIEW_CSS__: JSON.stringify(reviewCss),
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.BASE_URL': JSON.stringify('/'),
    'import.meta.env.VITE_AUTH_MODE': JSON.stringify('dsh'),
  },
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  alias: {
    '@sir_yami/reviewd-ui': join(root, 'packages/ui/src/index.ts'),
    '@sir_yami/reviewd-core/browser': join(root, 'packages/core/src/browser.ts'),
    '@sir_yami/reviewd-core': join(root, 'packages/core/src/index.ts'),
  },
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      "  id: '@sir_yami/reviewd',",
      '  factory(require) {',
      '    var module = { exports: {} };',
      '    var exports = module.exports;',
    ].join('\n'),
  },
  footer: {
    js: '    return module.exports;\n  }\n});',
  },
  logLevel: 'info',
});
```

Place this after the two web builds and before the host bundle. `packages/dsh/client.js` must be regenerated and committed.

- [ ] **Step 5: Build and run the bundle test**

Run:

```bash
pnpm build
pnpm vitest run packages/dsh/test/client.test.ts packages/dsh/test/native-panel.test.tsx
```

Expected: PASS. If the VM test cannot load `react-dom/client`, adjust the test's module require mapping, not the production externals.

- [ ] **Step 6: Commit**

```bash
git add packages/dsh/src/client.tsx scripts/build.mjs packages/dsh/client.js packages/dsh/test/client.test.ts
git commit -m "feat(dsh): compile full native review client"
```

---

### Task 9: Prove native parity and settings behavior

**Files:**

- Modify: `packages/dsh/test/native-panel.test.tsx`

**Interfaces:**

- Consumes: native app from Tasks 5–8 and the existing review fixtures.
- Produces: tests that cover the full route surface, not only the list.

- [ ] **Step 1: Add route-level tests**

Use the existing `packages/web/test/reviewFixtures.ts` fixtures through relative imports. Add this helper and tests to `packages/dsh/test/native-panel.test.tsx`:

```tsx
import type { ReviewSummary } from '@sir_yami/reviewd-ui';
import { reviewView, snapshotR1, snapshotR2 } from '../../web/test/reviewFixtures.js';

const reviewSummary: ReviewSummary = {
  id: reviewView.review.id,
  title: reviewView.review.title,
  repoRoot: reviewView.review.repoRoot,
  status: reviewView.review.status,
  createdAt: reviewView.review.createdAt,
  roundCount: reviewView.review.rounds.length,
  commentCount: reviewView.review.comments.length,
  openCommentCount: reviewView.review.comments.filter((item) => item.state === 'open').length,
};

function reviewClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return client({
    listReviews: vi.fn(async () => ({
      items: [reviewSummary],
      total: 1,
      limit: 50,
      offset: 0,
    })),
    getReview: vi.fn(async () => reviewView),
    getSnapshot: vi.fn(async (_id: string, round: number) =>
      round === 2 ? snapshotR2 : snapshotR1,
    ),
    latestFeedback: vi.fn(async () => null),
    events: vi.fn(async () => ({ events: [], latestSeq: 0 })),
    ...overrides,
  });
}

it('opens a review detail from the list inside the native router', async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter('/');
  render(<NativePanel client={reviewClient()} router={router} />);
  await user.click(await screen.findByRole('link', { name: new RegExp(reviewView.review.title) }));
  expect(router.location()).toBe('/review/rev_01');
  expect(await screen.findByRole('heading', { name: reviewView.review.title })).toBeInTheDocument();
});
```

The review list link text is the review title from the fixture; do not hard-code a title that the fixture does not contain.

Add a settings interaction test:

```tsx
it('saves repository settings through the DSH tab', async () => {
  const user = userEvent.setup();
  const saveRepositories = vi.fn(async () => ({ repositories: [] }));
  render(
    <SettingsTab
      client={client({
        listRepositories: vi.fn(async () => ({
          repositories: [{ name: 'demo', path: '/srv/demo', defaultTarget: 'main' }],
        })),
        saveRepositories,
      })}
    />,
  );
  await screen.findByRole('heading', { name: 'Repositories' });
  await user.click(screen.getByRole('button', { name: 'Save repositories' }));
  await waitFor(() => expect(saveRepositories).toHaveBeenCalled());
});
```

`SettingsPage` already renders the `Save repositories` button and calls `saveRepositories`; do not rename the API method in the test or component.

- [ ] **Step 2: Run the native and shared tests**

Run:

```bash
pnpm vitest run packages/dsh/test/native-panel.test.tsx packages/web/test/review-detail.test.tsx packages/ui/test/review-detail-files-count.test.tsx packages/ui/test/full-file-dialog.test.tsx packages/ui/test/submit-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run all tests for regressions**

Run: `pnpm test`
Expected: PASS, including existing standalone tests.

- [ ] **Step 4: Commit**

```bash
git add packages/dsh/test/native-panel.test.tsx packages/web/test/review-detail.test.tsx
git commit -m "test(dsh): cover native review and settings routes"
```

If only `native-panel.test.tsx` changed, stage only that file.

---

### Task 10: Decide and document the embedded store override

**Files:**

- Modify: `packages/dsh/src/embedded.ts`
- Modify: `packages/dsh/test/embedded.test.ts`
- Modify: `packages/dsh/README.md`
- Modify: `docs/agents/dsh.md`

**Interfaces:**

- No default behavior change when `storeDir` is omitted.
- If `storeDir` starts with `~/`, expand it with `os.homedir()` before passing it to the daemon.

- [ ] **Step 1: Write the failing expansion test**

```ts
import { expandStoreDir } from '../src/embedded.js';

it('expands a leading home directory in storeDir', () => {
  expect(expandStoreDir('~/.local/share/code-review', '/home/tester')).toBe(
    '/home/tester/.local/share/code-review',
  );
  expect(expandStoreDir('~', '/home/tester')).toBe('/home/tester');
  expect(expandStoreDir('/var/lib/reviewd', '/home/tester')).toBe('/var/lib/reviewd');
});
```

Add the test to `packages/dsh/test/embedded.test.ts`; the helper is exported from `embedded.ts`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/dsh/test/embedded.test.ts`
Expected: FAIL because the helper/export is missing.

- [ ] **Step 3: Implement and document**

```ts
import { homedir } from 'node:os';

export function expandStoreDir(value: string, home = homedir()): string {
  if (value === '~') return home;
  return value.startsWith('~/') ? `${home}/${value.slice(2)}` : value;
}
```

Use it only at the embedded startup boundary:

```ts
const storeDir = expandStoreDir(
  options.storeDir ?? join(homedir(), '.local', 'share', 'dsh-code-review'),
);
```

Then pass `storeDir` to `startDaemon`. Do not change the default path or expand paths for the external daemon.

Docs must say:

- Default remains `$HOME/.local/share/dsh-code-review`.
- Set `storeDir: ~/.local/share/code-review` in the `code-review` Cordis config only when intentionally sharing the standalone store.
- Only one daemon may write a store at a time; stop the standalone daemon before starting an embedded daemon on the same store.

- [ ] **Step 4: Run the tests and docs check**

Run:

```bash
pnpm vitest run packages/dsh/test/config.test.ts packages/dsh/test/embedded.test.ts
pnpm docs:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dsh/src/embedded.ts packages/dsh/test/embedded.test.ts packages/dsh/README.md docs/agents/dsh.md
git commit -m "docs(dsh): support explicit shared store paths"
```

Only include files actually changed; do not stage unrelated WIP.

---

### Task 11: Update user-facing DSH documentation

**Files:**

- Modify: `packages/dsh/README.md`
- Modify: `docs/agents/dsh.md`
- Modify: `docs/features.md` if it describes the panel
- Test: `pnpm docs:check`

- [ ] **Step 1: Rewrite the panel description**

In `packages/dsh/README.md` and `docs/agents/dsh.md`, replace the “panel lists reviews, creates them and opens the full review SPA” description with:

- the panel renders the full native review workflow;
- the standalone SPA remains at `/code-review/` for direct links and fallback;
- repository settings are under DSH Settings → Built-in plugins → **Code Review**;
- the panel nav is Reviews / New review / Health;
- no token form or reviewd sidebar appears in DSH;
- embedded store sharing requires an explicit `storeDir` and one writer.

- [ ] **Step 2: Run the docs check**

Run: `pnpm docs:check`
Expected: PASS with no broken relative links.

- [ ] **Step 3: Commit**

```bash
git add packages/dsh/README.md docs/agents/dsh.md docs/features.md
git commit -m "docs(dsh): document native panel and settings tab"
```

---

### Task 12: Full verification and live DSH gate

**Files:** no source changes unless verification finds a defect.

- [ ] **Step 1: Run the full repository gates**

```bash
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs build → docs check → format → lint → typecheck → test → final build. Expected: all pass. If formatting fails, run `pnpm format:write` and retry; do not format unrelated WIP.

- [ ] **Step 2: Inspect the generated client artifact**

```bash
rg -n "__ModuleLoader__|cr-native-scope|settings.plugins.tab|react/jsx-runtime" packages/dsh/client.js | head -20
rg -n "(^|[^a-zA-Z-])(html|body|:root|#root)[[:space:]]*\\{" packages/dsh/client.js | head -20
```

Expected: module wrapper and scoped selectors present; the second search has no unscoped root selector. The CSS is embedded as an escaped string, so inspect the `style[data-reviewd-native]` path through the bundle test as the authoritative check.

- [ ] **Step 3: Live DSH verification — human gate**

Do not mutate `~/.dsh-canary/profiles/web` without the human partner's explicit approval. With approval:

1. Back up `package.json` and `cordis.patch.yml`.
2. Point the profile's `@sir_yami/reviewd` dependency at `/home/superuser/projects/dsh-code-review-fat/packages/dsh` or install the built tarball.
3. Ensure neither the old nor the new daemon is started twice on the same store.
4. Restart the DSH web host and open the existing GUI URL.
5. Open `Code Review`, create or open a review, exercise diff/full-file/comment/finding/submit/edit.
6. Open DSH Settings → Built-in plugins → **Code Review**, add/save a repository.
7. Capture a screenshot or transcript under `/tmp/reviewd-native-*.png` and record the exact DSH URL.

Without approval, mark this step `NOT RUN` and do not claim the feature is live-verified.

- [ ] **Step 4: Final report**

Report:

- commit hashes per task;
- `pnpm verify` result;
- `pnpm test:e2e` result;
- native test count;
- live DSH evidence path or `NOT RUN` with reason;
- any residual risk, especially external feedback deep links still opening the standalone SPA.

Do not publish or bump versions. The release is a separate change.

---

## Self-Review

**Spec coverage:**

- Native rendering, full parity, no iframe/Shadow DOM → Tasks 5–9.
- Compact nav without reviewd sidebar → Tasks 7 and 9.
- Settings in DSH Settings → Tasks 7–9; docs Task 11.
- Scoped CSS, theme, portal isolation → Tasks 3, 4, 6, 7.
- Generated client bundle → Task 8.
- Same daemon and explicit embedded store → Task 10.
- Standalone regression → Tasks 2, 5, 9, 12.
- Live verification → Task 12.

**Placeholder scan:** every task names concrete files, commands, and acceptance behavior. Test snippets use real component/page names from the repository. No TBD or “implement later” remains.

**Type consistency:** `Router`, `createMemoryRouter`, `ReviewAppProps`, `ReviewThemeOptions`, `PortalContainerRef`, `NativePanelProps`, and `SettingsTabProps` are defined before use. The settings tab uses `SettingsPage`, which already accepts only `client`.
