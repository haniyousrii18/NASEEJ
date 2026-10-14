import React from 'react';
import { useLang } from '../context/LangContext.js';
import { useAuth } from '../context/AuthContext.js';
import { ThemeToggle } from './ThemeToggle.js';

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  const { lang, setLang, t, isRtl } = useLang();
  const { user, logout, currentOrgId, setCurrentOrgId, currentRole } = useAuth();

  const toggleLang = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  return (
    <div data-chrome="global" className="site-header-shell" style={{
      position: 'sticky',
      top: 12,
      zIndex: 100,
      padding: '0 16px',
      pointerEvents: 'none',
    }}>
      <header
        className="floating-capsule-nav site-header"
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: 'var(--color-glass)',
          borderRadius: 32,
          padding: '8px 16px',
          boxShadow: 'var(--shadow-nav)',
          border: '1px solid var(--color-border-subtle)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* Brand & Logo */}
        <div
          onClick={() => setCurrentView('home')}
          className="site-header-brand"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          <img
            src="/logo.png"
            alt="شعار نسيج | Naseej Logo"
            style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span
                style={{
                  fontSize: 18,
                  lineHeight: '25.2px',
                  fontWeight: 500,
                  letterSpacing: '0.162px',
                  color: 'var(--color-ink)',
                }}
              >
                {t.brand.name}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 500 }}>
                · Naseej
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-body-gray)', lineHeight: 1 }}>
              {isRtl ? 'رعاية صحية متصلة' : 'Connected Health'}
            </span>
          </div>
        </div>

        {/* Public Navigation */}
        <nav className="site-header-nav" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setCurrentView('home')}
            style={{
              padding: '6px 14px',
              borderRadius: 128,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: '22.4px',
              color: currentView === 'home' ? 'var(--color-ink)' : 'var(--color-body-gray)',
              background: currentView === 'home' ? 'var(--color-cloud-card)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {t.nav.home}
          </button>
          <button
            onClick={() => setCurrentView('features')}
            style={{
              padding: '6px 14px',
              borderRadius: 128,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: '22.4px',
              color: currentView === 'features' ? 'var(--color-ink)' : 'var(--color-body-gray)',
              background: currentView === 'features' ? 'var(--color-cloud-card)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {t.nav.features}
          </button>
          <button
            onClick={() => setCurrentView('workflow')}
            style={{
              padding: '6px 14px',
              borderRadius: 128,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: '22.4px',
              color: currentView === 'workflow' ? 'var(--color-ink)' : 'var(--color-body-gray)',
              background: currentView === 'workflow' ? 'var(--color-cloud-card)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {t.nav.workflow}
          </button>
        </nav>

        {/* Right Actions: Center Switcher, Role Badge, Lang & Auth */}
        <div className="site-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Active Tenant Switcher if multi-tenant memberships */}
          {user && user.memberships && user.memberships.length > 1 && (
            <select
              value={currentOrgId || ''}
              onChange={(e) => setCurrentOrgId(e.target.value)}
              className="form-select"
              style={{
                width: 'auto',
                padding: '6px 12px',
                fontSize: 13,
                borderRadius: 128,
                background: 'var(--color-cloud-card)',
                border: 'none',
              }}
            >
              {user.memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {isRtl ? m.organization_name_ar : m.organization_name_en} ({m.role})
                </option>
              ))}
            </select>
          )}

          {/* User state or Login Button */}
          {user ? (
            <div className="site-header-auth" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => {
                  if (user.systemRole === 'platform_admin') setCurrentView('admin');
                  else if (user.patientProfileId) setCurrentView('portal');
                  else if (currentRole === 'doctor') setCurrentView('doctor');
                  else if (currentRole === 'center_manager') setCurrentView('manager');
                  else if (currentRole === 'reception') setCurrentView('reception');
                  else setCurrentView('workspace');
                }}
                className="btn-pill btn-pill-charcoal"
                style={{ fontSize: 14, padding: '6px 14px' }}
              >
                <span>{isRtl ? user.fullNameAr : user.fullNameEn}</span>
                <span
                  className="status-badge badge-approved"
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    background: 'color-mix(in srgb, var(--color-cloud-card) 22%, transparent)',
                    color: 'var(--color-cloud-card)',
                    border: 'none',
                  }}
                >
                  {t.roles[currentRole as keyof typeof t.roles] || currentRole}
                </span>
              </button>
              <button
                onClick={logout}
                className="btn-pill btn-pill-ghost"
                style={{ fontSize: 13, padding: '6px 12px' }}
                title={t.nav.logout}
              >
                {t.nav.logout}
              </button>
            </div>
          ) : (
            <div className="site-header-auth" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setCurrentView('demo')}
                className="btn-pill btn-pill-cloud"
                style={{ fontSize: 14, padding: '8px 16px' }}
              >
                {t.nav.demo}
              </button>
              {/* Charcoal Download / Action Pill per DESIGN (2).md */}
              <button
                onClick={() => setCurrentView('login')}
                className="btn-pill btn-pill-charcoal"
                style={{ fontSize: 15, padding: '8px 18px' }}
              >
                {t.nav.login}
              </button>
            </div>
          )}

          <ThemeToggle />

          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            style={{
              padding: '6px 12px',
              borderRadius: 128,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-ink)',
              background: 'var(--color-cloud-card)',
              border: 'none',
              transition: 'background 0.2s ease',
            }}
          >
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
      </header>
    </div>
  );
};
