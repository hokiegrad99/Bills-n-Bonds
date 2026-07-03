import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Theme } from '../../lib/types';
import { useHoldings } from '../../lib/storage';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, setSettings } = useHoldings();
  const theme = settings.theme;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Apply theme to <html> for Tailwind class strategy.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggle = useCallback(() => {
    setSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, setSettings]);

  const setTheme = useCallback((t: Theme) => setSettings({ theme: t }), [setSettings]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggle, setTheme }),
    [theme, toggle, setTheme],
  );

  // Avoid children rendering with theme-mismatch; harmless after first mount.
  void mounted;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
