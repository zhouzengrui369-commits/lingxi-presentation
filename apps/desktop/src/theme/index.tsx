/**
 * 主题入口 — ThemeProvider + useTheme + 切换 hook
 * 灵犀演示 · Phase 1 · T-1.0.b
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { lightTheme, Theme as LightTheme } from './light';
import { darkTheme, Theme as DarkTheme } from './dark';

export type ThemeMode = 'light' | 'dark';

export interface ThemeContextValue {
  mode: ThemeMode;
  theme: LightTheme | DarkTheme;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode; initialMode?: ThemeMode }> = ({
  children,
  initialMode = 'light',
}) => {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const toggle = useCallback(() => {
    setMode(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme: mode === 'light' ? lightTheme : darkTheme,
      toggle,
      setMode,
    }),
    [mode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
};
