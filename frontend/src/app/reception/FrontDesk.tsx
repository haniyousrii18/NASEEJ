import React, { useEffect, useState } from 'react';
import type { ApiFailure } from '../api.js';
import { fill, nameOf, todayIso } from '../format.js';
import type { AppointmentRow } from '../pages/AppointmentList.js';
import { Async, Button, Notice, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { useDayBoard } from './useDayBoard.js';

/** A wait at or past this many minutes is flagged in words as well as colour. */
const LONG_WAIT_MIN = 20;

const timeOf = (r: AppointmentRow) => String(r.start_time).slice(0, 5);
const byTime = (a: AppointmentRow, b: AppointmentRow) => timeOf(a).localeCompare(timeOf(b));

/** Re-renders on an interval so waiting times keep counting between polls. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

const clock = (lang: string, at: number) => new Date(at).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

interface CardProps {
  row: AppointmentRow;
  now: number;
  busy: boolean;
  onChange: (row: AppointmentRow, target: string) => Promise<ApiFailure | null>;
}

const AppointmentCard: React.FC<CardProps> = ({ row, now, busy, onChange }) => {
  const A = useA();
  const B = A.reception.board;
  const [asking, setAsking] = useState<'cancelled' | 'no_show' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patient = nameOf(A.lang, { name_ar: row.patient_name_ar, name_en: row.patient_name_en });
  const doctor = nameOf(A.lang, { name_ar: row.clinician_name_ar, name_en: row.clinician_name_en });
  const waiting = row.status === 'checked_in';
  const minutes = waiting && row.check_in_time ? Math.max(0, Math.floor((now - new Date(row.check_in_time).getTime()) / 60000)) : 0;
  const long = waiting && minutes >= LONG_WAIT_MIN;

  const run = async (target: string) => {
    setError(null);
    setAsking(null);
    const failure = await onChange(row, target);
    if (failure) setError(failure.code === 'NO_SHOW_TOO_EARLY' ? B.noShowTooEarly : failure.status === 409 ? A.ops.appt.notAllowed : failure.message);
  };

  const primary = row.status === 'pending' ? { target: 'confirmed', label: B.confirm } : row.status === 'confirmed' ? { target: 'checked_in', label: B.checkIn } : null;
  const cancellable = row.status === 'pending' || row.status === 'confirmed' || row.status === 'checked_in';
  // Offered once the start time has passed; the server enforces the same rule.
  const canNoShow = row.status === 'confirmed' && new Date(`${row.appointment_date}T${timeOf(row)}`).getTime() <= now;
  const question = asking === 'no_show' ? B.noShowAsk : B.cancelAsk;

  return (
    <li className="na-appt" data-status={row.status} data-long={long || undefined}>
      <div className="na-appt-top">
        <span className="na-appt-time na-ltr">{timeOf(row)}</span>
        {row.status === 'pending' && <Pill tone="warn">{B.pendingTag}</Pill>}
        {waiting && (
          <span className="na-appt-wait">
            {long ? <Pill tone="warn">{B.longWait}</Pill> : null}
            <span>{minutes === 0 ? B.justArrived : fill(B.waitMin, { n: minutes })}</span>
          </span>
        )}
      </div>
      <div className="na-appt-name">{patient}</div>
      <div className="na-appt-meta">{doctor}</div>
      {row.reason && <div className="na-appt-meta">{row.reason}</div>}
      {(row.status === 'pending' || row.status === 'confirmed') && row.patient_phone && <div className="na-appt-meta na-ltr">{row.patient_phone}</div>}

      {asking ? (
        <div className="na-appt-ask" role="group" aria-label={fill(question, { name: patient })}>
          <span>{fill(question, { name: patient })}</span>
          <div className="na-appt-actions">
            <Button small variant="danger" disabled={busy} onClick={() => run(asking)}>
              {asking === 'no_show' ? B.noShowYes : B.cancelYes}
            </Button>
            <Button small variant="quiet" onClick={() => setAsking(null)}>
              {B.cancelKeep}
            </Button>
          </div>
        </div>
      ) : (
        (primary || canNoShow || cancellable) && (
          <div className="na-appt-actions">
            {primary && (
              <Button small variant="primary" disabled={busy} onClick={() => run(primary.target)}>
                {primary.label}
              </Button>
            )}
            {canNoShow && (
              <Button small variant="quiet" disabled={busy} onClick={() => setAsking('no_show')}>
                {B.noShow}
              </Button>
            )}
            {cancellable && (
              <Button small variant="quiet" disabled={busy} onClick={() => setAsking('cancelled')}>
                {B.cancel}
              </Button>
            )}
          </div>
        )
      )}
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
    </li>
  );
};

interface LaneProps {
  id: string;
  title: string;
  empty: string;
  rows: AppointmentRow[];
  now: number;
  busy: ReadonlySet<string>;
  onChange: CardProps['onChange'];
}

const Lane: React.FC<LaneProps> = ({ id, title, empty, rows, now, busy, onChange }) => (
  <section className="na-lane" data-lane={id} aria-labelledby={`lane-${id}`}>
    <h2 className="na-lane-h">
      <span className="na-lane-title" id={`lane-${id}`}>
        {title}
      </span>
      <span className="na-lane-count">{rows.length}</span>
    </h2>
    {rows.length === 0 ? (
      <p className="na-lane-empty">{empty}</p>
    ) : (
      <ul className="na-lane-list">
        {rows.map((r) => (
          <AppointmentCard key={`${r.id}:${r.status}`} row={r} now={now} busy={busy.has(r.id)} onChange={onChange} />
        ))}
      </ul>
    )}
  </section>
);

/** The reception landing page: today's appointments as a live board, from "expected" to "done". */
export const FrontDesk: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const B = A.reception.board;
  const { state, reload, change, busy, updatedAt, stale } = useDayBoard(todayIso());
  const now = useNow();

  return (
    <>
      <PageHead
        title={B.title}
        subtitle={B.subtitle}
        actions={
          <Button variant="primary" icon="plus" onClick={() => navigate('reception/book')}>
            {B.book}
          </Button>
        }
      />
      <Async state={state} onRetry={reload}>
        {(rows) => {
          const live = rows.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
          const expected = live.filter((r) => r.status === 'pending' || r.status === 'confirmed').sort(byTime);
          const waiting = live
            .filter((r) => r.status === 'checked_in')
            .sort((a, b) => String(a.check_in_time ?? a.start_time).localeCompare(String(b.check_in_time ?? b.start_time)));
          const inside = live.filter((r) => r.status === 'in_consultation').sort(byTime);
          const done = live.filter((r) => r.status === 'completed').sort((a, b) => byTime(b, a));
          const cancelled = rows.filter((r) => r.status === 'cancelled').length;
          const noShows = rows.filter((r) => r.status === 'no_show').length;
          const lane = { now, busy, onChange: change };
          return (
            <div className="na-stack">
              <div className="na-board-meta">
                <p className="na-board-summary" aria-label={B.summaryLabel}>
                  <span>
                    <b>{live.length}</b> {B.total}
                  </span>
                  <span>
                    <b>{waiting.length}</b> {B.waiting}
                  </span>
                  <span>
                    <b>{expected.length}</b> {B.toArrive}
                  </span>
                  <span>
                    <b>{done.length}</b> {B.done}
                  </span>
                </p>
                <span className="na-board-sync" role="status">
                  {stale ? fill(B.stale, { time: updatedAt ? clock(A.lang, updatedAt) : '' }) : updatedAt ? fill(B.updated, { time: clock(A.lang, updatedAt) }) : ''}
                  <Button small variant="quiet" icon="refresh" onClick={reload}>
                    {A.common.actions.refresh}
                  </Button>
                </span>
              </div>
              <div className="na-board">
                <Lane id="expected" title={B.expected} empty={B.emptyExpected} rows={expected} {...lane} />
                <Lane id="waiting" title={B.waiting} empty={B.emptyWaiting} rows={waiting} {...lane} />
                <Lane id="inside" title={B.inConsultation} empty={B.emptyInside} rows={inside} {...lane} />
                <Lane id="done" title={B.done} empty={B.emptyDone} rows={done} {...lane} />
              </div>
              {(cancelled > 0 || noShows > 0) && (
                <p className="na-muted">
                  {[cancelled > 0 && fill(B.cancelledCount, { n: cancelled }), noShows > 0 && fill(B.noShowCount, { n: noShows })].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          );
        }}
      </Async>
    </>
  );
};
