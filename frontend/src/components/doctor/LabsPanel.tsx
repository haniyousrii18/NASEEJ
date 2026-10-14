import React, { useMemo, useState } from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import { labRows, type LabRow } from '../../lib/selectors.js';
import type { LabOrder } from '../../lib/types.js';
import { Highlight } from '../motion.js';
import { formatDate, Icon, NewTag } from './bits.js';

const RANGE = /(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/;
const toNum = (s: string) => parseFloat(s.replace(',', '.'));

/** Compact bar: shaded reference band with a marker. Out-of-range values get a diamond. */
const RangeBar: React.FC<{ row: LabRow; label: string }> = ({ row, label }) => {
  const m = row.reference_range?.match(RANGE);
  const v = toNum(row.value);
  if (!m || !Number.isFinite(v)) return <span style={{ color: 'var(--color-body-gray)' }}>—</span>;
  const lo = toNum(m[1]);
  const hi = toNum(m[2]);
  const span = Math.max(hi - lo, 1e-6);
  const min = lo - span * 0.6;
  const max = hi + span * 0.6;
  const pos = (n: number) => Math.min(100, Math.max(0, ((n - min) / (max - min)) * 100));
  const out = v < lo || v > hi;
  // The bar is a numeric axis, so it stays left-to-right even in RTL pages.
  return (
    <svg role="img" aria-label={`${label}: ${row.value} (${row.reference_range})`} width="120" height="18" viewBox="0 0 120 18" style={{ direction: 'ltr' }}>
      <rect x="0" y="7" width="120" height="4" rx="2" fill="var(--color-border-subtle)" />
      <rect x={pos(lo) * 1.2} y="6" width={Math.max((pos(hi) - pos(lo)) * 1.2, 2)} height="6" rx="3" fill="var(--color-status-approved-border)" />
      {out ? (
        <path d={`M${pos(v) * 1.2} 1l6 8-6 8-6-8z`} fill="var(--color-ink)" />
      ) : (
        <circle cx={pos(v) * 1.2} cy="9" r="5" fill="var(--color-ink)" />
      )}
    </svg>
  );
};

interface Props {
  orders: LabOrder[];
  unseen: Set<string>;
  onOrder: () => void;
}

export const LabsPanel = React.forwardRef<HTMLElement, Props>(({ orders, unseen, onOrder }, ref) => {
  const { t, isRtl } = useLang();
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);
  const locale = isRtl ? 'ar-EG' : 'en-GB';
  const rows = useMemo(() => labRows(orders), [orders]);
  const shown = onlyAbnormal ? rows.filter((r) => r.is_abnormal) : rows;
  const pending = orders.filter((o) => (o.results ?? []).length === 0).length;
  const L = t.doctor.labs;

  const trendText = (r: LabRow) =>
    r.trend === 'up' ? L.trendUp : r.trend === 'down' ? L.trendDown : r.trend === 'flat' ? L.trendFlat : '';
  const trendIcon = (r: LabRow) => (r.trend === 'up' ? Icon.up : r.trend === 'down' ? Icon.down : Icon.flat);

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="doctor-labs-title" className="cloud-feature-card" style={{ padding: 24, outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 id="doctor-labs-title" className="text-card-heading" style={{ fontSize: 18, margin: 0 }}>
          {L.title}
        </h3>
        <div role="group" aria-label={L.title} style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" aria-pressed={!onlyAbnormal} className={`btn-pill ${!onlyAbnormal ? 'btn-pill-charcoal' : 'btn-pill-ghost'}`} style={{ fontSize: 13, padding: '6px 14px', minHeight: 44 }} onClick={() => setOnlyAbnormal(false)}>
            {L.showAll}
          </button>
          <button type="button" aria-pressed={onlyAbnormal} className={`btn-pill ${onlyAbnormal ? 'btn-pill-charcoal' : 'btn-pill-ghost'}`} style={{ fontSize: 13, padding: '6px 14px', minHeight: 44 }} onClick={() => setOnlyAbnormal(true)}>
            {Icon.diamond}
            <span>{L.onlyAbnormal}</span>
          </button>
        </div>
      </div>

      {pending > 0 && <p style={{ fontSize: 13, color: 'var(--color-body-gray)', marginBottom: 10 }}>{fmt(L.pendingOrders, { n: pending })}</p>}

      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--color-body-gray)' }}>
          <p style={{ fontSize: 14, marginBottom: 14 }}>{L.empty}</p>
          <button type="button" className="btn-pill btn-pill-charcoal" style={{ fontSize: 14, minHeight: 44 }} onClick={onOrder}>
            + {L.emptyAction}
          </button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{L.title}</caption>
            <thead>
              <tr>
                <th scope="col">{L.parameter}</th>
                <th scope="col">{L.value}</th>
                <th scope="col">{L.range}</th>
                <th scope="col">{L.previous}</th>
                <th scope="col">{L.change}</th>
                <th scope="col">{L.date}</th>
                <th scope="col">{L.status}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <th scope="row" style={{ textAlign: 'start', fontWeight: 600 }}>
                    <Highlight active={unseen.has(`lab:${r.id}`)} style={{ borderRadius: 8 }}>
                      <div dir="auto">{r.parameter_name}</div>
                      <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-body-gray)' }} dir="auto">
                        {isRtl ? r.testName_ar : r.testName_en}
                      </div>
                      {unseen.has(`lab:${r.id}`) && <NewTag />}
                    </Highlight>
                  </th>
                  <td>
                    <bdi className="num" style={{ fontWeight: 700 }}>
                      {r.value} {r.unit}
                    </bdi>
                    <div style={{ marginTop: 4 }}>
                      <RangeBar row={r} label={L.rangeBar} />
                    </div>
                  </td>
                  <td>
                    <bdi className="num">{r.reference_range || '—'}</bdi>
                  </td>
                  <td>{r.previous ? <bdi className="num">{r.previous.value}</bdi> : L.noPrevious}</td>
                  <td>
                    {r.trend ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {trendIcon(r)}
                        <bdi className="num">
                          {r.delta! > 0 ? '+' : ''}
                          {r.delta}
                        </bdi>
                        <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{trendText(r)}</span>
                      </span>
                    ) : (
                      L.noPrevious
                    )}
                  </td>
                  <td>{formatDate(r.date, locale)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {r.is_abnormal ? (
                        <span className="status-badge badge-danger" style={{ fontSize: 12 }}>
                          {Icon.diamond}
                          <span>{L.abnormal}</span>
                        </span>
                      ) : (
                        <span className="status-badge badge-approved" style={{ fontSize: 12 }}>
                          {Icon.check}
                          <span>{L.normal}</span>
                        </span>
                      )}
                      <span className={`status-badge ${r.status === 'approved' ? 'badge-info' : 'badge-draft'}`} style={{ fontSize: 12 }}>
                        {r.status === 'approved' ? L.approvedResult : L.draftResult}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
LabsPanel.displayName = 'LabsPanel';
