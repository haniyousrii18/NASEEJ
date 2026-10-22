import React, { useState } from 'react';
import { AuthArt } from '../components/AuthArt.js';
import { MailIcon, LockIcon, UserIcon } from '../components/LineIcon.js';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';
import { AuthField, ForgotForm, InboxPanel, RegisterForm, ResetForm, VerifyPanel, authErrorText, authPost } from './AccessForms.js';

/** Which screen the card shows. The address can open some of them directly (the links in the emails). */
export type AccessMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'inbox-register' | 'inbox-forgot';

interface LoginPageProps {
  setCurrentView: (view: string) => void;
  /** Open on another screen, e.g. from an emailed link. */
  initialMode?: AccessMode;
  /** The token from an emailed link (confirm email or reset password). */
  token?: string;
  /** Called when the person leaves an emailed link's screen, so the app can clear it from the address. */
  onLeaveLink?: () => void;
}

/** The one shared password of the synthetic demo accounts (shown on the page and in the seed). */
const DEMO_PASSWORD = 'Password123!';
const DEMO_EMAIL = 'patient@naseej.health';

export const LoginPage: React.FC<LoginPageProps> = ({ setCurrentView, initialMode = 'login', token = '', onLeaveLink }) => {
  const { t, isRtl, lang } = useLang();
  const A = t.auth;
  const { login } = useAuth();

  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [sentTo, setSentTo] = useState('');
  const [flash, setFlash] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [unverified, setUnverified] = useState(false);

  // PATIENT-ONLY MODE: only the patient demo account exists.
  // To restore all accounts, revert commit on branch feat/patient-only-login.
  const demoName = isRtl ? 'محمد المنصور (المريض)' : 'Mohammed Al-Mansoor (Patient)';
  const demoDesc = isRtl ? 'بوابة السجل الصحي والنتائج المعتمدة' : 'Approved health record portal';

  const go = (next: AccessMode) => {
    setMode(next);
    setErrorMsg('');
    setFlash('');
    setUnverified(false);
  };
  /** Leaving a screen that was opened by an emailed link: back to plain sign-in, with the link out of the address. */
  const toLogin = (message = '') => {
    onLeaveLink?.();
    go('login');
    setFlash(message);
  };

  /** Signs in with what is typed, or with `creds` when given (a state update is not visible to the request in the same click). */
  const handleLoginSubmit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setUnverified(false);
    const r = await authPost('/login', { email: (creds?.email ?? email).trim(), password: creds?.password ?? password });
    setLoading(false);
    if (!r.ok) {
      setUnverified(r.code === 'EMAIL_NOT_VERIFIED');
      setErrorMsg(authErrorText(A, r));
      return;
    }
    // PATIENT-ONLY MODE: only patients may access the app through this login page.
    // To restore full access, revert commit on branch feat/patient-only-login.
    if (!r.data.user.patientProfileId) {
      setErrorMsg(A.errors.patientsOnly);
      return;
    }
    login(r.data.token, r.data.user);
    setCurrentView('portal');
  };

  const handleQuickLogin = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    void handleLoginSubmit(undefined, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
  };

  const resendConfirmation = async () => {
    const r = await authPost('/resend-verification', { email: email.trim(), lang });
    if (r.ok) {
      setSentTo(email.trim());
      go('inbox-register');
    } else {
      setErrorMsg(authErrorText(A, r));
    }
  };

  const heading: Record<AccessMode, { title: string; sub: string }> = {
    login: { title: A.cardTitle, sub: A.cardWelcome },
    register: { title: A.registerTitle, sub: A.registerWelcome },
    forgot: { title: A.forgotTitle, sub: A.forgotWelcome },
    reset: { title: A.resetTitle, sub: A.resetWelcome },
    verify: { title: A.verifiedTitle, sub: '' },
    'inbox-register': { title: A.inboxTitle, sub: '' },
    'inbox-forgot': { title: A.inboxTitle, sub: '' },
  };
  // the confirm-email screen shows its own result, so its title is the neutral one until it knows
  const head = mode === 'verify' ? { title: A.cardTitle, sub: '' } : heading[mode];

  return (
    <div className="auth">
      <AuthArt />
      <div className="auth-stage">
        <div className="auth-brand" dir={isRtl ? 'rtl' : 'ltr'}>
          <img className="auth-logo" src="/logo-mark.svg" alt={t.brand.name} width={120} height={120} />
          <span className="auth-brand-name">{t.brand.name}</span>
          <span className="auth-brand-sub">{t.brand.tagline}</span>
        </div>

        <div className="auth-card motion-stagger" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="auth-head">
            <div className="auth-title-row">
              <h1 className="auth-title">{head.title}</h1>
              {mode === 'login' && (
                <button
                  type="button"
                  className="auth-quick"
                  disabled={loading}
                  aria-busy={loading || undefined}
                  aria-label={`${A.quickLogin}: ${demoName}`}
                  title={`${demoName}\n${loading ? A.signingIn : demoDesc}`}
                  onClick={handleQuickLogin}
                >
                  <UserIcon />
                </button>
              )}
            </div>
            {head.sub && <p className="auth-sub">{head.sub}</p>}
          </div>

          {mode === 'login' && (
            <>
              {flash && (
                <div className="auth-panel" role="status">
                  <p>{flash}</p>
                </div>
              )}
              {errorMsg && (
                <div id="login-error" className="auth-error motion-alert-enter" role="alert">
                  {errorMsg}
                  {unverified && (
                    <>
                      {' '}
                      <button type="button" className="auth-linkbtn" onClick={() => void resendConfirmation()}>
                        {A.resend}
                      </button>
                    </>
                  )}
                </div>
              )}

              <form className="auth-form" onSubmit={handleLoginSubmit}>
                <AuthField id="login-email" label={A.email} icon="mail" type="email" value={email} onChange={setEmail} autoComplete="username" placeholder="name@example.com" />
                <AuthField id="login-password" label={A.password} icon="lock" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? t.common.loading : A.loginBtn}
                </button>
              </form>

              <div className="auth-switch">
                <button type="button" className="auth-linkbtn" onClick={() => go('forgot')}>
                  {A.forgotLink}
                </button>
                <button type="button" className="auth-linkbtn" onClick={() => go('register')}>
                  {A.createAccount}
                </button>
              </div>
            </>
          )}

          {mode === 'register' && (
            <RegisterForm
              onSent={(to) => {
                setSentTo(to);
                go('inbox-register');
              }}
              onLogin={() => go('login')}
            />
          )}

          {mode === 'forgot' && (
            <ForgotForm
              onSent={(to) => {
                setSentTo(to);
                go('inbox-forgot');
              }}
              onLogin={() => toLogin()}
            />
          )}

          {mode === 'reset' && <ResetForm token={token} onDone={() => toLogin(A.resetDone)} onAskAgain={() => go('forgot')} />}

          {mode === 'verify' && <VerifyPanel token={token} onLogin={() => toLogin()} onAskAgain={() => go('forgot')} />}

          {(mode === 'inbox-register' || mode === 'inbox-forgot') && (
            <InboxPanel kind={mode === 'inbox-register' ? 'register' : 'forgot'} email={sentTo} onBack={() => go('login')} />
          )}
        </div>
      </div>
    </div>
  );
};
