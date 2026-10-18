import React, { useEffect, useState } from 'react';
import { AppIcon, type IconName } from '../AppIcons.js';
import { useApiData } from '../api.js';
import { addDays, fill, formatDate, localeOf, nameOf, todayIso } from '../format.js';
import type { AppointmentRow } from '../pages/AppointmentList.js';
import { Async, Button, Card, EmptyState, Field, Loading, Notice, PageHead } from '../ui.js';
import { useA } from '../useA.js';
import { covers, firstDayOf, monthBounds, monthWeeks, shiftMonth, timeRows, weekDays, weekdayOf, windowsFor, type ScheduleWindow } from './calendar.js';
import { AppointmentDrawer } from './AppointmentDrawer.js';
import { BookingDrawer, type BookingPreset } from './BookingDrawer.js';
import { useDoctors, type Doctor } from './useDoctors.js';
import { usePolledApi } from './usePolledApi.js';

type View = 'day' | 'week' | 'month';

interface DaySummary {
  date: string;
  total: number;
  by_status: Record<string, number>;
}

const GLYPH: Record<string, IconName> = {
  pending: 'clock',
  confirmed: 'calendar',
  checked_in: 'door',
  in_consultation: 'pulse',
  completed: 'check',
  no_show: 'alert',
};

const timeOf = (r: AppointmentRow) => String(r.start_time).slice(0, 5);
const isLive = (r: AppointmentRow) => r.status !== 'cancelled';

/** A booked appointment inside a grid cell. The status is the glyph plus, when there is room, its word. */
const Chip: React.FC<{ row: AppointmentRow; compact?: boolean; onOpen: (id: string) => void; selected: boolean }> = ({ row, compact, onOpen, selected }) => {
  const A = useA();
  const status = (A.common.appointmentStatus as Record<string, string>)[row.status] ?? row.status;
  const patient = nameOf(A.lang, { name_ar: row.patient_name_ar, name_en: row.patient_name_en });
  return (
    <button type="button" className="na-sched-chip" data-status={row.status} aria-pressed={selected} aria-label={`${patient}, ${status}`} title={`${patient} · ${status}`} onClick={() => onOpen(row.id)}>
      <AppIcon name={GLYPH[row.status] ?? 'clock'} size={14} className="na-icon" />
      <span className="na-sched-chip-text">
        <span className="na-sched-chip-name">{patient}</span>
        {!compact && <span className="na-sched-chip-status">{status}</span>}
      </span>
    </button>
  );
};

interface GridProps {
  rows: AppointmentRow[];
  windows: ScheduleWindow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onBook: (doctorId: string, date: string, time: string) => void;
}

/** True once the slot has started: no booking can begin in it any more. */
const elapsed = (date: string, time: string) => {
  const today = todayIso();
  return date < today || (date === today && time <= new Date().toTimeString().slice(0, 5));
};

const EmptyCell: React.FC<{ doctor: Doctor; date: string; time: string; working: boolean; onBook: GridProps['onBook'] }> = ({ doctor, date, time, working, onBook }) => {
  const A = useA();
  if (!working) return <span className="na-sched-off" aria-label={A.reception.schedule.off} title={A.reception.schedule.off}>·</span>;
  if (elapsed(date, time)) return null;
  return (
    <button type="button" className="na-sched-free" aria-label={fill(A.reception.schedule.bookAt, { time, doctor: nameOf(A.lang, doctor), date: formatDate(A.lang, date) })} onClick={() => onBook(doctor.user_id, date, time)}>
      <AppIcon name="plus" size={14} />
    </button>
  );
};

