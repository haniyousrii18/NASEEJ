import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../context/LangContext.js';
import { useAuth } from '../context/AuthContext.js';
import { ThemeToggle } from './ThemeToggle.js';
import { DownloadIcon, GlobeIcon } from './LineIcon.js';
import { useInstall } from '../pwa/InstallContext.js';
import { lockScroll, trapTab, useMediaQuery } from '../lib/overlay.js';

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

// Views whose first screen is full-bleed art. The bar floats transparent over them until the page scrolls.
const OVERLAY_VIEWS = ['home', 'login'];

const MenuIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * Site bar. Hierarchy, start to end: brand, primary links, quiet utilities (install, theme, language),
 * then one account area with a single primary action. Below 960px everything folds into one menu.
 */
export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  const { lang, setLang, t, isRtl } = useLang();
  const { user, logout, currentOrgId, setCurrentOrgId, currentRole } = useAuth();
  const installApp = useInstall();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Below 960px the links fold into a modal drawer; above it the same markup is the inline bar.
  const isDrawerWidth = useMediaQuery('(max-width: 959px)');
  const drawerOpen = open && isDrawerWidth;

  const closeMenu = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) menuBtnRef.current?.focus({ preventScroll: true });
  };

  // Close the menu on navigation, and when the window grows past the drawer breakpoint.
  useEffect(() => setOpen(false), [currentView]);
  useEffect(() => {
    if (!isDrawerWidth) setOpen(false);
  }, [isDrawerWidth]);

  // Open drawer: Escape closes and returns focus to the trigger, Tab stays inside, the page behind does not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
      else trapTab(e, drawerRef.current);
    };
    document.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus({ preventScroll: true });
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  // The bar turns solid once the page has moved.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (view: string) => {
    setCurrentView(view);
    setOpen(false);
    if (drawerOpen) menuBtnRef.current?.focus({ preventScroll: true });
  };

  // Ending the session also leaves the protected page, so one click lands on the login page.
  const handleLogout = () => {
    logout();
    go('login');
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

  const otherLang = lang === 'ar' ? 'en' : 'ar';
  const otherLangName = lang === 'ar' ? 'English' : 'العربية';
  const displayName = user ? (isRtl ? user.fullNameAr : user.fullNameEn) : '';
  const roleName = user ? t.roles[currentRole as keyof typeof t.roles] || currentRole : '';

  return (
    <header className="site-bar" data-overlay={OVERLAY_VIEWS.includes(currentView)} data-scrolled={scrolled} data-menu={open}>
      <div className="site-bar-inner">
        <button type="button" className="site-brand" onClick={() => go('home')} aria-label={`${t.brand.name} · ${t.nav.home}`}>
          <img className="site-logo" src="/logo-mark.svg" alt="" width={54} height={54} />
          <span className="site-brand-text">
            <span className="site-brand-name">{t.brand.name}</span>
            <span className="site-brand-sub" lang={isRtl ? 'en' : 'ar'}>{isRtl ? 'Naseej' : 'نَسيج'}</span>
          </span>
        </button>

        {/* On Login page on mobile, show language and theme switchers directly in the top navbar */}
        {currentView === 'login' && (
          <div className="site-login-direct-tools">
            <ThemeToggle compact />
            <button
              type="button"
              className="site-util site-util--direct"
              onClick={() => setLang(otherLang)}
              lang={otherLang}
              aria-label={otherLangName}
              title={otherLangName}
            >
              <GlobeIcon />
              <span className="site-util-code" aria-hidden="true">{otherLang === 'en' ? 'EN' : 'ع'}</span>
            </button>
          </div>
        )}

        {currentView !== 'login' && (
          <button
            type="button"
            className="site-menu-btn"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? t.landing.closeMenu : t.landing.menu}
            ref={menuBtnRef}
            onClick={() => setOpen((o) => !o)}
          >
            <MenuIcon open={open} />
          </button>
        )}

        {/* Blurred Backdrop for Mobile Sidebar Drawer */}
        <div
          className={`site-drawer-backdrop${open ? ' is-active' : ''}`}
          onClick={() => closeMenu()}
          aria-hidden="true"
        />

        <div
          id="site-menu"
          ref={drawerRef}
          className={`site-collapsible${open ? ' is-open' : ''}`}
          data-open={open}
          role={isDrawerWidth ? 'dialog' : undefined}
          aria-modal={drawerOpen ? 'true' : undefined}
          aria-label={isDrawerWidth ? t.landing.menu : undefined}
        >
          <div className="site-drawer-header">
            <div className="site-drawer-brand">
              <img className="site-logo" src="/logo-mark.svg" alt="" width={40} height={40} />
              <div className="site-brand-text">
                <span className="site-brand-name">{t.brand.name}</span>
                <span className="site-brand-sub" lang={isRtl ? 'en' : 'ar'}>{isRtl ? 'Naseej' : 'نَسيج'}</span>
              </div>
            </div>
            <button
              type="button"
              className="site-drawer-close"
              ref={closeBtnRef}
              onClick={() => closeMenu()}
              aria-label={t.landing.closeMenu}
            >
              <CloseIcon />
            </button>
          </div>

          <nav className="site-nav" aria-label={t.landing.menu}>
            {links.map(([view, label]) => (
              <button key={view} type="button" aria-current={currentView === view ? 'page' : undefined} onClick={() => go(view)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="site-end">
            <div className="site-tools">
              {/* Install button hidden per user request */}
              <ThemeToggle />
              <button
                type="button"
                className="site-util"
                onClick={() => setLang(otherLang)}
                lang={otherLang}
                aria-label={otherLangName}
                title={otherLangName}
              >
                <GlobeIcon />
                <span className="site-util-code" aria-hidden="true">{otherLang === 'en' ? 'EN' : 'ع'}</span>
                <span className="site-util-label">{otherLangName}</span>
              </button>
            </div>

            <div className="site-auth">
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
                  <button type="button" onClick={goWorkspace} className="site-account">
                    <span className="site-account-avatar" aria-hidden="true">{displayName.trim().charAt(0)}</span>
                    <span className="site-account-text">
                      <span className="site-account-name">{displayName}</span>
                      <span className="site-account-role">{roleName}</span>
                    </span>
                  </button>
                  <button type="button" onClick={handleLogout} className="site-link" title={t.nav.logout}>
                    {t.nav.logout}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => go('demo')} className="site-link" aria-current={currentView === 'demo' ? 'page' : undefined}>
                    {t.nav.demo}
                  </button>
                  <button type="button" onClick={() => go('login')} className="btn-pill btn-pill-charcoal site-cta">
                    {t.nav.login}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
