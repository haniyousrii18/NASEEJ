import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIosSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};

interface InstallContextValue {
  /** The browser offered a native install prompt (Chrome, Edge, Android). */
  canPrompt: boolean;
  /** Install is possible by some route: native prompt, or manual steps on iOS Safari. */
  available: boolean;
  /** iOS Safari has no prompt API, so the manual steps are shown instead. */
  showIosHelp: boolean;
  closeIosHelp: () => void;
  install: () => Promise<void>;
}

const InstallContext = createContext<InstallContextValue>({
  canPrompt: false,
  available: false,
  showIosHelp: false,
  closeIosHelp: () => {},
  install: async () => {},
});

/**
 * Holds the one-shot `beforeinstallprompt` event so the install toast and the site-bar button
 * can both use it. Nothing is stored; the app is simply hidden once it is installed or running standalone.
 */
export const InstallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (event) {
      await event.prompt();
      await event.userChoice;
      setEvent(null); // the event can only be used once
    } else {
      // No native prompt (iOS Safari, Firefox, dev server, or criteria not met yet): show manual steps.
      setShowIosHelp(true);
    }
  }, [event]);

  const closeIosHelp = useCallback(() => setShowIosHelp(false), []);

  const value = useMemo<InstallContextValue>(
    () => ({
      canPrompt: !installed && !!event,
      available: !installed,
      showIosHelp: !installed && showIosHelp,
      closeIosHelp,
      install,
    }),
    [installed, event, showIosHelp, closeIosHelp, install],
  );

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
};

export const useInstall = () => useContext(InstallContext);
