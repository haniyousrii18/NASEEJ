import React from 'react';
import { Reveal } from '../components/motion.js';
import { LeafIcon } from '../components/LineIcon.js';
import { useLang } from '../context/LangContext.js';

export const WorkflowPage: React.FC = () => {
  const { t, isRtl } = useLang();

  const steps = [
    { num: '01', title: t.workflow.step1_title, desc: t.workflow.step1_desc, icon: '🆔', accent: 'var(--color-metric-accent)' },
    { num: '02', title: t.workflow.step2_title, desc: t.workflow.step2_desc, icon: '🗓️', accent: 'var(--color-sleep-lilac)' },
    { num: '03', title: t.workflow.step3_title, desc: t.workflow.step3_desc, icon: '🩺', accent: 'var(--color-recovery-green)' },
    { num: '04', title: t.workflow.step4_title, desc: t.workflow.step4_desc, icon: '💊', accent: 'var(--color-coral-signal)' },
    { num: '05', title: t.workflow.step5_title, desc: t.workflow.step5_desc, icon: '✨', accent: 'var(--color-signal-gold)' },
  ];

  return (
    <div className="page-shell" style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div className="recognition-laurel-pair">
          <div className="recognition-laurel-item">
            <LeafIcon />
            <span>{isRtl ? 'تسلسل رحلة الرعاية السريرية' : 'End-to-End Care Journey'}</span>
            <LeafIcon />
          </div>
        </div>
        <h1 className="text-display" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', margin: '14px 0' }}>
          {t.workflow.title}
        </h1>
        <p className="text-subhead" style={{ maxWidth: 640, margin: '0 auto' }}>
          {isRtl
            ? 'سلسلة الإجراءات المترابطة التي تضمن التدفق السلس للمعلومات بين موظفي الاستقبال، والأطباء، والمرضى.'
            : 'An integrated sequence ensuring safe, continuous information flow between reception, clinicians, and patients.'}
        </p>
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {steps.map((s, idx) => (
          <Reveal key={idx} i={idx} className="cloud-feature-card" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 24,
            padding: '28px 32px',
          }}>
            <div style={{
              minWidth: 54,
              height: 54,
              borderRadius: '50%',
              background: 'var(--color-paper-white)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
            }}>
              <span className="emoji-quiet" aria-hidden="true">{s.icon}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 560,
                  color: s.accent,
                  background: 'var(--color-paper-white)',
                  padding: '3px 10px',
                  borderRadius: 128,
                }}>
                  {s.num}
                </span>
                <h3 className="text-card-heading" style={{ fontSize: 22, margin: 0 }}>{s.title}</h3>
              </div>
              <p className="text-body" style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                {s.desc}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
};
