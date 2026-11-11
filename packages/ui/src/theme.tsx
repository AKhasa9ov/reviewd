import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'cr-theme';
export const DEFAULT_THEME: Theme = 'dark';

function readStoredTheme(storageKey = THEME_STORAGE_KEY): Theme {
  try {
    const value = globalThis.localStorage?.getItem(storageKey);
    return value === 'light' ? 'light' : 'dark';
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(
  theme: Theme,
  root: Pick<HTMLElement, 'dataset'> = document.documentElement,
): void {
  root.dataset.theme = theme;
}

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

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

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
