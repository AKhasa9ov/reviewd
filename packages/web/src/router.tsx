import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { BASE_PATH, normalizeBase, withBase } from './base.js';

export interface Router {
  location(): string;
  subscribe(listener: () => void): () => void;
  navigate(to: string, options?: { replace?: boolean }): void;
  href(to: string): string;
}

const RouterContext = createContext<Router | null>(null);

export function createBrowserRouter(base = BASE_PATH): Router {
  const listeners = new Set<() => void>();
  const read = (): string =>
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
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

/*
 * Created eagerly in a DOM so the `popstate` listener lives for the whole page.
 * Kept null outside a DOM so node-environment tests can import `parseRoute`.
 */
const browserRouter: Router | null = typeof window === 'undefined' ? null : createBrowserRouter();

function getBrowserRouter(): Router {
  if (browserRouter === null) {
    throw new Error('The browser router is unavailable outside a DOM environment.');
  }
  return browserRouter;
}

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
  const router = useContext(RouterContext) ?? getBrowserRouter();
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
  getBrowserRouter().navigate(to, options);
}

export type Route =
  | { name: 'list' }
  | { name: 'review'; id: string }
  | { name: 'edit-review'; id: string }
  | { name: 'new' }
  | { name: 'auth' }
  | { name: 'health' }
  | { name: 'settings' }
  | { name: 'not-found'; path: string };

export function parseRoute(location: string, base = BASE_PATH): Route {
  const url = new URL(location, 'http://local');
  const normalizedBase = normalizeBase(base);
  let pathname = url.pathname;
  if (normalizedBase !== '') {
    if (pathname === normalizedBase) pathname = '/';
    else if (pathname.startsWith(`${normalizedBase}/`)) {
      pathname = pathname.slice(normalizedBase.length);
    }
  }
  pathname = pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/') return { name: 'list' };
  if (pathname === '/new') return { name: 'new' };
  if (pathname === '/auth') return { name: 'auth' };
  if (pathname === '/health') return { name: 'health' };
  if (pathname === '/settings') return { name: 'settings' };
  const editMatch = /^\/review\/([^/]+)\/edit$/.exec(pathname);
  if (editMatch?.[1] !== undefined) {
    let id = editMatch[1];
    try {
      id = decodeURIComponent(editMatch[1]);
    } catch {
      // Keep a malformed percent escape as-is instead of crashing the shell.
    }
    return { name: 'edit-review', id };
  }
  const match = /^\/review\/([^/]+)$/.exec(pathname);
  if (match?.[1] !== undefined) {
    let id = match[1];
    try {
      id = decodeURIComponent(match[1]);
    } catch {
      // Keep a malformed percent escape as-is instead of crashing the shell.
    }
    return { name: 'review', id };
  }
  return { name: 'not-found', path: pathname };
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
}

export function Link({ to, children, onClick, ...rest }: LinkProps): JSX.Element {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (rest.target === '_blank' || rest.download !== undefined) return;
    event.preventDefault();
    router.navigate(to);
  }

  return (
    <a {...rest} href={router.href(to)} onClick={handleClick}>
      {children}
    </a>
  );
}

/** Close the mobile drawer when the route changes. */
export function useCloseOnNavigate(close: () => void): void {
  const location = useLocation();
  useEffect(() => {
    close();
  }, [close, location]);
}
