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
