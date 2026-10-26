import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'cr-theme';
export const DEFAULT_THEME: Theme = 'dark';

function readStoredTheme(): Theme {
  try {
    const value = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
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
}

export function ThemeProvider({
  children,
  initialTheme,
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => initialTheme ?? readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      globalThis.localStorage?.setItem(storageKey, theme);
    } catch {
      // Storage can be unavailable in private mode; the in-memory theme still works.
    }
  }, [storageKey, theme]);

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
