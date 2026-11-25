import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

// Only the preference word is stored (never user data). The inline script in index.html reads
// the same key before first paint so the right theme is applied without a flash.
export const THEME_STORAGE_KEY = 'naseej_theme';
// One theme everywhere: signing in or out never changes it. An older build kept a separate workspace choice
// under this key; it is ignored now and cleaned up on load.
const LEGACY_WORKSPACE_THEME_KEY = 'naseej_ws_theme';
// Browser chrome colour per theme: the --background token of each theme (theme.css). Keep in sync with index.html.
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f7f9f8', dark: '#101b22' };

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
  /** Show this theme without saving it (null goes back to the saved choice). */
  setTransient: (theme: ResolvedTheme | null) => void;
  workspace: {
    /** What the workspace is showing right now. */
    theme: ResolvedTheme;
    preference: ThemePreference;
    setPreference: (pref: ThemePreference) => void;
    setTheme: (theme: ResolvedTheme) => void;
    /** Kept for the authenticated shell's mount/unmount effect; the theme no longer changes with auth state. */
    enter: () => void;
    leave: () => void;
  };
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark';

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

// A visitor with no saved choice (or an old "match system" one) starts from what the device prefers once; after that only light or dark.
const readStored = (key: string, fallback: ThemePreference = systemTheme()): ThemePreference => {
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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStored(THEME_STORAGE_KEY));
  // A theme asked for by a link (the clinician's QR page). It wins while set and is never stored.
  const [transient, setTransient] = useState<ResolvedTheme | null>(null);

  const resolved: ResolvedTheme = preference;

  const setPreference = useCallback((pref: ThemePreference) => {
    store(THEME_STORAGE_KEY, pref);
    setPreferenceState(pref);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(preference === 'dark' ? 'light' : 'dark');
  }, [preference, setPreference]);

  // Signing in or out never touches the theme: the workspace shows the same stored preference as the public pages.
  const enter = useCallback(() => {}, []);
  const leave = useCallback(() => {}, []);

  // Apply whenever the resolved theme changes (a link theme wins while set).
  useEffect(() => {
    applyTheme(transient ?? resolved, true);
  }, [transient, resolved]);

  // Drop the retired workspace-specific key so no stale choice lingers.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_WORKSPACE_THEME_KEY);
    } catch {
      /* storage blocked */
    }
  }, []);

  // Keep other open tabs in step with a change made in this one.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setPreferenceState(readStored(THEME_STORAGE_KEY));
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
      setTransient,
      workspace: { theme: resolved, preference, setPreference, setTheme: setPreference, enter, leave },
    }),
    [preference, resolved, setPreference, toggleTheme, enter, leave],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
