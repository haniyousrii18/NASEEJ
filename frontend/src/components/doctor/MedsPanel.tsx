import React from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import type { Interaction, Prescription } from '../../lib/types.js';
import { Rise, Stagger } from '../motion.js';
import { AiTag, formatDate, Icon, SeverityChip } from './bits.js';

interface Props {
  prescriptions: Prescription[];
  interactions: Interaction[];
  canAdd: boolean;
  onAdd: () => void;
}

export const MedsPanel = React.forwardRef<HTMLElement, Props>(({ prescriptions, interactions, canAdd, onAdd }, ref) => {
  const { t, isRtl } = useLang();
  const M = t.doctor.meds;
  const locale = isRtl ? 'ar-EG' : 'en-GB';

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="doctor-meds-title" className="cloud-feature-card" style={{ padding: 24, outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 id="doctor-meds-title" className="text-card-heading" style={{ fontSize: 18, margin: 0 }}>
          {M.title}
        </h3>
        <button type="button" className="btn-pill btn-pill-cloud" style={{ fontSize: 13, minHeight: 44 }} disabled={!canAdd} aria-describedby={canAdd ? undefined : 'doctor-rx-hint'} onClick={onAdd}>
          + {M.issueFor}
        </button>
      </div>
      {!canAdd && (
        <p id="doctor-rx-hint" style={{ fontSize: 12, color: 'var(--color-body-gray)', marginBottom: 10 }}>
          {M.needDraftVisit}
        </p>
      )}

      {/* Interaction alerts go to the doctor first. They are never shown to the patient. */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{M.interactions}</span>
          <AiTag withNote />
        </div>
        {interactions.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{M.noInteractions}</p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none' }}>
            {interactions.map((x) => (
              <li key={x.id}>
                <Rise urgent role={x.severity === 'high' ? 'alert' : undefined}>
                  <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <SeverityChip severity={x.severity} />
                      <strong style={{ fontSize: 14 }} dir="auto">
                        {fmt(M.interactionBetween, { a: x.a, b: x.b })}
                      </strong>
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{isRtl ? x.message_ar : x.message_en}</div>
                  </div>
                </Rise>
              </li>
            ))}
          </ul>
        )}
      </div>

      {prescriptions.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--color-body-gray)', padding: '8px 0' }}>{M.empty}</p>
      ) : (
        <Stagger style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {prescriptions.map((p) => (
            <div key={p.id} style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--color-paper-white)', border: '1px solid var(--color-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{formatDate(p.created_at, locale)}</span>
                <span className={`status-badge ${p.status === 'approved' ? 'badge-approved' : 'badge-draft'}`} style={{ fontSize: 12 }}>
                  {p.status === 'approved' ? Icon.check : Icon.circle}
                  <span>{p.status === 'approved' ? t.clinical.approved : t.clinical.draft}</span>
                </span>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.items.map((i) => (
                  <li key={i.id} style={{ fontSize: 14 }}>
                    <bdi className="latin" style={{ fontWeight: 600 }}>{i.medication_name}</bdi>{' '}
                    <span style={{ color: 'var(--color-body-gray)' }}>
                      <bdi className="num">{i.dosage}</bdi> · {i.frequency} · {i.duration}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Stagger>
      )}
    </section>
  );
});
MedsPanel.displayName = 'MedsPanel';
