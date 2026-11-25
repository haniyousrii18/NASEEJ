import React from 'react';
import { useLang } from '../context/LangContext.js';
import { ArrowIcon, CheckIcon, ShieldIcon } from './LineIcon.js';

/**
 * Site footer: the brand and its promise; the pages; the privacy commitments in four short lines; what the project
 * is (an academic prototype on synthetic data). Under a hairline: the copyright, the medical disclaimer, and a way
 * back to the top. Styling lives in sections.css under `.sf`.
 */
export const Footer: React.FC<{ setCurrentView: (view: string) => void }> = ({ setCurrentView }) => {
  const { t, lang } = useLang();
  const L = t.landing;
  const year = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { useGrouping: false }).format(2026);

  const go = (view: string) => {
    setCurrentView(view);
    window.scrollTo({ top: 0 });
  };
  const toTop = () => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  };

  const pages: [string, string][] = [
    ['home', t.nav.home],
    ['workflow', t.nav.workflow],
    ['login', t.nav.login],
    ['register', t.nav.register],
  ];

  return (
    <footer className="sf">
      <div className="sf-inner">
        <div className="sf-grid">
          <div className="sf-brand">
            <button type="button" className="sf-brand-row" onClick={() => go('home')} aria-label={`${t.brand.name} · ${t.nav.home}`}>
              <img className="sf-logo" src="/logo-mark.svg" alt="" width={40} height={40} />
              <span className="sf-name">{t.brand.name}</span>
            </button>
            <p className="sf-lead">{t.brand.subtitle}</p>
            <p className="sf-promise">
              <ShieldIcon />
              {L.footerPromise}
            </p>
          </div>

          <nav className="sf-col" aria-labelledby="sf-h-platform">
            <h2 id="sf-h-platform" className="sf-h">
              {L.footerColPlatform}
            </h2>
            <ul className="sf-list">
              {pages.map(([view, label]) => (
                <li key={view}>
                  <button type="button" className="sf-link" onClick={() => go(view)}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="sf-col" aria-labelledby="sf-h-privacy">
            <h2 id="sf-h-privacy" className="sf-h">
              {L.footerColPrivacy}
            </h2>
            <ul className="sf-list sf-list--checks">
              {[L.footerPrivacy1, L.footerPrivacy2, L.footerPrivacy3, L.footerPrivacy4].map((p) => (
                <li key={p}>
                  <CheckIcon />
                  {p}
                </li>
              ))}
            </ul>
          </section>

          <section className="sf-col" aria-labelledby="sf-h-about">
            <h2 id="sf-h-about" className="sf-h">
              {L.footerColAbout}
            </h2>
            <ul className="sf-list sf-list--plain">
              <li>{L.footerAbout1}</li>
              <li>{L.footerAbout2}</li>
              <li>{L.footerAbout3}</li>
            </ul>
            <p className="sf-badge">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
              </svg>
              {L.footerNote}
            </p>
          </section>
        </div>

        <div className="sf-bottom">
          <p className="sf-legal">
            © {year} {t.brand.name}. {L.footerRights}
          </p>
          <p className="sf-disclaimer">{L.footerDisclaimer}</p>
          <button type="button" className="sf-top-btn" onClick={toTop} aria-label={L.footerTop} title={L.footerTop}>
            <ArrowIcon />
          </button>
        </div>
      </div>
    </footer>
  );
};
