import React, { useState } from 'react';
import { useLang } from '../context/LangContext.js';
import { useAuth } from '../context/AuthContext.js';

interface LoginPageProps {
  setCurrentView: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ setCurrentView }) => {
  const { t, isRtl } = useLang();
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

  return (
    <div className="page-shell" style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div className="recognition-laurel-pair">
          <div className="recognition-laurel-item">
            <span>🌿</span>
            <span>{isRtl ? 'الدخول الآمن والتحقق المعتمد' : 'Secure Authenticated Access'}</span>
            <span>🌿</span>
          </div>
        </div>
        <h1 className="text-display" style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)', margin: '14px 0' }}>
          {t.auth.loginTitle}
        </h1>
        <p className="text-subhead">
          {t.auth.loginSubtitle}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        gap: 28,
        alignItems: 'start',
      }}>
        {/* Quick Fill Demo Personas Box */}
        <div className="cloud-feature-card" style={{ padding: '32px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 className="text-card-heading" style={{ fontSize: 20, margin: 0 }}>
              {t.auth.demoAccounts}
            </h3>
            <span className="status-badge badge-approved" style={{ fontSize: 11 }}>
              100% Synthetic
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {demoPersonas.map((p) => (
              <div
                key={p.roleKey}
                onClick={() => handleQuickLogin(p.email)}
                style={{
                  padding: '14px 16px',
                  borderRadius: 16,
                  background: 'var(--color-paper-white)',
                  border: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  boxShadow: 'var(--shadow-xs)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-charcoal)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 2 }}>
                    {p.desc}
                  </div>
                </div>
                <span className={`status-badge ${p.badgeClass}`} style={{ fontSize: 11 }}>
                  {p.badge}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Credentials Form Box */}
        <div className="cloud-feature-card" style={{ padding: '36px 32px' }}>
          <h3 className="text-card-heading" style={{ fontSize: 20, marginBottom: 20 }}>
            {isRtl ? 'تسجيل الدخول المباشر' : 'Direct Credentials Login'}
          </h3>

          {errorMsg && (
            <div
              className="motion-alert-enter"
              style={{
                background: 'var(--color-status-danger-bg)',
                border: '1px solid var(--color-status-danger-border)',
                borderRadius: 12,
                padding: '10px 14px',
                color: 'var(--color-status-danger-text)',
                fontSize: 14,
                marginBottom: 18,
              }}
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label className="form-label">{t.auth.email}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor.noor@naseej.health"
                className="form-input"
              />
            </div>

            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">{t.auth.password}</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password123!"
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-pill btn-pill-charcoal"
              style={{ width: '100%', marginTop: 24, padding: '12px', fontSize: 16 }}
            >
              {loading ? t.common.loading : t.auth.loginBtn}
            </button>
          </form>

          <div style={{
            marginTop: 24,
            padding: '12px 16px',
            background: 'var(--color-paper-white)',
            borderRadius: 14,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--color-body-gray)',
            border: '1px solid var(--color-border-subtle)',
          }}>
            {isRtl
              ? 'كلمة المرور الموحدة لجميع الحسابات التجريبية: Password123!'
              : 'Default password for all synthetic accounts: Password123!'}
          </div>
        </div>
      </div>
    </div>
  );
};
