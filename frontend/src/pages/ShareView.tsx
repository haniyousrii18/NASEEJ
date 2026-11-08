import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SnapshotView, type Snapshot } from '../app/health/SnapshotView.js';
import { appT } from '../app/i18n/index.js';
import { AppIcon } from '../app/AppIcons.js';
import { ShareTranslationProvider } from '../app/translate/TranslationContext.js';
import { formatDate, fill } from '../app/format.js';
import { useTheme } from '../context/ThemeContext.js';
import '../styles/share.css';

/**
 * What a clinician sees after scanning a patient's QR code: a read-only page, no account and no app.
 * The token is the part of the address after "#/share/". Browsers never send the fragment to a server, so it is not in
 * any access log or referrer. It is posted in the body to the API and kept only in memory.
 * Health content is held in component state only: nothing here is written to browser storage.
 */
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: Snapshot; expiresAt: string }
  | { kind: 'error'; code: string };

export const readShareToken = (): string | null => {
  const m = /^#\/share\/([A-Za-z0-9_-]{20,64})(?:\?[^#]*)?$/.exec(window.location.hash);
  return m ? m[1] : null;
};

/** The theme the patient was using when the link was made ("t=d" dark, "t=l" light), or null when the link says nothing. */
const readShareTheme = (): 'light' | 'dark' | null => {
  const q = window.location.hash.split('?')[1];
  const t = q ? new URLSearchParams(q).get('t') : null;
  return t === 'd' ? 'dark' : t === 'l' ? 'light' : null;
};

export const isShareRoute = () => window.location.hash.startsWith('#/share/');

export const ShareView: React.FC = () => {
  const [token] = useState(readShareToken);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [docError, setDocError] = useState('');
  const [uiLang, setUiLang] = useState<'ar' | 'en'>(() => (document.documentElement.lang === 'en' ? 'en' : 'ar'));
  // Once the reader picks a language it stays, whatever language the summary was approved in.
  const chosen = useRef(false);
  const { setTransient } = useTheme();

  // Open in the patient's theme, without saving it as the clinician's own choice.
  useEffect(() => {
    const sync = () => setTransient(readShareTheme());
    sync();
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      setTransient(null);
    };
  }, [setTransient]);

  const load = useCallback(async () => {
    if (!token) return setState({ kind: 'error', code: 'SHARE_NOT_FOUND' });
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/share-view/view', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store', referrerPolicy: 'no-referrer' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        if (!chosen.current) setUiLang(json.data.snapshot.lang === 'en' ? 'en' : 'ar');
        return setState({ kind: 'ready', snapshot: json.data.snapshot, expiresAt: json.data.expiresAt });
      }
      setState({ kind: 'error', code: json?.error?.code ?? 'default' });
    } catch {
      setState({ kind: 'error', code: 'NETWORK' });
    }
  }, [token]);

  useEffect(() => {
    // Never let a search engine, a link preview or a referrer carry the address away.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    const ref = document.createElement('meta');
    ref.name = 'referrer';
    ref.content = 'no-referrer';
    document.head.append(meta, ref);
    void load();
    return () => {
      meta.remove();
      ref.remove();
    };
  }, [load]);

  const T = appT[uiLang].health.shareView;
  const dir = uiLang === 'ar' ? 'rtl' : 'ltr';

  // The page's language and direction belong to the document, so the browser, screen readers and print follow the choice too.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = uiLang;
    root.dir = dir;
    document.title = `${T.sharedBy} | ${T.brand}`;
  }, [uiLang, dir, T]);

  const openDoc = async (id: string) => {
    setDocError('');
    try {
      const res = await fetch('/api/share-view/document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, document_id: id }), cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener');
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setDocError(T.openFailed);
    }
  };

  return (
    <div className="sv-page" dir={dir} lang={uiLang}>
      <header className="sv-bar">
        <span className="sv-brand">
          <img src="/logo-mark.svg" alt="" width={28} height={28} />
          {T.brand}
        </span>
        <span className="sv-bar-end">
          <span className="sv-ro">
            <AppIcon name="lock" size={14} />
            {T.readOnly}
          </span>
          <button
            type="button"
            className="sv-lang sv-noprint"
            lang={uiLang === 'ar' ? 'en' : 'ar'}
            aria-label={T.langSwitchLabel}
            onClick={() => {
              chosen.current = true;
              setUiLang(uiLang === 'ar' ? 'en' : 'ar');
            }}
          >
            {T.langSwitch}
          </button>
        </span>
      </header>
      <main className="sv-main" id="main" tabIndex={-1}>
        {state.kind === 'loading' && (
          <div className="sv-state sv-state--loading" role="status" aria-live="polite">
            <p>{T.loading}</p>
            <div className="sv-skel" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        {state.kind === 'error' && (
          <div className="sv-state sv-state--error" role="alert">
            <span className="sv-state-icon" aria-hidden="true">
              <AppIcon name={state.code === 'NETWORK' ? 'refresh' : state.code === 'SHARE_EXPIRED' ? 'clock' : state.code === 'SHARE_REVOKED' ? 'lock' : 'alert'} size={26} />
            </span>
            <h1>{((T.errors as Record<string, { title: string; body: string }>)[state.code] ?? T.errors.default).title}</h1>
            <p>{((T.errors as Record<string, { title: string; body: string }>)[state.code] ?? T.errors.default).body}</p>
            {(state.code === 'NETWORK' || state.code === 'RATE_LIMITED' || state.code === 'default') && (
              <button type="button" className="sv-btn" onClick={() => void load()}>
                <AppIcon name="refresh" size={16} />
                {appT[uiLang].health.common.retry}
              </button>
            )}
          </div>
        )}
        {state.kind === 'ready' && (
          <>
            <div className="sv-head">
              <div>
                <h1>{T.sharedBy}</h1>
                <p className="sv-until">
                  <AppIcon name="clock" size={15} />
                  {fill(T.until, { date: formatDate(uiLang, state.expiresAt, true) })}
                </p>
              </div>
              <button type="button" className="sv-btn sv-noprint" onClick={() => window.print()}>
                <AppIcon name="download" size={16} />
                {T.print}
              </button>
            </div>
            <ShareTranslationProvider token={token}>
              <SnapshotView jump lang={uiLang} snapshot={state.snapshot} onOpenDoc={(id) => void openDoc(id)} docError={docError} />
            </ShareTranslationProvider>
          </>
        )}
      </main>
    </div>
  );
};
