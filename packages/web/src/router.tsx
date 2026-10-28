import { useEffect, useSyncExternalStore } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { BASE_PATH, normalizeBase, withBase } from './base.js';

const NAVIGATE_EVENT = 'cr:navigate';
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onPop = (): void => listener();
  window.addEventListener('popstate', onPop);
  window.addEventListener(NAVIGATE_EVENT, onPop);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', onPop);
    window.removeEventListener(NAVIGATE_EVENT, onPop);
  };
}

function snapshot(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function emit(): void {
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const target = withBase(to);
  if (options.replace === true) window.history.replaceState({}, '', target);
  else window.history.pushState({}, '', target);
  emit();
}

export function useLocation(): string {
  return useSyncExternalStore(subscribe, snapshot, () => '/');
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
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (rest.target === '_blank' || rest.download !== undefined) return;
    event.preventDefault();
    navigate(to);
  }

  return (
    <a {...rest} href={withBase(to)} onClick={handleClick}>
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
