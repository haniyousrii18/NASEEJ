import React, { useMemo } from 'react';
import { useApiData } from '../api.js';
import { formatDate, nameOf } from '../format.js';
import { Async, Card, EmptyState, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { ReviewPill } from './badges.js';
import type { TimelineItem } from './Timeline.js';

interface Group {
  key: string;
  label: string;
  rows: TimelineItem[];
  units: string[];
  numeric: boolean;
}

const isNumeric = (v: unknown) => typeof v === 'string' || typeof v === 'number' ? v !== '' && Number.isFinite(Number(String(v).replace(',', '.'))) : false;

/**
 * Repeated lab results grouped by parameter. A group is marked comparable only when every reading
 * has the same unit and a numeric value; otherwise the readings are listed and the reason is stated.
 * No arrows, colors or wording suggest improvement or worsening: reading change stays with the clinician.
 */
export const ResultsComparison: React.FC<{ endpoint: string }> = ({ endpoint }) => {
  const A = useA();
  const R = A.record.results;
  const { state, reload } = useApiData<TimelineItem[]>(`${endpoint}?type=lab_result&limit=100`);

  return (
    <Card title={R.title}>
      <Async
        state={state}
        onRetry={reload}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={R.none} body={R.noneBody} />}
      >
        {(items) => <Groups items={items} />}
      </Async>
    </Card>
  );
};

const Groups: React.FC<{ items: TimelineItem[] }> = ({ items }) => {
  const A = useA();
  const R = A.record.results;
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const it of items) {
      const d = it.data;
      const test = (A.lang === 'ar' ? d.testNameAr || d.testNameEn : d.testNameEn || d.testNameAr) as string;
      const key = `${String(d.testNameEn || d.testNameAr || '')}|${String(d.parameterName || '').toLowerCase()}`;
      const g = map.get(key) ?? { key, label: `${test} · ${d.parameterName}`, rows: [], units: [], numeric: true };
      g.rows.push(it);
      const unit = String(d.unit ?? '').trim();
      if (!g.units.includes(unit)) g.units.push(unit);
      if (!isNumeric(d.value)) g.numeric = false;
      map.set(key, g);
    }
    for (const g of map.values()) g.rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }, [items, A.lang]);

  return (
    <div className="na-stack">
      {groups.map((g) => {
        const verdict =
          g.rows.length < 2 ? R.single : g.units.length > 1 ? R.unitsDiffer : !g.numeric ? R.notNumeric : R.comparable;
        const comparable = g.rows.length >= 2 && g.units.length === 1 && g.numeric;
        return (
          <section key={g.key} className="na-card na-card--flat" aria-label={g.label}>
            <div className="na-card-h">
              <h3 className="na-card-title">{g.label}</h3>
              <Pill tone={comparable ? 'ok' : 'neutral'}>{verdict}</Pill>
            </div>
            <div className="na-table-wrap">
              <table className="na-table">
                <thead>
                  <tr>
                    <th>{R.date}</th>
                    <th>{A.common.record.value}</th>
                    <th>{A.common.record.reference}</th>
                    <th>{R.recordedBy}</th>
                    <th>{A.common.record.reviewedAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(A.lang, r.occurredAt)}</td>
                      <td className="na-ltr">
                        <strong>{String(r.data.value)}</strong> {String(r.data.unit ?? '')}
                        {r.data.flaggedAbnormalByClinician ? <Pill tone="warn" title={A.common.record.flaggedAbnormal}>{A.common.record.flaggedAbnormal}</Pill> : null}
                      </td>
                      <td className="na-ltr">{String(r.data.referenceRange ?? '') || '—'}</td>
                      <td>{nameOf(A.lang, r.organization)}</td>
                      <td>
                        <ReviewPill status={r.reviewStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
};