const DayTable: React.FC<GridProps & { date: string; doctors: Doctor[] }> = ({ date, doctors, rows, windows, selectedId, onOpen, onBook }) => {
  const A = useA();
  const S = A.reception.schedule;
  const dow = weekdayOf(date);
  const wins = (d: Doctor) => windowsFor(windows, d.user_id, dow);
  const live = rows.filter((r) => isLive(r) && r.appointment_date === date);
  const times = timeRows(doctors.flatMap(wins), live.map(timeOf));
  if (times.length === 0) return <EmptyState title={S.noHours} />;
  return (
    <div className="na-sched-scroll">
      <table className="na-sched">
        <caption className="na-sr">{formatDate(A.lang, date)}</caption>
        <thead>
          <tr>
            <th scope="col">{A.ops.appt.time}</th>
            {doctors.map((d) => (
              <th scope="col" key={d.user_id}>
                {nameOf(A.lang, d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => (
            <tr key={t}>
              <th scope="row" className="na-ltr">
                {t}
              </th>
              {doctors.map((d) => {
                const row = live.find((r) => r.clinician_id === d.user_id && timeOf(r) === t);
                return (
                  <td key={d.user_id}>
                    {row ? <Chip row={row} selected={selectedId === row.id} onOpen={onOpen} /> : <EmptyCell doctor={d} date={date} time={t} working={covers(wins(d), t)} onBook={onBook} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const WeekTable: React.FC<GridProps & { days: string[]; doctor: Doctor; onPickDay: (d: string) => void }> = ({ days, doctor, rows, windows, selectedId, onOpen, onBook, onPickDay }) => {
  const A = useA();
  const S = A.reception.schedule;
  const today = todayIso();
  const wins = (d: string) => windowsFor(windows, doctor.user_id, weekdayOf(d));
  const live = rows.filter((r) => isLive(r) && r.clinician_id === doctor.user_id);
  const times = timeRows(days.flatMap(wins), live.map(timeOf));
  const dayName = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(localeOf(A.lang), opts).format(new Date(`${d}T00:00:00`));
  if (times.length === 0) return <EmptyState title={S.noHours} />;
  return (
    <div className="na-sched-scroll">
      <table className="na-sched na-sched--week">
        <caption className="na-sr">{nameOf(A.lang, doctor)}</caption>
        <thead>
          <tr>
            <th scope="col">{A.ops.appt.time}</th>
            {days.map((d) => (
              <th scope="col" key={d} aria-current={d === today ? 'date' : undefined} data-today={d === today || undefined}>
                <button type="button" className="na-sched-daybtn" onClick={() => onPickDay(d)} aria-label={dayName(d, { dateStyle: 'full' })}>
                  <span>{dayName(d, { weekday: 'short' })}</span>
                  <b>{dayName(d, { day: 'numeric' })}</b>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => (
            <tr key={t}>
              <th scope="row" className="na-ltr">
                {t}
              </th>
              {days.map((d) => {
                const row = live.find((r) => r.appointment_date === d && timeOf(r) === t);
                return (
                  <td key={d}>
                    {row ? <Chip row={row} compact selected={selectedId === row.id} onOpen={onOpen} /> : <EmptyCell doctor={doctor} date={d} time={t} working={covers(wins(d), t)} onBook={onBook} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MonthGrid: React.FC<{ date: string; days: DaySummary[]; onPickDay: (d: string) => void }> = ({ date, days, onPickDay }) => {
  const A = useA();
  const S = A.reception.schedule;
  const today = todayIso();
  const first = firstDayOf(A.lang);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weeks = monthWeeks(date, first);
  const name = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(localeOf(A.lang), opts).format(new Date(`${d}T00:00:00`));
  const heads = weeks[0].map((_, i) => {
    // Any real date with the right weekday gives the column its name.
    const probe = weekDays(date, first)[i];
    return name(probe, { weekday: 'short' });
  });
  return (
    <div className="na-sched-scroll">
      <table className="na-sched na-sched--month">
        <caption className="na-sr">{name(date, { month: 'long', year: 'numeric' })}</caption>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th scope="col" key={i}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, wi) => (
            <tr key={wi}>
              {w.map((d, di) => {
                if (!d) return <td key={di} className="na-sched-blank" />;
                const total = byDate.get(d)?.total ?? 0;
                const level = total === 0 ? 0 : total < 6 ? 1 : total < 12 ? 2 : 3;
                return (
                  <td key={d}>
                    <button
                      type="button"
                      className="na-sched-day"
                      data-level={level}
                      data-today={d === today || undefined}
                      aria-current={d === today ? 'date' : undefined}
                      aria-label={`${name(d, { dateStyle: 'full' })}: ${fill(S.count, { n: total })}`}
                      onClick={() => onPickDay(d)}
                    >
                      <b>{name(d, { day: 'numeric' })}</b>
                      <span>{total > 0 ? fill(S.count, { n: total }) : ''}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** The reception schedule: one day by doctor, one week for a doctor, or a month of daily load. */
export const Schedule: React.FC<{ navigate: (r: string) => void; bookRoute?: boolean; preset?: BookingPreset }> = ({ navigate, bookRoute, preset }) => {
  const A = useA();
  const S = A.reception.schedule;
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(todayIso());
  const [doctorId, setDoctorId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingPreset | null>(null);
  const [done, setDone] = useState('');
  const { doctors, state: docState } = useDoctors();

  // The "Book appointment" route opens the booking drawer over the schedule; so does a click on a free cell.
  const presetKey = JSON.stringify(preset ?? {});
  useEffect(() => {
    if (bookRoute) setBooking(preset ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookRoute, presetKey]);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(''), 6000);
    return () => window.clearTimeout(id);
  }, [done]);
  const first = firstDayOf(A.lang);

  const weekDoctor = doctorId || doctors[0]?.user_id || '';
  const days = weekDays(date, first);
  const range = view === 'day' ? { from: date, to: date } : view === 'week' ? { from: days[0], to: days[6] } : monthBounds(date);
  const clinician = view === 'week' ? weekDoctor : doctorId;
  const filter = clinician ? `&clinicianId=${clinician}` : '';

  const list = usePolledApi<AppointmentRow[]>(view === 'month' || (view === 'week' && !weekDoctor) ? null : `/api/appointments?from=${range.from}&to=${range.to}${filter}`);
  const summary = usePolledApi<{ days: DaySummary[] }>(view === 'month' ? `/api/appointments/summary?from=${range.from}&to=${range.to}${filter}` : null);
  const windows = useApiData<ScheduleWindow[]>('/api/appointments/schedules');

  const active = view === 'month' ? summary : list;
  const move = (n: number) => {
    setSelectedId(null);
    setDate(view === 'day' ? addDays(date, n) : view === 'week' ? addDays(date, 7 * n) : shiftMonth(date, n));
  };
  const pick = (d: string) => {
    setSelectedId(null);
    setDate(d);
    setView('day');
  };
  const label = (opts: Intl.DateTimeFormatOptions, d = date) => new Intl.DateTimeFormat(localeOf(A.lang), opts).format(new Date(`${d}T00:00:00`));
  const title =
    view === 'day' ? label({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : view === 'week' ? `${label({ day: 'numeric', month: 'short' }, days[0])} – ${label({ day: 'numeric', month: 'short', year: 'numeric' }, days[6])}` : label({ month: 'long', year: 'numeric' });
  const shown = view === 'day' && doctorId ? doctors.filter((d) => d.user_id === doctorId) : doctors;
  const book = (doctorIdForSlot: string, d: string, time: string) => setBooking({ doctorId: doctorIdForSlot, date: d, time });
  const closeBooking = () => {
    setBooking(null);
    if (bookRoute) navigate('reception/schedule');
  };
  const refreshAll = () => {
    void list.reload();
    void summary.reload();
  };

  return (
    <>
      <PageHead
        title={S.title}
        subtitle={S.subtitle}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setBooking({})}>
            {A.reception.board.book}
          </Button>
        }
      />
      <div className="na-stack">
        {done && (
          <Notice tone="ok" live>
            {done}
          </Notice>
        )}
        <Card>
          <div className="na-sched-bar">
            <div className="na-chips" role="group" aria-label={S.view}>
              {(['day', 'week', 'month'] as const).map((v) => (
                <button key={v} type="button" className="na-chip" aria-pressed={view === v} onClick={() => { setView(v); setSelectedId(null); }}>
                  {S.views[v]}
                </button>
              ))}
            </div>
            <div className="na-row">
              <Button small aria-label={S.prev[view]} onClick={() => move(-1)}>
                <AppIcon name="chevron" size={16} className="na-flip" />
              </Button>
              <h2 className="na-sched-title" aria-live="polite">
                {title}
              </h2>
              <Button small aria-label={S.next[view]} onClick={() => move(1)}>
                <AppIcon name="chevron" size={16} className="na-flip-rtl" />
              </Button>
              <Button small variant="quiet" onClick={() => { setDate(todayIso()); setSelectedId(null); }}>
                {S.today}
              </Button>
            </div>
            <Field label={S.doctor} htmlFor="sc-doc">
              <select id="sc-doc" className="na-select" value={view === 'week' ? weekDoctor : doctorId} onChange={(e) => { setDoctorId(e.target.value); setSelectedId(null); }}>
                {view !== 'week' && <option value="">{S.allDoctors}</option>}
                {doctors.map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {nameOf(A.lang, d)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {active.stale && (
            <Notice tone="warn" live>
              {S.stale}
            </Notice>
          )}
        </Card>

        {docState.status === 'ready' && doctors.length === 0 ? (
          <Notice tone="warn">{A.reception.book.noDoctors}</Notice>
        ) : (
          <Card>
            {view === 'week' && !weekDoctor ? (
              <Loading />
            ) : view === 'month' ? (
              <Async state={summary.state} onRetry={summary.reload}>
                {(data) => <MonthGrid date={date} days={data.days} onPickDay={pick} />}
              </Async>
            ) : (
              <Async state={list.state} onRetry={list.reload}>
                {(rows) => (
                  <Async state={windows.state} onRetry={windows.reload}>
                    {(wins) =>
                      view === 'day' ? (
                        <DayTable date={date} doctors={shown} rows={rows} windows={wins} selectedId={selectedId} onOpen={setSelectedId} onBook={book} />
                      ) : (
                        <WeekTable days={days} doctor={doctors.find((d) => d.user_id === weekDoctor) ?? doctors[0]} rows={rows} windows={wins} selectedId={selectedId} onOpen={setSelectedId} onBook={book} onPickDay={pick} />
                      )
                    }
                  </Async>
                )}
              </Async>
            )}
          </Card>
        )}

        {view !== 'month' && list.state.status === 'ready' && selectedId && (() => {
          const row = list.state.data.find((r) => r.id === selectedId);
          return row ? <AppointmentDrawer key={row.id} row={row} doctors={doctors} onClose={() => setSelectedId(null)} onChanged={refreshAll} onDone={setDone} /> : null;
        })()}
        {booking && <BookingDrawer preset={booking} doctors={doctors} onClose={closeBooking} onBooked={refreshAll} onDone={setDone} />}
      </div>
    </>
  );
};
