import React from 'react';
import { useLang } from '../context/LangContext.js';

export const Footer: React.FC = () => {
  const { t, isRtl } = useLang();

  return (
    <footer className="site-footer" style={{
      background: 'var(--color-paper-white)',
      borderTop: '1px solid var(--color-border-subtle)',
      padding: '80px 24px 48px',
      marginTop: 'auto',
    }}>
      <div className="site-footer-grid" style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
        gap: 48,
        marginBottom: 64,
      }}>
        {/* Brand Column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <img src="/logo.png" alt="Naseej Logo" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <span style={{ fontSize: 20, fontWeight: 520, color: 'var(--color-ink)', letterSpacing: '-0.3px' }}>
              {t.brand.fullName}
            </span>
          </div>
          <p style={{ fontSize: 15, color: 'var(--color-body-gray)', lineHeight: 1.6, maxWidth: 320 }}>
            {t.brand.subtitle}
          </p>
          <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              className="telemetry-beacon"
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-recovery-green)',
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--color-body-gray)', fontWeight: 480 }}>
              {t.landing.footerNote}
            </span>
          </div>
        </div>

        {/* Security & Isolation */}
        <div>
          <h4 style={{
            fontSize: 14,
            fontWeight: 520,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-ink)',
            marginBottom: 20,
          }}>
            {isRtl ? 'الأمان والخصوصية' : 'Privacy & Security'}
          </h4>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <li style={{ fontSize: 16, color: 'var(--color-ink)', fontWeight: 480 }}>
              {t.features.f1_title}
            </li>
            <li style={{ fontSize: 16, color: 'var(--color-ink)', fontWeight: 480 }}>
              {t.features.f2_title}
            </li>
            <li style={{ fontSize: 16, color: 'var(--color-ink)', fontWeight: 480 }}>
              {t.features.f4_title}
            </li>
            <li style={{ fontSize: 16, color: 'var(--color-ink)', fontWeight: 480 }}>
              {t.features.f5_title}
            </li>
          </ul>
        </div>

        {/* Roles Covered */}
        <div>
          <h4 style={{
            fontSize: 14,
            fontWeight: 520,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-ink)',
            marginBottom: 20,
          }}>
            {isRtl ? 'أدوار النظام' : 'System Personas'}
          </h4>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <li style={{ fontSize: 16, color: 'var(--color-body-gray)', fontWeight: 480 }}>{t.roles.platform_admin}</li>
            <li style={{ fontSize: 16, color: 'var(--color-body-gray)', fontWeight: 480 }}>{t.roles.center_manager}</li>
            <li style={{ fontSize: 16, color: 'var(--color-body-gray)', fontWeight: 480 }}>{t.roles.doctor}</li>
            <li style={{ fontSize: 16, color: 'var(--color-body-gray)', fontWeight: 480 }}>{t.roles.reception}</li>
            <li style={{ fontSize: 16, color: 'var(--color-body-gray)', fontWeight: 480 }}>{t.roles.patient}</li>
          </ul>
        </div>

        {/* Academic Prototype Notice */}
        <div>
          <h4 style={{
            fontSize: 14,
            fontWeight: 520,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-ink)',
            marginBottom: 20,
          }}>
            {isRtl ? 'بيئة النموذج التجريبي' : 'Academic Prototype'}
          </h4>
          <div style={{
            background: 'var(--color-cloud-card)',
            borderRadius: 16,
            padding: '20px',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--color-body-gray)',
          }}>
            {isRtl
              ? 'مشروع تخرج ونموذج أكاديمي حاسوبي متقدم. جميع البيانات المعروضة تركيبية واختبارية (Synthetic Data) ولا تشتمل على أي بيانات مرضى حقيقية.'
              : 'University Academic Prototype. All demonstration data is strictly synthetic. Designed on modern Cloudlight principles.'}
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        paddingTop: 32,
        borderTop: '1px solid var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        fontSize: 14,
        color: 'var(--color-body-gray)',
      }}>
        <div>© 2026 {t.brand.fullName}. All rights reserved.</div>
        <div className="footer-meta-links" style={{ display: 'flex', gap: 20 }}>
          <span>PostgreSQL Multi-Tenant</span>
          <span>•</span>
          <span>Role-Based Security</span>
          <span>•</span>
          <span>HL7 / FHIR Ready</span>
        </div>
      </div>
    </footer>
  );
};
