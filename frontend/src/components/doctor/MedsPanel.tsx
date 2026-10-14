import React from 'react';
import { useLang } from '../../context/LangContext.js';
import type { Prescription } from '../../lib/types.js';
import { Stagger } from '../motion.js';
import { formatDate, StatusChip, VisibilityChip } from './bits.js';

interface Props {
  prescriptions: Prescription[];
  canAdd: boolean;
  onAdd: () => void;
  onApprove: (rx: Prescription) => void;
}

/** Prescriptions with their existing draft/approved status and whether the patient can see them. */
export const MedsPanel = React.forwardRef<HTMLElement, Props>(({ prescriptions, canAdd, onAdd, onApprove }, ref) => {
  const { t, isRtl } = useLang();
  const M = t.doctor.meds;
  const locale = isRtl ? 'ar-EG' : 'en-GB';

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="doctor-meds-title" className="cloud-feature-card" style={{ padding: 20, outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
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

      {prescriptions.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--color-body-gray)', padding: '8px 0' }}>{M.empty}</p>
      ) : (
        <Stagger style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {prescriptions.map((p) => (
            <div key={p.id} style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--color-paper-white)', border: '1px solid var(--color-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{formatDate(p.created_at, locale)}</span>
                <StatusChip status={p.status === 'approved' || p.status === 'dispensed' ? 'approved' : 'draft'} />
                <VisibilityChip visible={p.status === 'approved' || p.status === 'dispensed'} />
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.items.map((i) => (
                  <li key={i.id} style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                    <bdi className="latin" style={{ fontWeight: 520 }}>{i.medication_name}</bdi>{' '}
                    <span style={{ color: 'var(--color-body-gray)' }}>
                      <bdi className="num">{i.dosage}</bdi> · {i.frequency} · {i.duration}
                    </span>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 6 }}>
                {p.status === 'approved' || p.status === 'dispensed' ? M.approvedNote : M.draftNote}
              </p>
              {p.status === 'draft' && (
                <button type="button" className="btn-pill btn-pill-charcoal" style={{ fontSize: 13, minHeight: 44, marginTop: 8 }} onClick={() => onApprove(p)}>
                  ✓ {t.clinical.approveRxBtn}
                </button>
              )}
            </div>
          ))}
        </Stagger>
      )}
    </section>
  );
});
MedsPanel.displayName = 'MedsPanel';
