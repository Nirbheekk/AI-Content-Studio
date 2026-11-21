'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'aicos-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initial: ThemeMode =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setThemeState(initial);

    const apply = (mode: ThemeMode) => {
      const nextResolved: ResolvedTheme = mode === 'system' ? getSystemTheme() : mode;
      setResolvedTheme(nextResolved);
      document.documentElement.classList.toggle('dark', nextResolved === 'dark');
    };

    apply(initial);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      const current = (window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? 'system';
      if (current === 'system') apply('system');
    };
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
    const nextResolved: ResolvedTheme = mode === 'system' ? getSystemTheme() : mode;
    setResolvedTheme(nextResolved);
    document.documentElement.classList.toggle('dark', nextResolved === 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
