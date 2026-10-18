import React, { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useLang } from '../context/LangContext.js';
import { useInstall, type ManualRoute } from './InstallContext.js';

// Key used to carry the current view across an update reload (view name only, no user data).
export const PWA_RESTORE_KEY = 'naseej_pwa_restore_view';

const UPDATE_CHECK_MS = 60 * 60 * 1000; // look for a new version hourly while the app stays open
const UPDATE_REMIND_MS = 30 * 60 * 1000; // a deferred update banner returns after 30 minutes

const copy = {
  ar: {
    updateTitle: 'يتوفر إصدار جديد من نَسيج',
    updateBody: 'حدّث الآن للحصول على آخر التحسينات. سيُعاد تحميل الصفحة، فأنهِ ما تكتبه أولاً.',
    updateNow: 'تحديث الآن',
    later: 'لاحقاً',
    installTitle: 'ثبّت نَسيج على جهازك',
    installBody: 'وصول أسرع من شاشتك الرئيسية، ونافذة مستقلة بدون شريط المتصفح.',
    install: 'تثبيت',
    dismiss: 'إخفاء',
    close: 'إغلاق',
    stepsTitle: 'طريقة تثبيت نَسيج',
    steps: {
      'ios-safari': ['اضغط زر المشاركة في شريط سفاري.', 'مرّر لأسفل واختر «إضافة إلى الشاشة الرئيسية».', 'اضغط «إضافة».'],
      'ios-other': ['اضغط زر المشاركة أو قائمة المتصفح.', 'اختر «إضافة إلى الشاشة الرئيسية». إن لم يظهر الخيار، افتح الموقع في سفاري وكرّر الخطوات.', 'اضغط «إضافة».'],
      'safari-mac': ['من قائمة «ملف» في سفاري اختر «إضافة إلى Dock» (يتطلب macOS Sonoma أو أحدث).', 'اضغط «إضافة».'],
      menu: ['ابحث عن أيقونة التثبيت في شريط العنوان، أو افتح قائمة المتصفح (⋮ أو ⋯).', 'اختر «تثبيت نَسيج» أو «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'أكّد التثبيت.'],
      none: [],
    } as Record<ManualRoute, string[]>,
    offlineTitle: 'لا يوجد اتصال بالإنترنت',
    offlineBody: 'تُفتح واجهة نَسيج بدون اتصال، لكن السجلات الصحية والمواعيد والرسائل والمستندات تحتاج إلى اتصال ولا تُحفظ على جهازك. لن يُرسل أي إجراء حتى يعود الاتصال.',
    retry: 'إعادة المحاولة',
    checking: 'جارٍ التحقق…',
    stillOffline: 'ما زال الاتصال غير متوفر.',
  },
  en: {
    updateTitle: 'A new version of Naseej is available',
    updateBody: 'Update now for the latest improvements. The page will reload, so finish anything you are typing first.',
    updateNow: 'Update now',
    later: 'Later',
    installTitle: 'Install Naseej on your device',
    installBody: 'Open it faster from your home screen or desktop, in its own window without browser bars.',
    install: 'Install',
    dismiss: 'Dismiss',
    close: 'Close',
    stepsTitle: 'How to install Naseej',
    steps: {
      'ios-safari': ["Tap the Share button in Safari's toolbar.", 'Scroll down and choose "Add to Home Screen".', 'Tap "Add".'],
      'ios-other': ['Tap the Share button or the browser menu.', 'Choose "Add to Home Screen". If it is missing, open this site in Safari and repeat the steps.', 'Tap "Add".'],
      'safari-mac': ['In Safari, choose File > "Add to Dock" (requires macOS Sonoma or later).', 'Click "Add".'],
      menu: ['Look for the install icon in the address bar, or open the browser menu (⋮ or ⋯).', 'Choose "Install Naseej", "Install app" or "Add to Home Screen".', 'Confirm the installation.'],
      none: [],
    } as Record<ManualRoute, string[]>,
    offlineTitle: 'You are offline',
    offlineBody: 'The Naseej interface opens offline, but health records, appointments, messages and documents need a connection and are not stored on this device. Nothing you submit is sent until you are back online.',
    retry: 'Retry',
    checking: 'Checking…',
    stillOffline: 'Still no connection.',
  },
} as const;

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
  const { canPrompt, available, manualRoute, helpOpen, closeHelp, suggestionAllowed, dismissSuggestion, install } = useInstall();

  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateDeferred, setUpdateDeferred] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [retryState, setRetryState] = useState<'idle' | 'checking' | 'failed'>('idle');
  const helpRef = useRef<HTMLDivElement>(null);

  // Registered in production builds and, via the plugin's devOptions, under vite dev.
  useEffect(() => {
    let timer: number | undefined;
    let onVisible: (() => void) | undefined;
    // immediate: this effect may run after the window "load" event, which the default would wait for.
    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onRegisteredSW: (_url, reg) => {
        if (!reg) return;
        const check = () => {
          if (navigator.onLine) void reg.update().catch(() => {});
        };
        timer = window.setInterval(check, UPDATE_CHECK_MS);
        onVisible = () => document.visibilityState === 'visible' && check();
        document.addEventListener('visibilitychange', onVisible);
      },
      onRegisterError: (err) => console.warn('Service worker registration failed; the app keeps working without offline support.', err),
    });
    setUpdateSW(() => update);
    return () => {
      window.clearInterval(timer);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // A deferred update comes back later so users do not stay on an old version indefinitely.
  useEffect(() => {
    if (!updateDeferred) return;
    const id = window.setTimeout(() => setUpdateDeferred(false), UPDATE_REMIND_MS);
    return () => window.clearTimeout(id);
  }, [updateDeferred]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      setRetryState('idle');
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // navigator.onLine can be wrong, so Retry makes a real, uncached request to the app's own origin.
  const retry = useCallback(async () => {
    setRetryState('checking');
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}manifest.webmanifest?ping=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('offline');
      setOnline(true);
      setRetryState('idle');
    } catch {
      setRetryState('failed');
    }
  }, []);

  // Move focus into the instructions when they open so keyboard and screen-reader users land on them.
  useEffect(() => {
    if (helpOpen) helpRef.current?.focus();
  }, [helpOpen]);

  const doUpdate = () => {
    try {
      sessionStorage.setItem(PWA_RESTORE_KEY, currentView);
    } catch {
      /* the app simply reopens on the home view */
    }
    void updateSW?.(true); // activates the waiting worker and reloads
  };

  const showUpdate = needRefresh && !updateDeferred;
  // The proactive suggestion appears only on the public home view, never inside a clinical workspace.
  const showSuggestion = available && suggestionAllowed && currentView === 'home' && !helpOpen;
  const steps = c.steps[manualRoute];

  return (
    <div
      className="pwa-prompt-stack"
      style={{
        position: 'fixed',
        insetInline: 16,
        bottom: 'max(16px, env(safe-area-inset-bottom))',
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
          <strong style={{ fontSize: 15 }}>{c.offlineTitle}</strong>
          <span>{c.offlineBody}</span>
          <div style={row}>
            <button type="button" className="btn-pill btn-pill-brand" style={small} onClick={() => void retry()} disabled={retryState === 'checking'}>
              {retryState === 'checking' ? c.checking : c.retry}
            </button>
            {retryState === 'failed' && <span role="status" style={{ alignSelf: 'center' }}>{c.stillOffline}</span>}
          </div>
        </div>
      )}

      {showUpdate && (
        <div role="region" aria-label={c.updateTitle} className="motion-toast-enter" style={{ ...cardStyle, maxWidth: 420 }}>
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

      {showSuggestion && (
        <div role="region" aria-label={c.installTitle} className="motion-toast-enter" style={{ ...cardStyle, maxWidth: 360 }}>
          <strong style={{ fontSize: 15 }}>{c.installTitle}</strong>
          <span>{c.installBody}</span>
          <div style={row}>
            <button type="button" className="btn-pill btn-pill-cloud" style={small} onClick={() => void install()}>
              {c.install}
            </button>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ ...small, ...onDark }} onClick={dismissSuggestion}>
              {c.dismiss}
            </button>
          </div>
        </div>
      )}

      {helpOpen && !canPrompt && steps.length > 0 && (
        <div
          ref={helpRef}
          tabIndex={-1}
          role="dialog"
          aria-labelledby="pwa-steps-title"
          className="motion-toast-enter"
          onKeyDown={(e) => e.key === 'Escape' && closeHelp()}
          style={{ ...cardStyle, maxWidth: 380 }}
        >
          <strong id="pwa-steps-title" style={{ fontSize: 15 }}>{c.stepsTitle}</strong>
          <ol style={{ margin: 0, paddingInlineStart: 20 }}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div style={row}>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ ...small, ...onDark }} onClick={closeHelp}>
              {c.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
