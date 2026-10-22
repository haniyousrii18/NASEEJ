import React, { useEffect, useRef, useState } from 'react';
import { fill } from '../app/format.js';
import { AlertIcon, CheckIcon, EyeIcon, LockIcon, MailIcon, UserIcon } from '../components/LineIcon.js';
import { useLang } from '../context/LangContext.js';
import type { translations } from '../i18n/translations.js';

/**
 * The account screens that sit beside sign-in: create an account, forgot password, choose a new password, confirm an email,
 * and the "check your email" panel. They talk to /api/auth and word every outcome in the page language: the server's English
 * `message` is never shown, only its stable `code`.
 */
type AuthStrings = (typeof translations)['ar']['auth'];

export interface AuthResult {
  ok: boolean;
  status: number;
  code: string;
  field?: string;
  data?: any;
}

export async function authPost(path: string, body: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(`/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const json = await res.json().catch(() => null);
    if (!json) return { ok: false, status: res.status, code: 'NETWORK' };
    const ok = res.ok && json?.success !== false;
    return { ok, status: res.status, code: ok ? '' : json?.error?.code ?? 'ERROR', field: json?.error?.details?.field, data: json?.data };
  } catch {
    return { ok: false, status: 0, code: 'NETWORK' };
  }
}

/** The page-language wording for a failed auth request. */
export function authErrorText(A: AuthStrings, r: Pick<AuthResult, 'status' | 'code' | 'field'>): string {
  const E = A.errors;
  if (r.status === 0 || r.code === 'NETWORK') return A.networkError;
  if (r.status === 429 || r.code === 'RATE_LIMITED') return E.rateLimited;
  switch (r.code) {
    case 'EMAIL_NOT_CONFIGURED':
      return E.mailOff;
    case 'EMAIL_SEND_FAILED':
      return E.sendFailed;
    case 'EMAIL_NOT_VERIFIED':
      return E.notVerified;
    case 'AUTH_FAILED':
    case 'INVALID_CREDENTIALS':
      return E.authFailed;
    case 'ACCOUNT_SUSPENDED':
      return E.suspended;
    case 'PATIENT_ONLY_MODE':
      return E.patientsOnly;
    case 'WEAK_PASSWORD':
      return E.weakPassword;
    case 'VALIDATION_ERROR':
      return r.field === 'email' ? E.emailInvalid : r.field === 'fullName' ? E.nameInvalid : E.generic;
    default:
      return E.generic;
  }
}

const strongEnough = (p: string) => p.length >= 8 && new TextEncoder().encode(p).length <= 72 && /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p);

// ------------------------------------------------------------------------------------------------------- field

export const AuthField: React.FC<{
  id: string;
  label: string;
  icon: 'mail' | 'lock' | 'user';
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  maxLength?: number;
  autoFocus?: boolean;
}> = ({ id, label, icon, value, onChange, type = 'text', autoComplete, placeholder, hint, error, maxLength, autoFocus }) => {
  const { t } = useLang();
  const [shown, setShown] = useState(false);
  const Icon = icon === 'mail' ? MailIcon : icon === 'lock' ? LockIcon : UserIcon;
  const describedBy = [error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="auth-field">
      <label className="auth-label" htmlFor={id}>
        {label}
      </label>
      <div className="auth-input-wrap">
        <span className="auth-input-icon">
          <Icon />
        </span>
        <input
          id={id}
          className={`auth-input${type === 'password' ? ' auth-input--toggle' : ''}`}
          type={type === 'password' && shown ? 'text' : type}
          value={value}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        {type === 'password' && (
          <button type="button" className="auth-eye" aria-label={shown ? t.auth.hidePassword : t.auth.showPassword} aria-pressed={shown} onClick={() => setShown((v) => !v)}>
            <EyeIcon off={shown} />
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="auth-hint" role="alert" style={{ color: 'var(--auth-danger-ink)' }}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="auth-hint">
          {hint}
        </p>
      )}
    </div>
  );
};

/** What the server can really do about email: shown before anyone submits, so no one waits for a message that will not come. */
function useMailMode(): 'smtp' | 'dev' | 'off' | null {
  const [mode, setMode] = useState<'smtp' | 'dev' | 'off' | null>(null);
  useEffect(() => {
    void fetch('/api/auth/access-status')
      .then((r) => r.json())
      .then((j) => setMode(j?.data?.mail ?? null))
      .catch(() => undefined);
  }, []);
  return mode;
}

const MailBanner: React.FC = () => {
  const { t } = useLang();
  const mode = useMailMode();
  if (mode !== 'dev' && mode !== 'off') return null;
  return (
    <div className="auth-panel" role="note">
      <div className="auth-panel-title">
        <AlertIcon size={22} />
        {t.auth.mailWarnTitle}
      </div>
      <p>{mode === 'off' ? t.auth.errors.mailOff : t.auth.mailWarnDev}</p>
    </div>
  );
};

const ErrorBox: React.FC<{ message: string }> = ({ message }) =>
  message ? (
    <div className="auth-error motion-alert-enter" role="alert">
      {message}
    </div>
  ) : null;

// ------------------------------------------------------------------------------------------------------- register

export const RegisterForm: React.FC<{ onSent: (email: string) => void; onLogin: () => void }> = ({ onSent, onLogin }) => {
  const { t, lang } = useLang();
  const A = t.auth;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<{ name?: string; email?: string; pw?: string; pw2?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof fields = {};
    if (name.trim().length < 2) next.name = A.errors.nameInvalid;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) next.email = A.errors.emailInvalid;
    if (!strongEnough(pw)) next.pw = A.errors.weakPassword;
    else if (pw !== pw2) next.pw2 = A.errors.mismatch;
    setFields(next);
    setError('');
    if (Object.keys(next).length) return;
    setBusy(true);
    const r = await authPost('/register', { email: email.trim(), password: pw, fullName: name.trim(), lang });
    setBusy(false);
    if (r.ok) return onSent(email.trim());
    if (r.field === 'email') setFields({ email: authErrorText(A, r) });
    else if (r.field === 'fullName') setFields({ name: authErrorText(A, r) });
    else if (r.field === 'password') setFields({ pw: authErrorText(A, r) });
    else setError(authErrorText(A, r));
  };

  return (
    <>
      <MailBanner />
      <ErrorBox message={error} />
      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="reg-name" label={A.fullName} icon="user" value={name} onChange={setName} autoComplete="name" maxLength={120} error={fields.name} autoFocus />
        <AuthField id="reg-email" label={A.email} icon="mail" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="name@example.com" error={fields.email} />
        <AuthField id="reg-pw" label={A.password} icon="lock" type="password" value={pw} onChange={setPw} autoComplete="new-password" hint={A.passwordRule} error={fields.pw} />
        <AuthField id="reg-pw2" label={A.confirmPassword} icon="lock" type="password" value={pw2} onChange={setPw2} autoComplete="new-password" error={fields.pw2} />
        <button type="submit" disabled={busy} className="auth-submit">
          {busy ? t.common.loading : A.registerBtn}
        </button>
      </form>
      <div className="auth-switch">
        <button type="button" className="auth-linkbtn" onClick={onLogin}>
          {A.haveAccount}
        </button>
      </div>
    </>
  );
};

// ------------------------------------------------------------------------------------------------------- forgot

export const ForgotForm: React.FC<{ onSent: (email: string) => void; onLogin: () => void }> = ({ onSent, onLogin }) => {
  const { t, lang } = useLang();
  const A = t.auth;
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError(A.errors.emailInvalid);
    setBusy(true);
    const r = await authPost('/forgot-password', { email: email.trim(), lang });
    setBusy(false);
    if (r.ok) onSent(email.trim());
    else setError(authErrorText(A, r));
  };

  return (
    <>
      <MailBanner />
      <ErrorBox message={error} />
      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="fp-email" label={A.email} icon="mail" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="name@example.com" autoFocus />
        <button type="submit" disabled={busy} className="auth-submit">
          {busy ? t.common.loading : A.sendLink}
        </button>
      </form>
      <div className="auth-switch">
        <button type="button" className="auth-linkbtn" onClick={onLogin}>
          {A.backToLogin}
        </button>
      </div>
    </>
  );
};

// ------------------------------------------------------------------------------------------------------- reset

export const ResetForm: React.FC<{ token: string; onDone: () => void; onAskAgain: () => void }> = ({ token, onDone, onAskAgain }) => {
  const { t, lang } = useLang();
  const A = t.auth;
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<{ pw?: string; pw2?: string }>({});
  const [dead, setDead] = useState(false);

  if (dead) return <DeadLink onAskAgain={onAskAgain} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const next: typeof fields = {};
    if (!strongEnough(pw)) next.pw = A.errors.weakPassword;
    else if (pw !== pw2) next.pw2 = A.errors.mismatch;
    setFields(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const r = await authPost('/reset-password', { token, newPassword: pw, lang });
    setBusy(false);
    if (r.ok) return onDone();
    if (r.code === 'LINK_INVALID') return setDead(true);
    setError(authErrorText(A, r));
  };

  return (
    <>
      <ErrorBox message={error} />
      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="rs-pw" label={A.newPassword} icon="lock" type="password" value={pw} onChange={setPw} autoComplete="new-password" hint={A.passwordRule} error={fields.pw} autoFocus />
        <AuthField id="rs-pw2" label={A.confirmPassword} icon="lock" type="password" value={pw2} onChange={setPw2} autoComplete="new-password" error={fields.pw2} />
        <button type="submit" disabled={busy} className="auth-submit">
          {busy ? t.common.loading : A.resetBtn}
        </button>
      </form>
    </>
  );
};

const DeadLink: React.FC<{ onAskAgain: () => void }> = ({ onAskAgain }) => {
  const { t } = useLang();
  const A = t.auth;
  return (
    <div className="auth-panel" role="alert">
      <div className="auth-panel-title">
        <AlertIcon size={22} />
        {A.linkInvalidTitle}
      </div>
      <p>{A.linkInvalidBody}</p>
      <button type="button" className="auth-submit" onClick={onAskAgain}>
        {A.forgotLink}
      </button>
    </div>
  );
};

// ------------------------------------------------------------------------------------------------------- verify

/** Opens the confirmation link: the token in the address is sent once, then the person is asked to sign in. */
export const VerifyPanel: React.FC<{ token: string; onLogin: () => void; onAskAgain: () => void }> = ({ token, onLogin, onAskAgain }) => {
  const { t } = useLang();
  const A = t.auth;
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working');
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return; // the link works once: never send it twice
    sent.current = true;
    void authPost('/verify-email', { token }).then((r) => setState(r.ok ? 'ok' : 'bad'));
  }, [token]);

  if (state === 'working') {
    return (
      <p className="auth-hint" role="status" style={{ textAlign: 'center' }}>
        {A.verifying}
      </p>
    );
  }
  if (state === 'bad') return <DeadLink onAskAgain={onAskAgain} />;
  return (
    <div className="auth-panel" role="status">
      <div className="auth-panel-title">
        <CheckIcon />
        {A.verifiedTitle}
      </div>
      <p>{A.verifiedBody}</p>
      <button type="button" className="auth-submit" onClick={onLogin}>
        {A.cardTitle}
      </button>
    </div>
  );
};

// ------------------------------------------------------------------------------------------------------- inbox

export const InboxPanel: React.FC<{ kind: 'register' | 'forgot'; email: string; onBack: () => void }> = ({ kind, email, onBack }) => {
  const { t, lang } = useLang();
  const A = t.auth;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [dev, setDev] = useState(false);

  useEffect(() => {
    void fetch('/api/auth/access-status')
      .then((r) => r.json())
      .then((j) => setDev(j?.data?.mail === 'dev'))
      .catch(() => undefined);
  }, []);

  const again = async () => {
    setBusy(true);
    setNote('');
    setError('');
    const r = await authPost(kind === 'register' ? '/resend-verification' : '/forgot-password', { email, lang });
    setBusy(false);
    if (r.ok) setNote(A.resent);
    else setError(authErrorText(A, r));
  };

  return (
    <>
      <div className="auth-panel">
        <p dir="auto">{fill(kind === 'register' ? A.inboxRegister : A.inboxForgot, { email })}</p>
        <p className="auth-hint">{A.inboxSpam}</p>
        {dev && (
          <p className="auth-hint" role="note">
            {A.devMail}
          </p>
        )}
      </div>
      <ErrorBox message={error} />
      {note && (
        <p className="auth-hint" role="status" style={{ textAlign: 'center' }}>
          {note}
        </p>
      )}
      <div className="auth-switch">
        <button type="button" className="auth-linkbtn" disabled={busy} onClick={() => void again()}>
          {A.resend}
        </button>
        <button type="button" className="auth-linkbtn" onClick={onBack}>
          {A.backToLogin}
        </button>
      </div>
    </>
  );
};
