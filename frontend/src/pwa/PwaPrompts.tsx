import React, { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useLang } from '../context/LangContext.js';
import { isIosSafari, isStandalone, useInstall } from './InstallContext.js';

// Key used to carry the current view across an update reload (view name only, no user data).
export const PWA_RESTORE_KEY = 'naseej_pwa_restore_view';

const INSTALL_DISMISSED_KEY = 'naseej_pwa_install_dismissed';

const copy = {
  ar: {
    updateTitle: 'يتوفر إصدار جديد من نَسيج',
    updateBody: 'حدّث الآن للحصول على آخر التحسينات. سيُعاد تحميل الصفحة، فأنهِ ما تكتبه أولاً.',
    updateNow: 'تحديث الآن',
    later: 'لاحقاً',
    installTitle: 'ثبّت نَسيج على جهازك',
    installBody: 'وصول أسرع وتجربة بملء الشاشة.',
    install: 'تثبيت',
    dismiss: 'إخفاء',
    iosBody: 'اضغط زر المشاركة في سفاري ثم «إضافة إلى الشاشة الرئيسية».',
    manualBody: 'من قائمة المتصفح (⋮ أو ⋯) اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». التثبيت يعمل على النسخة المنشورة عبر HTTPS وليس على خادم التطوير.',
    offline: 'أنت غير متصل بالإنترنت. لا تتوفر بيانات حديثة، وقد لا تعمل الإجراءات التي تتطلب الاتصال.',
  },
  en: {
    updateTitle: 'A new version of Naseej is available',
    updateBody: 'Update now for the latest improvements. The page will reload, so finish anything you are typing first.',
    updateNow: 'Update now',
    later: 'Later',
    installTitle: 'Install Naseej on your device',
    installBody: 'Faster access and a full-screen experience.',
    install: 'Install',
    dismiss: 'Dismiss',
    iosBody: 'Tap the Share button in Safari, then "Add to Home Screen".',
    manualBody: 'Open your browser menu (⋮ or ⋯) and choose "Install app" or "Add to Home Screen". Installing works on the published HTTPS build, not the dev server.',
    offline: 'You are offline. Live data is unavailable and actions that need a connection may not work.',
  },
} as const;

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface-inverse)',
  color: 'var(--color-text-inverse)',
  borderRadius: 'var(--radius-2xl)',
  padding: '14px 16px',
  boxShadow: 'var(--shadow-md-2)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontSize: 14,
  lineHeight: 1.5,
  pointerEvents: 'auto',
};

const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const small: React.CSSProperties = { fontSize: 14, padding: '6px 14px' };
const onDark: React.CSSProperties = {
  color: 'var(--color-text-inverse)',
  borderColor: 'color-mix(in srgb, var(--color-text-inverse) 35%, transparent)',
};

export const PwaPrompts: React.FC<{ currentView: string }> = ({ currentView }) => {
  const { lang } = useLang();
  const c = copy[lang];

  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateDeferred, setUpdateDeferred] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  const { canPrompt, showIosHelp, closeIosHelp, install } = useInstall();
  const [installDismissed, setInstallDismissed] = useState(readDismissed);
  const [online, setOnline] = useState(() => navigator.onLine);

  // Service worker is only registered in production builds (the plugin has devOptions.enabled = false).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    // immediate: this effect may run after the window "load" event, which the default would wait for.
    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onRegisterError: (err) => console.warn('Service worker registration failed', err),
    });
    setUpdateSW(() => update);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      /* storage unavailable: dismissal lasts for this page view only */
    }
  }, []);

  const doUpdate = () => {
    try {
      sessionStorage.setItem(PWA_RESTORE_KEY, currentView);
    } catch {
      /* the app simply reopens on the home view */
    }
    void updateSW?.(true); // activates the waiting worker and reloads
  };

  const standalone = isStandalone();
  const showUpdate = needRefresh && !updateDeferred;
  const showInstall = false; // Hidden per user request
  const showIos = false; // Hidden per user request

  return (
    <div
      aria-live="polite"
      className="pwa-prompt-stack"
      style={{
        position: 'fixed',
        insetInline: 16,
        bottom: 16,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {!online && (
        <div role="status" className="motion-toast-enter" style={{ ...cardStyle, maxWidth: 420, background: 'var(--color-cloud-card)', color: 'var(--color-ink)', border: '1px solid var(--color-status-draft-border)' }}>
          {c.offline}
        </div>
      )}

      {showUpdate && (
        <div role="alertdialog" aria-label={c.updateTitle} className="motion-toast-enter" style={{ ...cardStyle, maxWidth: 420 }}>
          <strong style={{ fontSize: 15 }}>{c.updateTitle}</strong>
          <span>{c.updateBody}</span>
          <div style={row}>
            <button type="button" className="btn-pill btn-pill-cloud" style={small} onClick={doUpdate}>
              {c.updateNow}
            </button>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ ...small, ...onDark }} onClick={() => setUpdateDeferred(true)}>
              {c.later}
            </button>
          </div>
        </div>
      )}

      {showInstall && (
        <div role="dialog" aria-label={c.installTitle} className="motion-toast-enter" style={{ ...cardStyle, maxWidth: 360 }}>
          <strong style={{ fontSize: 15 }}>{c.installTitle}</strong>
          <span>{c.installBody}</span>
          <div style={row}>
            <button type="button" className="btn-pill btn-pill-cloud" style={small} onClick={() => void install()}>
              {c.install}
            </button>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ ...small, ...onDark }} onClick={dismissInstall}>
              {c.dismiss}
            </button>
          </div>
        </div>
      )}

      {showIos && (
        <div role="dialog" aria-label={c.installTitle} className="motion-toast-enter" style={{ ...cardStyle, maxWidth: 360 }}>
          <strong style={{ fontSize: 15 }}>{c.installTitle}</strong>
          <span>{isIosSafari() ? c.iosBody : c.manualBody}</span>
          <div style={row}>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ ...small, ...onDark }} onClick={() => { dismissInstall(); closeIosHelp(); }}>
              {c.dismiss}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
