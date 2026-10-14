import React from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import type { PendingItem } from '../../lib/selectors.js';
import { Stagger } from '../motion.js';
import { formatDate, VisibilityChip, StatusChip } from './bits.js';

interface Props {
  items: PendingItem[];
  onOpen: (kind: PendingItem['kind']) => void;
}

/**
 * Drafts that exist in the system and still need the clinician's approval. This only reflects the
 * existing draft status; it does not track what the clinician has or has not looked at.
 */
export const PendingPanel: React.FC<Props> = ({ items, onOpen }) => {
  const { t, isRtl } = useLang();
  const P = t.doctor.pending;
  const locale = isRtl ? 'ar-EG' : 'en-GB';

  return (
    <section aria-labelledby="doctor-pending-title" className="cloud-feature-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 id="doctor-pending-title" className="text-card-heading" style={{ fontSize: 18, margin: 0 }}>
          {P.title}
        </h3>
        <span role="status" className="status-badge badge-draft" style={{ fontSize: 12 }}>
          {fmt(P.count, { n: items.length })}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-body-gray)', marginBottom: 12 }}>{P.lead}</p>

      {items.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--color-body-gray)' }}>{P.none}</p>
      ) : (
        <Stagger style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.slice(0, 10).map((it) => (
            <div
              key={it.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                padding: '10px 14px', borderRadius: 12, background: 'var(--color-paper-white)', border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{P[it.kind]}</strong>
                  <StatusChip status="draft" />
                  <VisibilityChip visible={false} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-body-gray)', overflowWrap: 'anywhere' }} dir="auto">
                  {it.label} · {formatDate(it.at, locale)}
                </div>
              </div>
              <button type="button" className="btn-pill btn-pill-cloud" style={{ fontSize: 13, padding: '6px 14px', minHeight: 44 }} onClick={() => onOpen(it.kind)}>
                {P.open}
              </button>
            </div>
          ))}
        </Stagger>
      )}
      <p style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 10 }}>{P.separate}</p>
    </section>
  );
};
