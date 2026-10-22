import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// Only the preference word is stored (never user data). The inline script in index.html reads
// the same key before first paint so the right theme is applied without a flash.
export const THEME_STORAGE_KEY = 'naseej_theme';
// The signed-in workspaces keep their own choice. It never changes the public site's preference above, and the
// public pages (landing, login, marketing) ignore it: it only applies while a workspace is mounted.
export const WORKSPACE_THEME_KEY = 'naseej_ws_theme';
// Browser chrome colour per theme: the --background token of each theme (theme.css). Keep in sync with index.html.
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f7f9f8', dark: '#101b22' };

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
  workspace: {
    /** What the workspace is showing right now (a preference of "system" is already resolved). */
    theme: ResolvedTheme;
    preference: ThemePreference;
    setPreference: (pref: ThemePreference) => void;
    setTheme: (theme: ResolvedTheme) => void;
    /** Called by the authenticated shell on mount and unmount so the workspace theme applies only inside it. */
    enter: () => void;
    leave: () => void;
  };
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'system';

const systemTheme = (): ResolvedTheme => {
  try {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    /* fallback to light */
  }
  return 'light';
};

const resolve = (pref: ThemePreference): ResolvedTheme => (pref === 'system' ? systemTheme() : pref);

const readStored = (key: string, fallback: ThemePreference): ThemePreference => {
  try {
    const v = localStorage.getItem(key);
    if (isPreference(v)) return v;
  } catch {
    /* storage blocked */
  }
  return fallback;
};

const store = (key: string, pref: ThemePreference) => {
  try {
    localStorage.setItem(key, pref);
  } catch {
    /* choice lasts for this page view only */
  }
};

const applyTheme = (theme: ResolvedTheme, animate: boolean) => {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  if (animate) {
    // Suspend transitions for a frame so the whole page flips at once.
    root.classList.add('theme-switching');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
};

/** True while the operating system prefers dark; re-renders when it changes. */
const useSystemTheme = (): ResolvedTheme => {
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return system;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStored(THEME_STORAGE_KEY, 'system'));
  const [wsPreference, setWsPreferenceState] = useState<ThemePreference>(() =>
    readStored(WORKSPACE_THEME_KEY, readStored(THEME_STORAGE_KEY, 'system')),
  );
  const [wsActive, setWsActive] = useState(false);
  const system = useSystemTheme();

  const resolved: ResolvedTheme = preference === 'system' ? system : preference;
  const wsTheme: ResolvedTheme = wsPreference === 'system' ? system : wsPreference;

  const setWsPreference = useCallback((pref: ThemePreference) => {
    store(WORKSPACE_THEME_KEY, pref);
    setWsPreferenceState(pref);
  }, []);
  const setWsTheme = useCallback((theme: ResolvedTheme) => setWsPreference(theme), [setWsPreference]);
  const enter = useCallback(() => setWsActive(true), []);
  const leave = useCallback(() => setWsActive(false), []);

  const setPreference = useCallback((pref: ThemePreference) => {
    store(THEME_STORAGE_KEY, pref);
    setPreferenceState(pref);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolve(preference) === 'dark' ? 'light' : 'dark');
  }, [preference, setPreference]);

  // Apply whenever the resolved theme changes, or while a workspace is open, its own theme instead.
  useEffect(() => {
    applyTheme(wsActive ? wsTheme : resolved, true);
  }, [resolved, wsActive, wsTheme]);

  // Keep other open tabs in step with a change made in this one.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setPreferenceState(readStored(THEME_STORAGE_KEY, 'system'));
      if (e.key === WORKSPACE_THEME_KEY) setWsPreferenceState(readStored(WORKSPACE_THEME_KEY, 'system'));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference,
      toggleTheme,
      workspace: { theme: wsTheme, preference: wsPreference, setPreference: setWsPreference, setTheme: setWsTheme, enter, leave },
    }),
    [preference, resolved, setPreference, toggleTheme, wsTheme, wsPreference, setWsPreference, setWsTheme, enter, leave],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
