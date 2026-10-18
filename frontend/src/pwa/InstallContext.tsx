import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * How installation can be started when the browser gives no programmatic prompt.
 * - ios-safari / ios-other: Share sheet > Add to Home Screen (iOS 16.4+ also offers it in other iOS browsers).
 * - safari-mac: Safari 17+ File > Add to Dock.
 * - menu: Chromium-family browsers, install from the address bar or the browser menu.
 * - none: no install route exists (for example desktop Firefox), so the action is not offered.
 */
export type ManualRoute = 'ios-safari' | 'ios-other' | 'safari-mac' | 'menu' | 'none';

export const detectManualRoute = (): ManualRoute => {
  const ua = navigator.userAgent;
  const ipadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPadOS reports a Mac UA
  if (/iPad|iPhone|iPod/.test(ua) || ipadOs) {
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  }
  const isFirefox = /Firefox\//.test(ua);
  if (isFirefox) return 'none';
  const isChromium = /Chrome\/|Chromium\/|Edg\/|OPR\/|SamsungBrowser\//.test(ua);
  if (isChromium) return 'menu';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'safari-mac';
  return 'none';
};

export const isStandalone = () =>
  ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
    (m) => window.matchMedia(`(display-mode: ${m})`).matches,
  ) || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const DISMISS_KEY = 'naseej_pwa_install_dismissed_at';
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000; // do not nag again for 30 days

const readDismissed = (): boolean => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
};

interface InstallContextValue {
  /** The browser offered a native install prompt (Chrome, Edge, Android). */
  canPrompt: boolean;
  /** Install is possible by some route: native prompt, or manual steps. False once installed. */
  available: boolean;
  /** Which manual instructions apply when there is no native prompt. */
  manualRoute: ManualRoute;
  /** The instructions panel is open. */
  helpOpen: boolean;
  closeHelp: () => void;
  /** The user has not dismissed the proactive install suggestion recently. */
  suggestionAllowed: boolean;
  dismissSuggestion: () => void;
  install: () => Promise<void>;
}

const InstallContext = createContext<InstallContextValue>({
  canPrompt: false,
  available: false,
  manualRoute: 'none',
  helpOpen: false,
  closeHelp: () => {},
  suggestionAllowed: false,
  dismissSuggestion: () => {},
  install: async () => {},
});

/**
 * Holds the one-shot `beforeinstallprompt` event so the suggestion toast and the site-bar button can share it.
 * Only a dismissal timestamp is stored. The action disappears once the app runs installed.
 */
export const InstallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [helpOpen, setHelpOpen] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const manualRoute = useMemo(detectManualRoute, []);
  // Installation requires a secure context (HTTPS, or localhost for development).
  const secure = window.isSecureContext;

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const onMode = () => setInstalled(isStandalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setHelpOpen(false);
      setInstalled(true);
    };
    mq.addEventListener?.('change', onMode);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      mq.removeEventListener?.('change', onMode);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismissSuggestion = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage unavailable: dismissal lasts for this page view only */
    }
  }, []);

  const install = useCallback(async () => {
    if (!event) {
      setHelpOpen(true);
      return;
    }
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      // "installed" state comes from the appinstalled event, never from assuming success here.
      if (outcome === 'dismissed') dismissSuggestion();
    } catch {
      setHelpOpen(true); // prompt() can reject if it was already used; fall back to the manual steps
    }
    setEvent(null); // the event can only be used once
  }, [event, dismissSuggestion]);

  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const value = useMemo<InstallContextValue>(() => {
    const canPrompt = !installed && !!event;
    return {
      canPrompt,
      available: secure && !installed && (canPrompt || manualRoute !== 'none'),
      manualRoute,
      helpOpen: !installed && helpOpen,
      closeHelp,
      suggestionAllowed: !dismissed,
      dismissSuggestion,
      install,
    };
  }, [installed, event, secure, manualRoute, helpOpen, closeHelp, dismissed, dismissSuggestion, install]);

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
};

export const useInstall = () => useContext(InstallContext);
