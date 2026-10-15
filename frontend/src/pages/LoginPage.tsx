import React, { useState } from 'react';
import { ArrowIcon, LeafIcon, LockIcon } from '../components/LineIcon.js';
import { pickHero } from '../components/HeroVisual.js';
import { useLang } from '../context/LangContext.js';
import { useAuth } from '../context/AuthContext.js';

interface LoginPageProps {
  setCurrentView: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ setCurrentView }) => {
  const { t, isRtl, lang } = useLang();
  const A = t.auth;
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
      setErrorMsg(err.message || 'Login error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (personaEmail: string) => {
    setEmail(personaEmail);
    setPassword('Password123!');
    handleLoginSubmit(undefined, personaEmail);
  };

  const heroSrc = pickHero(lang);

  return (
    <div className="auth">
      <section className="auth-story" aria-labelledby="auth-story-title">
        {heroSrc && <img src={heroSrc} alt={t.landing.imageAlt} decoding="async" />}
        <div className="auth-story-inner">
          <span className="auth-story-eyebrow">
            <LockIcon />
            {A.eyebrow}
          </span>
          <h2 id="auth-story-title" className="auth-story-title">{A.panelTitle}</h2>
          <p className="auth-story-lead">{A.panelLead}</p>
          <ul className="auth-nodes">
            <li>{A.nodePatients}</li>
            <li>{A.nodeClinicians}</li>
            <li>{A.nodeCenters}</li>
          </ul>
        </div>
      </section>

      <div className="auth-main">
        <div className="auth-panel motion-stagger">
          <div className="auth-head">
            <span className="auth-eyebrow">
              <LeafIcon />
              {A.eyebrow}
            </span>
            <h1 className="auth-title">{A.loginTitle}</h1>
            <p className="auth-sub">{A.loginSubtitle}</p>
          </div>

          <div className="cloud-feature-card auth-card">
            <h2 className="auth-card-title">{A.directLogin}</h2>

            {errorMsg && (
              <div className="auth-error motion-alert-enter" role="alert">
                {errorMsg}
              </div>
            )}

            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-email">{A.email}</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor.noor@naseej.health"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="login-password">{A.password}</label>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password123!"
                  className="form-input"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-pill btn-pill-charcoal auth-submit">
                {loading ? t.common.loading : A.loginBtn}
              </button>
            </form>

            <p className="auth-note">{A.passwordNote}</p>
          </div>

          <div className="cloud-feature-card auth-card">
            <div className="auth-demo-head">
              <h2 className="auth-card-title">{A.demoAccounts}</h2>
              <span className="status-badge badge-approved" style={{ fontSize: 11 }}>{A.syntheticBadge}</span>
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
                    <span className={`status-badge ${p.badgeClass}`}>{p.badge}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <button type="button" className="auth-back" onClick={() => setCurrentView('home')}>
            <span aria-hidden="true" style={{ display: 'inline-flex', transform: isRtl ? undefined : 'scaleX(-1)' }}>
              <ArrowIcon />
            </span>
            {A.backHome}
          </button>
        </div>
      </div>
    </div>
  );
};
