import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

// Only the preference word is stored (never user data). The inline script in index.html reads
// the same key before first paint so the right theme is applied without a flash.
export const THEME_STORAGE_KEY = 'naseej_theme';
// The signed-in workspaces keep their own choice. It never changes the public site's preference above, and the
// public pages (landing, login, marketing) ignore it: it only applies while a workspace is mounted.
export const WORKSPACE_THEME_KEY = 'naseej_ws_theme';
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#faf7f4', dark: '#1a1411' };

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
  workspace: {
    theme: ResolvedTheme;
    setTheme: (theme: ResolvedTheme) => void;
    /** Called by the authenticated shell on mount and unmount so the workspace theme applies only inside it. */
    enter: () => void;
    leave: () => void;
  };
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const readPreference = (): ThemePreference => {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage blocked */
  }
  try {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    /* fallback to light */
  }
  return 'light';
};

const applyTheme = (theme: ResolvedTheme, animate: boolean) => {
  const root = document.documentElement;
  if (animate) {
    // Suspend transitions for a frame so the whole page flips at once.
    root.classList.add('theme-switching');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
};

const readWorkspaceTheme = (fallback: ResolvedTheme): ResolvedTheme => {
  try {
    const v = localStorage.getItem(WORKSPACE_THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage blocked */
  }
  return fallback;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(readPreference);
  const [wsActive, setWsActive] = useState(false);
  const [wsTheme, setWsThemeState] = useState<ResolvedTheme>(() => readWorkspaceTheme(readPreference()));

  const setWsTheme = useCallback((theme: ResolvedTheme) => {
    try {
      localStorage.setItem(WORKSPACE_THEME_KEY, theme);
    } catch {
      /* choice lasts for this page view only */
    }
    setWsThemeState(theme);
  }, []);
  const enter = useCallback(() => setWsActive(true), []);
  const leave = useCallback(() => setWsActive(false), []);

  const setPreference = useCallback((pref: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      /* choice lasts for this page view only */
    }
    setPreferenceState(pref);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(preference === 'dark' ? 'light' : 'dark');
  }, [preference, setPreference]);

  // Apply whenever the preference changes, or while a workspace is open, its own theme instead.
  useEffect(() => {
    setResolved(preference);
    applyTheme(wsActive ? wsTheme : preference, true);
  }, [preference, wsActive, wsTheme]);

  // Keep other open tabs in step with a change made in this one.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setPreferenceState(readPreference());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggleTheme, workspace: { theme: wsTheme, setTheme: setWsTheme, enter, leave } }),
    [preference, resolved, setPreference, toggleTheme, wsTheme, setWsTheme, enter, leave],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
