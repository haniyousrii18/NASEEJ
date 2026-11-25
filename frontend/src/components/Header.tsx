import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../context/LangContext.js';
import { useAuth } from '../context/AuthContext.js';
import { ThemeToggle } from './ThemeToggle.js';
import { DownloadIcon, GlobeIcon } from './LineIcon.js';
import { useInstall } from '../pwa/InstallContext.js';

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

// Views whose first screen is full-bleed art. The bar floats transparent over them until the page scrolls.
const OVERLAY_VIEWS = ['home', 'login', 'register'];

/**
 * Site bar. Hierarchy, start to end: brand, primary links, quiet utilities (install, theme, language), then the
 * account area. Nothing is ever folded away behind a menu: on narrower windows the same items reflow into rows
 * (brand + utilities, then links, then sign-in buttons), see the site-bar rules in responsive.css.
 */
export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  const { lang, setLang, t, isRtl } = useLang();
  const { user, logout, currentRole } = useAuth();
  const installApp = useInstall();
  const [scrolled, setScrolled] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  // The bar turns solid once the page has moved.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The bar's real height (one row on wide windows, two or three on narrow ones) is published as --site-bar-h,
  // so a full-bleed first screen starts exactly below it at every width.
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty('--site-bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--site-bar-h');
    };
  }, []);

  const go = (view: string) => setCurrentView(view);

  // Ending the session also leaves the protected page, so one click lands on the login page.
  const handleLogout = () => {
    logout();
    go('login');
  };

  const goWorkspace = () => {
    if (!user) return;
    go(user.patientProfileId ? 'portal' : 'workspace');
  };

  const links: Array<[string, string]> = [
    ['home', t.nav.home],
    ['workflow', t.nav.workflow],
  ];

  const otherLang = lang === 'ar' ? 'en' : 'ar';
  const otherLangName = lang === 'ar' ? 'English' : 'العربية';
  const displayName = user ? (isRtl ? user.fullNameAr : user.fullNameEn) : '';
  const roleName = user ? t.roles[currentRole as keyof typeof t.roles] || currentRole : '';

  const onAuthPage = currentView === 'login' || currentView === 'register';

  return (
    <header ref={barRef} className="site-bar" data-overlay={OVERLAY_VIEWS.includes(currentView)} data-scrolled={scrolled} data-menu={false}>
      <div className="site-bar-inner">
        <button type="button" className="site-brand" onClick={() => go('home')} aria-label={`${t.brand.name} · ${t.nav.home}`}>
          <img className="site-logo" src="/logo-mark.svg" alt="" width={54} height={54} />
          <span className="site-brand-text">
            <span className="site-brand-name">{t.brand.name}</span>
            <span className="site-brand-sub" lang={isRtl ? 'en' : 'ar'}>{isRtl ? 'MARJA' : 'مرجع'}</span>
          </span>
        </button>

        <nav className="site-nav" aria-label={t.landing.menu}>
          {links.map(([view, label]) => (
            <button key={view} type="button" aria-current={currentView === view ? 'page' : undefined} onClick={() => go(view)}>
              {label}
            </button>
          ))}
        </nav>

        {/* Icon utilities: install, theme, language. */}
        <div className="site-actions" role="group" aria-label={t.landing.menu}>
          {installApp.available && (
            <button type="button" className="site-act" onClick={() => void installApp.install()} aria-label={t.nav.install} title={t.nav.install}>
              <DownloadIcon />
            </button>
          )}
          <ThemeToggle compact />
          <button type="button" className="site-act" onClick={() => setLang(otherLang)} lang={otherLang} aria-label={otherLangName} title={otherLangName}>
            <GlobeIcon />
          </button>
        </div>

        {user ? (
          <div className="site-auth">
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
          </div>
        ) : (
          !onAuthPage && (
            <div className="site-auth">
              <button type="button" className="site-cta site-cta--ghost" onClick={() => go('login')}>
                {t.nav.login}
              </button>
              <button type="button" className="site-cta site-cta--fill" onClick={() => go('register')}>
                {t.nav.register}
              </button>
            </div>
          )
        )}
      </div>
    </header>
  );
};
