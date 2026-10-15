import React, { useState } from 'react';
import { ArrowIcon, EyeIcon, LockIcon, MailIcon } from '../components/LineIcon.js';
import { AuthArt } from '../components/AuthArt.js';
import { Collapse } from '../components/motion.js';
import { useLang } from '../context/LangContext.js';
import { useAuth } from '../context/AuthContext.js';

interface LoginPageProps {
  setCurrentView: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ setCurrentView }) => {
  const { t, isRtl } = useLang();
  const A = t.auth;
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const demoPersonas = [
    {
      roleKey: 'platform_admin',
      name: isRtl ? 'سارة العتيبي (مدير المنصة)' : 'Sarah Al-Otaibi (Platform Admin)',
      email: 'admin@naseej.health',
      desc: isRtl ? 'إشراف المنشآت والتدقيق الأمني' : 'Center & system management',
      badge: 'Admin',
      badgeClass: 'badge-draft',
    },
    {
      roleKey: 'center_manager',
      name: isRtl ? 'د. خالد الغامدي (مدير المركز)' : 'Dr. Khalid Al-Ghamdi (Center Manager)',
      email: 'manager.noor@naseej.health',
      desc: isRtl ? 'إدارة الكادر وجداول الأطباء' : 'Staff directory & schedules',
      badge: 'Manager',
      badgeClass: 'badge-lilac',
    },
    {
      roleKey: 'doctor',
      name: isRtl ? 'د. فيصل الشمري (طبيب استشاري)' : 'Dr. Faisal Al-Shammari (Cardiologist)',
      email: 'doctor.noor@naseej.health',
      desc: isRtl ? 'توثيق الزيارات، والوصفات، والتحاليل' : 'Visits drafting & Rx approval',
      badge: 'Doctor',
      badgeClass: 'badge-approved',
    },
    {
      roleKey: 'reception',
      name: isRtl ? 'نورة القحطاني (موظفة استقبال)' : 'Noura Al-Qahtani (Receptionist)',
      email: 'reception.noor@naseej.health',
      desc: isRtl ? 'حجز المواعيد وتسجيل الحضور' : 'Booking & Arrival Check-in',
      badge: 'Reception',
      badgeClass: 'badge-info',
    },
    {
      roleKey: 'patient',
      name: isRtl ? 'محمد المنصور (المريض)' : 'Mohammed Al-Mansoor (Patient)',
      email: 'patient@naseej.health',
      desc: isRtl ? 'بوابة السجل الصحي والنتائج المعتمدة' : 'Approved health record portal',
      badge: 'Patient',
      badgeClass: 'badge-approved',
    },
  ];

  const handleLoginSubmit = async (e?: React.FormEvent, customEmail?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const targetEmail = customEmail || email;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Authentication failed.');
      }

      login(data.data.token, data.data.user);

      // Route to appropriate view based on persona
      if (data.data.user.systemRole === 'platform_admin') {
        setCurrentView('admin');
      } else if (data.data.user.patientProfileId) {
        setCurrentView('portal');
      } else if (data.data.user.memberships?.length > 0) {
        const role = data.data.user.memberships[0].role;
        if (role === 'doctor') setCurrentView('doctor');
        else if (role === 'center_manager') setCurrentView('manager');
        else if (role === 'reception') setCurrentView('reception');
        else setCurrentView('workspace');
      } else {
        setCurrentView('home');
      }
    } catch (err: any) {
      // fetch rejects with a TypeError when the server cannot be reached, and a gateway error body is not JSON.
      setErrorMsg(err instanceof TypeError || err instanceof SyntaxError ? A.networkError : err.message || 'Login error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (personaEmail: string) => {
    setEmail(personaEmail);
    setPassword('Password123!');
    handleLoginSubmit(undefined, personaEmail);
  };

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
            <h1 className="auth-title">{A.cardTitle}</h1>
            <p className="auth-sub">{A.cardWelcome}</p>
          </div>

          {errorMsg && (
            <div id="login-error" className="auth-error motion-alert-enter" role="alert">
              {errorMsg}
            </div>
          )}

          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-email">{A.email}</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><MailIcon /></span>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  aria-invalid={errorMsg ? true : undefined}
                  aria-describedby={errorMsg ? 'login-error' : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor.noor@naseej.health"
                  className="auth-input"
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-password">{A.password}</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><LockIcon /></span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  aria-invalid={errorMsg ? true : undefined}
                  aria-describedby={errorMsg ? 'login-error' : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input auth-input--toggle"
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPassword ? A.hidePassword : A.showPassword}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? t.common.loading : A.loginBtn}
            </button>
          </form>

          <p className="auth-aside">
            {A.noAccess}{' '}
            <button type="button" className="auth-link" onClick={() => setCurrentView('demo')}>
              {A.requestDemo}
            </button>
          </p>
          <p className="auth-help">{A.forgotHelp}</p>

          <div className="auth-demo">
            <button
              type="button"
              className="auth-demo-toggle"
              aria-expanded={demoOpen}
              aria-controls="auth-demo-panel"
              onClick={() => setDemoOpen((o) => !o)}
            >
              {demoOpen ? A.hideDemo : A.tryDemo}
              <span className="auth-demo-chevron" aria-hidden="true" data-open={demoOpen}>
                <ArrowIcon />
              </span>
            </button>
            <Collapse open={demoOpen} id="auth-demo-panel">
              <div className="auth-demo-body">
                <div className="auth-demo-head">
                  <h2 className="auth-demo-title">{A.demoAccounts}</h2>
                  <span className="auth-badge">{A.syntheticBadge}</span>
                </div>
                <p className="auth-demo-lead">{A.demoLead}</p>
                <ul className="auth-personas">
                  {demoPersonas.map((p) => (
                    <li key={p.roleKey}>
                      <button type="button" className="auth-persona" disabled={loading} onClick={() => handleQuickLogin(p.email)}>
                        <span className="auth-persona-text">
                          <span className="auth-persona-name">{p.name}</span>
                          <span className="auth-persona-desc">{p.desc}</span>
                        </span>
                        <span className="auth-badge">{p.badge}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="auth-note">{A.passwordNote}</p>
              </div>
            </Collapse>
          </div>
        </div>
      </div>
    </div>
  );
};
