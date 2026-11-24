import React, { useId } from 'react';
import { useApiData } from '../api.js';
import { fill, formatDate, localDigits, localeOf } from '../format.js';
import { AppIcon } from '../AppIcons.js';
import { Button, ErrorState } from '../ui.js';
import { useA } from '../useA.js';
import type { Entry } from './forms.js';

/** A blood-pressure measurement: a measurement entry titled as one, with a "120/80"-style value. Anything else is left alone. */
const BP_TITLE = /ضغط|blood\s*pressure|\bB\.?P\b/i;
const BP_VALUE = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/;
const MAX_POINTS = 7;

interface Reading {
  id: string;
  date: string;
  sys: number;
  dia: number;
  source: Entry['source'];
  review: Entry['reviewStatus'];
}

const readingsOf = (entries: Entry[]): Reading[] =>
  entries
    .filter((e) => !e.deletedAt && e.eventDate && BP_TITLE.test(e.title))
    .flatMap((e) => {
      const m = BP_VALUE.exec(e.value ?? '');
      return m ? [{ id: e.id, date: e.eventDate!, sys: Number(m[1]), dia: Number(m[2]), source: e.source, review: e.reviewStatus }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));

/** Chart geometry in viewBox units; the SVG scales to its card. */
const W = 560;
const H = 176;
const PAD = { top: 16, end: 16, bottom: 30, start: 40 };

/**
 * Home: the patient's blood-pressure readings as they were recorded. Two or more readings draw a trend (with the same
 * numbers in a table for screen readers and anyone who prefers one); one reading shows itself; none says "not recorded".
 * No range, no "normal", no colour judgement: reading the numbers stays with the clinician.
 */
export const BpCard: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const B = A.health.home.bp;
  const lang = A.lang;
  const src = A.health.common.source;
  const list = useApiData<Entry[]>('/api/record/entries?kind=measurement');
  const titleId = useId();

  let body: React.ReactNode;
  if (list.state.status === 'loading') {
    body = (
      <div className="hp-td-skel" role="status" aria-live="polite" aria-label={A.common.states.loading}>
        <i />
        <i />
        <i />
      </div>
    );
  } else if (list.state.status === 'error') {
    body = <ErrorState error={list.state.error} onRetry={list.reload} />;
  } else {
    const all = readingsOf(list.state.data);
    const shown = all.slice(-MAX_POINTS);
    const last = all[all.length - 1];
    if (!last) {
      body = (
        <div className="hp-bp-empty">
          <p className="hp-td-lead">
            <span className="hp-bp-none-glyph" aria-hidden="true">—</span>
            {B.noneTitle}
          </p>
          <p className="na-muted">{B.noneBody}</p>
          <div className="hp-td-actions">
            <Button icon="plus" onClick={() => navigate('patient/profile?tab=measurement&new=1')}>
              {B.add}
            </Button>
          </div>
        </div>
      );
    } else {
      const unconfirmed = last.review === 'needs_review';
      body = (
        <>
          <div className="hp-bp-latest">
            <div>
              <span className="hp-bp-label">{B.latest}</span>
              <p className="hp-bp-value">
                <bdi className="hp-bp-num" dir="ltr">
                  {localDigits(lang, `${last.sys}/${last.dia}`)}
                </bdi>
                <span className="hp-bp-unit">{B.unit}</span>
              </p>
            </div>
            <ul className="hp-bp-facts">
              <li>
                <AppIcon name="calendar" size={14} />
                {fill(B.onDate, { date: formatDate(lang, last.date) })}
              </li>
              <li>
                <AppIcon name={last.source === 'clinician' ? 'shield' : last.source === 'document' ? 'documents' : 'user'} size={14} />
                {src[last.source]}
              </li>
              {unconfirmed && (
                <li className="hp-bp-review">
                  <span aria-hidden="true">◌</span>
                  {B.needsReview}
                </li>
              )}
            </ul>
          </div>
          {shown.length >= 2 ? <Trend readings={shown} labelledBy={titleId} /> : <p className="na-muted hp-bp-one">{B.oneReading}</p>}
          {shown.length >= 2 && (
            <details className="hp-bp-table">
              <summary>{B.table}</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{B.date}</th>
                    <th scope="col">{B.systolic}</th>
                    <th scope="col">{B.diastolic}</th>
                    <th scope="col">{B.source}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...shown].reverse().map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(lang, r.date)}</td>
                      <td>{localDigits(lang, String(r.sys))}</td>
                      <td>{localDigits(lang, String(r.dia))}</td>
                      <td>
                        {src[r.source]}
                        {r.review === 'needs_review' && ` · ${B.needsReview}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      );
    }
  }

  return (
    <section className="hp-td-block hp-bp" aria-labelledby={titleId} style={{ '--i': 3 } as React.CSSProperties}>
      <div className="hp-section-h">
        <h2 id={titleId} className="hp-h2">
          <span className="hp-bp-icon" aria-hidden="true">
            <AppIcon name="pulse" size={18} />
          </span>
          {B.title}
        </h2>
        <Button small variant="quiet" onClick={() => navigate('patient/profile?tab=measurement')}>
          {B.open}
        </Button>
      </div>
      {body}
    </section>
  );
};

/** The trend: systolic and diastolic as two lines on one time axis that always runs left to right, like a printed chart. */
const Trend: React.FC<{ readings: Reading[]; labelledBy: string }> = ({ readings, labelledBy }) => {
  const A = useA();
  const B = A.health.home.bp;
  const lang = A.lang;
  const lo = Math.floor((Math.min(...readings.map((r) => r.dia)) - 10) / 10) * 10;
  const hi = Math.ceil((Math.max(...readings.map((r) => r.sys)) + 10) / 10) * 10;
  const innerW = W - PAD.start - PAD.end;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.start + (readings.length === 1 ? innerW / 2 : (i * innerW) / (readings.length - 1));
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const line = (k: 'sys' | 'dia') => readings.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join(' ');
  const area = `${line('sys')} L${x(readings.length - 1).toFixed(1)} ${y(lo)} L${x(0).toFixed(1)} ${y(lo)} Z`;
  const ticks = [lo, Math.round((lo + hi) / 20) * 10, hi];
  const day = new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short' });

  return (
    <figure className="hp-bp-chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${B.chartLabel}. ${fill(B.readings, { n: readings.length })}`} aria-describedby={labelledBy}>
        <defs>
          <linearGradient id="hp-bp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="hp-bp-grid" x1={PAD.start} x2={W - PAD.end} y1={y(t)} y2={y(t)} />
            <text className="hp-bp-axis" x={PAD.start - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
              {localDigits(lang, String(t))}
            </text>
          </g>
        ))}
        <path className="hp-bp-area" d={area} fill="url(#hp-bp-fill)" />
        <path className="hp-bp-line hp-bp-line--dia" d={line('dia')} pathLength={1} />
        <path className="hp-bp-line hp-bp-line--sys" d={line('sys')} pathLength={1} />
        {readings.map((r, i) => (
          <g key={r.id} className="hp-bp-pt" data-review={r.review === 'needs_review' || undefined}>
            <circle cx={x(i)} cy={y(r.sys)} r={4.5} className="hp-bp-dot hp-bp-dot--sys" />
            <circle cx={x(i)} cy={y(r.dia)} r={3.5} className="hp-bp-dot hp-bp-dot--dia" />
            <text className="hp-bp-axis" x={x(i)} y={H - 8} textAnchor="middle">
              {day.format(new Date(`${r.date}T00:00:00`))}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="hp-bp-legend" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <span>
          <i className="hp-bp-key hp-bp-key--sys" aria-hidden="true" />
          {B.systolic}
        </span>
        <span>
          <i className="hp-bp-key hp-bp-key--dia" aria-hidden="true" />
          {B.diastolic}
        </span>
      </figcaption>
    </figure>
  );
};
