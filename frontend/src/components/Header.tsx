import React, { useEffect, useState } from 'react';
import { useLang } from '../context/LangContext.js';
import { useAuth } from '../context/AuthContext.js';
import { ThemeToggle } from './ThemeToggle.js';

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

const MenuIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
);

/**
 * Site bar: brand, primary navigation, account actions, theme and language.
 * Below 960px the navigation and actions collapse into one menu that opens under the bar.
 */
export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  const { lang, setLang, t, isRtl } = useLang();
  const { user, logout, currentOrgId, setCurrentOrgId, currentRole } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the menu on navigation and with Escape.
  useEffect(() => setOpen(false), [currentView]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (view: string) => {
    setCurrentView(view);
    setOpen(false);
  };

  const goWorkspace = () => {
    if (!user) return;
    if (user.systemRole === 'platform_admin') go('admin');
    else if (user.patientProfileId) go('portal');
    else if (currentRole === 'doctor') go('doctor');
    else if (currentRole === 'center_manager') go('manager');
    else if (currentRole === 'reception') go('reception');
    else go('workspace');
  };

  const links: Array<[string, string]> = [
    ['home', t.nav.home],
    ['features', t.nav.features],
    ['workflow', t.nav.workflow],
  ];

  return (
    <header className="site-bar">
      <div className="site-bar-inner">
        <button type="button" className="site-brand" onClick={() => go('home')} aria-label={`${t.brand.name} · ${t.nav.home}`}>
          <img src="/logo.png" alt="" width={36} height={36} style={{ borderRadius: 8, objectFit: 'contain' }} />
          <span className="site-brand-text">
            <span className="site-brand-name">
              {t.brand.name} <span className="site-brand-latin">· Naseej</span>
            </span>
            <span className="site-brand-sub">{isRtl ? 'رعاية صحية متصلة' : 'Connected Health'}</span>
          </span>
        </button>

        <button
          type="button"
          className="site-menu-btn"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? t.landing.closeMenu : t.landing.menu}
          onClick={() => setOpen((o) => !o)}
        >
          <MenuIcon open={open} />
        </button>

        <div id="site-menu" className="site-collapsible" data-open={open}>
          <nav className="site-nav" aria-label={t.landing.menu}>
            {links.map(([view, label]) => (
              <button key={view} type="button" aria-current={currentView === view ? 'page' : undefined} onClick={() => go(view)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="site-actions">
            {user && user.memberships && user.memberships.length > 1 && (
              <select value={currentOrgId || ''} onChange={(e) => setCurrentOrgId(e.target.value)} className="form-select site-org-select" aria-label={t.nav.workspaces}>
                {user.memberships.map((m) => (
                  <option key={m.organization_id} value={m.organization_id}>
                    {isRtl ? m.organization_name_ar : m.organization_name_en} ({m.role})
                  </option>
                ))}
              </select>
            )}

            {user ? (
              <>
                <button type="button" onClick={goWorkspace} className="btn-pill btn-pill-charcoal site-user">
                  <span className="site-user-name">{isRtl ? user.fullNameAr : user.fullNameEn}</span>
                  <span className="status-badge badge-approved site-user-role">{t.roles[currentRole as keyof typeof t.roles] || currentRole}</span>
                </button>
                <button type="button" onClick={logout} className="btn-pill btn-pill-ghost" title={t.nav.logout}>
                  {t.nav.logout}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => go('demo')} className="btn-pill btn-pill-ghost">
                  {t.nav.demo}
                </button>
                <button type="button" onClick={() => go('login')} className="btn-pill btn-pill-charcoal">
                  {t.nav.login}
                </button>
              </>
            )}

            <ThemeToggle />
            <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="btn-pill btn-pill-cloud site-lang" lang={lang === 'ar' ? 'en' : 'ar'}>
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
