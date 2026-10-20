import React from 'react';
import { useLang } from '../context/LangContext.js';

/**
 * Site footer. Type scale: wordmark 22, column heading 13 (15 in Arabic), body 15, notice 13.5, legal line 13.
 * All styling lives in shell.css under `.site-footer`.
 */
export const Footer: React.FC = () => {
  const { t } = useLang();
  const L = t.landing;

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-grid">
          {/* Brand */}
          <div className="sf-brand">
            <div className="sf-brand-row">
              <img className="sf-logo" src="/logo-mark.svg" alt="" width={44} height={44} />
              <span className="sf-name">{t.brand.fullName}</span>
            </div>
            <p className="sf-lead">{t.brand.subtitle}</p>
            <p className="sf-status">
              <span className="telemetry-beacon" aria-hidden="true" />
              <span>{L.footerNote}</span>
            </p>
          </div>

          {/* Privacy and security */}
          <section className="sf-col" aria-labelledby="sf-privacy">
            <h2 id="sf-privacy" className="sf-heading">{L.footerPrivacy}</h2>
            <ul className="sf-list sf-list--marked">
              <li>{L.t1}</li>
              <li>{L.t2}</li>
              <li>{L.t3}</li>
              <li>{L.t4}</li>
            </ul>
          </section>

          {/* Prototype notice */}
          <section className="sf-col" aria-labelledby="sf-prototype">
            <h2 id="sf-prototype" className="sf-heading">{L.footerPrototype}</h2>
            <p className="sf-notice">{L.footerPrototypeNote}</p>
          </section>
        </div>

        <div className="site-footer-bottom">
          <p className="sf-legal">
            © 2026 {t.brand.fullName}. {L.footerRights}
          </p>
          <ul className="sf-meta">
            <li>PostgreSQL Multi-Tenant</li>
            <li>Role-Based Security</li>
          </ul>
        </div>
      </div>
    </footer>
  );
};
