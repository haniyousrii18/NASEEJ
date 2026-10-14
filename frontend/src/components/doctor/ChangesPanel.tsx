import React from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import { labRows, type ChangeItem } from '../../lib/selectors.js';
import type { PatientData } from '../../lib/types.js';
import { Highlight, Stagger } from '../motion.js';
import { formatDate, Icon, NewTag } from './bits.js';

interface Props {
  data: PatientData;
  changes: ChangeItem[];
  seen: Set<string>;
  announcement: string;
  onSeen: (id: string) => void;
  onMarkAll: () => void;
}

/** "What changed since you last looked": icon + word for unseen items, per-item and bulk acknowledgement. */
export const ChangesPanel = React.forwardRef<HTMLElement, Props>(({ data, changes, seen, announcement, onSeen, onMarkAll }, ref) => {
  const { t, isRtl } = useLang();
  const locale = isRtl ? 'ar-EG' : 'en-GB';
  const unseen = changes.filter((c) => !seen.has(c.id));
  const rows = labRows(data.labOrders);

  const describe = (c: ChangeItem): string => {
    if (c.kind === 'lab') {
      const r = rows.find((x) => `lab:${x.id}` === c.id);
      return r ? `${r.parameter_name}: ${r.value} ${r.unit}` : '';
    }
    if (c.kind === 'rx') {
      const p = data.prescriptions.find((x) => `rx:${x.id}` === c.id);
      return p ? p.items.map((i) => i.medication_name).join(' · ') : '';
    }
    return data.visits.find((v) => `visit:${v.id}` === c.id)?.diagnosis ?? '';
  };

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="doctor-changes-title" className="cloud-feature-card" style={{ padding: 24, outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 id="doctor-changes-title" className="text-card-heading" style={{ fontSize: 18, margin: 0 }}>
          {t.doctor.changes.title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{fmt(t.doctor.changes.unseenCount, { n: unseen.length })}</span>
          <button type="button" className="btn-pill btn-pill-ghost" style={{ fontSize: 13, minHeight: 44 }} disabled={unseen.length === 0} onClick={onMarkAll}>
            {Icon.check}
            <span>{t.doctor.changes.markAll}</span>
          </button>
        </div>
      </div>

      <div role="status" aria-live="polite" style={{ fontSize: 13, color: 'var(--color-status-approved-text)', minHeight: 20 }}>
        {announcement}
      </div>

      {changes.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--color-body-gray)', padding: '8px 0' }}>{t.doctor.changes.none}</p>
      ) : (
        <Stagger style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {changes.slice(0, 12).map((c) => {
            const isSeen = seen.has(c.id);
            return (
              <Highlight key={c.id} active={!isSeen} style={{ borderRadius: 12 }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                    padding: '10px 14px', borderRadius: 12, background: 'var(--color-paper-white)', border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{t.doctor.changes.kind[c.kind]}</span>
                      {!isSeen && <NewTag />}
                      <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{formatDate(c.at, locale)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-body-gray)' }} dir="auto">
                      {describe(c)}
                    </div>
                  </div>
                  {isSeen ? (
                    <span style={{ fontSize: 13, color: 'var(--color-body-gray)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {Icon.check}
                      {t.doctor.changes.seen}
                    </span>
                  ) : (
                    <button type="button" className="btn-pill btn-pill-cloud" style={{ fontSize: 13, padding: '6px 14px', minHeight: 44 }} onClick={() => onSeen(c.id)}>
                      {t.doctor.changes.markSeen}
                    </button>
                  )}
                </div>
              </Highlight>
            );
          })}
        </Stagger>
      )}
    </section>
  );
});
ChangesPanel.displayName = 'ChangesPanel';
