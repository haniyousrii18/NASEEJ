import React, { useMemo, useState } from 'react';
import { useApiData } from '../api.js';
import { addDays, fill, formatDate, nameOf, todayIso } from '../format.js';
import { firstDayOf, monthBounds, monthWeeks, shiftMonth, slotStarts, weekDays, weekdayOf, type ScheduleWindow } from '../reception/calendar.js';
import { usePolledApi } from '../reception/usePolledApi.js';
import { Async, Button, Card, Notice } from '../ui.js';
import { useA } from '../useA.js';

interface DaySummary {
  date: string;
  total: number;
  by_status: Record<string, number>;
}

type View = 'week' | 'month';

/**
 * Center-wide calendar for the manager: per day, how many appointments are booked against how many slots the
 * active working hours offer, with the status mix. It reads the counts-only summary endpoint, so no patient name,
 * reason or phone number is ever loaded here. Picking a day hands the date to the list below it.
 */
export const ManagerCalendar: React.FC<{ doctors: Array<{ user_id: string; full_name_ar: string; full_name_en: string }>; onPickDay: (date: string) => void }> = ({ doctors, onPickDay }) => {
  const A = useA();
  const C = A.care.calendar;
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(todayIso());
  const [doctor, setDoctor] = useState('');
  const first = firstDayOf(A.lang);

  const days = useMemo(() => (view === 'week' ? weekDays(anchor, first) : null), [view, anchor, first]);
  const weeks = useMemo(() => (view === 'month' ? monthWeeks(anchor, first) : null), [view, anchor, first]);
  const range = view === 'week' ? { from: days![0], to: days![6] } : monthBounds(anchor);
  const filter = doctor ? `&clinicianId=${doctor}` : '';

  const summary = usePolledApi<{ days: DaySummary[] }>(`/api/appointments/summary?from=${range.from}&to=${range.to}${filter}`, 60_000);
  const schedules = useApiData<Array<ScheduleWindow & { is_active: boolean }>>('/api/appointments/schedules');

  const capacityOn = (date: string) => {
    if (schedules.state.status !== 'ready') return null;
    const dow = weekdayOf(date);
    const windows = schedules.state.data.filter((w) => w.is_active && w.day_of_week === dow && (!doctor || w.clinician_id === doctor));
    return windows.reduce((sum, w) => sum + slotStarts([w]).length, 0);
  };
  const byDate = (data: { days: DaySummary[] }) => new Map(data.days.map((d) => [d.date, d]));

  const step = (dir: -1 | 1) => setAnchor(view === 'week' ? addDays(anchor, 7 * dir) : shiftMonth(anchor, dir));
  const title =
    view === 'week'
      ? `${formatDate(A.lang, range.from)} – ${formatDate(A.lang, range.to)}`
      : new Intl.DateTimeFormat(A.lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${anchor}T00:00:00`));
  const dayNames = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(A.lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short' }).format(new Date(`${addDays(weekDays('2024-01-07', first)[0], i)}T00:00:00`)));

  const cell = (date: string, data: Map<string, DaySummary>) => {
    const d = data.get(date);
    const capacity = capacityOn(date);
    const booked = d?.total ?? 0;
    const mix = d ? Object.entries(d.by_status).filter(([, n]) => n > 0) : [];
    return (
      <button type="button" className="mc-cell" data-today={date === todayIso()} onClick={() => onPickDay(date)} aria-label={`${formatDate(A.lang, date)}: ${fill(C.booked, { n: booked })}. ${C.openDay}`}>
        <span className="mc-day">{Number(date.slice(8))}</span>
        <span className="mc-load">{capacity === null ? '' : capacity === 0 ? C.noCapacity : fill(C.load, { booked, capacity })}</span>
        {capacity ? <span className="mc-bar" aria-hidden="true"><i style={{ inlineSize: `${Math.min(100, Math.round((booked / capacity) * 100))}%` }} /></span> : null}
        {mix.length > 0 && (
          <span className="mc-mix">
            {mix.map(([s, n]) => `${(A.common.appointmentStatus as Record<string, string>)[s] ?? s} ${n}`).join(' · ')}
          </span>
        )}
      </button>
    );
  };

  return (
    <Card title={C.title} hint={C.subtitle}>
      <div className="mc-bar-top">
        <div className="rec-filters" role="group" aria-label={C.title}>
          {(['week', 'month'] as View[]).map((v) => (
            <button key={v} type="button" className="rec-chip" aria-pressed={view === v} onClick={() => setView(v)}>
              {C[v]}
            </button>
          ))}
        </div>
        <div className="na-row">
          <Button small onClick={() => step(-1)}>{C.prev}</Button>
          <Button small onClick={() => setAnchor(todayIso())}>{C.today}</Button>
          <Button small onClick={() => step(1)}>{C.next}</Button>
        </div>
        <select className="na-select-mini" aria-label={C.clinician} value={doctor} onChange={(e) => setDoctor(e.target.value)}>
          <option value="">{C.allClinicians}</option>
          {doctors.map((d) => (
            <option key={d.user_id} value={d.user_id}>
              {nameOf(A.lang, d)}
            </option>
          ))}
        </select>
      </div>
      <h3 className="ai-title" aria-live="polite">{title}</h3>
      {summary.stale && <Notice tone="warn" live>{C.stale}</Notice>}
      <Async state={summary.state} onRetry={summary.reload}>
        {(data) => {
          const map = byDate(data);
          return (
            <div className="mc-grid" role="group" aria-label={title}>
              <div className="mc-head" aria-hidden="true">
                {dayNames.map((n, i) => <span key={i}>{n}</span>)}
              </div>
              {view === 'week' ? (
                <div className="mc-week">{days!.map((d) => <div key={d}>{cell(d, map)}</div>)}</div>
              ) : (
                weeks!.map((w, i) => (
                  <div className="mc-week" key={i}>
                    {w.map((d, j) => (d ? <div key={d}>{cell(d, map)}</div> : <div key={`x${j}`} className="mc-empty" />))}
                  </div>
                ))
              )}
            </div>
          );
        }}
      </Async>
      <p className="na-help">{C.note}</p>
    </Card>
  );
};
