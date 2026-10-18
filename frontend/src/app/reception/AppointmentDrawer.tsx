import React, { useState } from 'react';
import { useMutation } from '../api.js';
import { fill, formatDate, nameOf, todayIso } from '../format.js';
import { type AppointmentRow, StatusPill } from '../pages/AppointmentList.js';
import { Button, Drawer, Field, Notice } from '../ui.js';
import { useA } from '../useA.js';
import { SlotPicker, type Slot } from './SlotPicker.js';
import type { Doctor } from './useDoctors.js';

type Asking = 'cancelled' | 'no_show' | null;

const startedAt = (r: AppointmentRow) => new Date(`${r.appointment_date}T${String(r.start_time).slice(0, 5)}`).getTime();

/** One appointment: its facts, the status steps reception may take, and a move to another time or doctor. */
export const AppointmentDrawer: React.FC<{
  row: AppointmentRow;
  doctors: Doctor[];
  onClose: () => void;
  onChanged: () => void;
  onDone: (text: string) => void;
}> = ({ row, doctors, onClose, onChanged, onDone }) => {
  const A = useA();
  const D = A.reception.drawer;
  const B = A.reception.board;
  const BK = A.reception.book;
  const T = A.ops.appt;
  const { run, pending } = useMutation();

  const [moving, setMoving] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const [error, setError] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState(row.clinician_id ?? doctors[0]?.user_id ?? '');
  const [date, setDate] = useState(row.appointment_date < todayIso() ? todayIso() : row.appointment_date);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const patient = nameOf(A.lang, { name_ar: row.patient_name_ar, name_en: row.patient_name_en });
  const doctor = nameOf(A.lang, { name_ar: row.clinician_name_ar, name_en: row.clinician_name_en });
  const time = `${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}`;

  const movable = row.status === 'pending' || row.status === 'confirmed';
  const cancellable = movable || row.status === 'checked_in';
  const canNoShow = row.status === 'confirmed' && startedAt(row) <= Date.now();

  const finish = (text: string) => {
    onChanged();
    onDone(text);
    onClose();
  };

  const setStatus = async (target: string) => {
    setError(null);
    setAsking(null);
    const res = await run(`/api/appointments/${row.id}/status`, 'PATCH', { status: target });
    if (res.ok) return finish(T.changed);
    setError(res.error.code === 'NO_SHOW_TOO_EARLY' ? B.noShowTooEarly : res.error.status === 409 ? T.notAllowed : res.error.message);
    onChanged();
  };

  const move = async () => {
    if (!slot) return setError(BK.needSlot);
    setError(null);
    const res = await run(`/api/appointments/${row.id}`, 'PATCH', {
      clinician_id: doctorId,
      appointment_date: date,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });
    if (res.ok) return finish(D.moved);
    if (res.error.code === 'APPOINTMENT_CONFLICT') {
      setError(BK.conflict);
      setSlot(null);
      setReloadKey((k) => k + 1);
    } else if (res.error.code === 'APPOINTMENT_SLOT_PAST') setError(D.pastSlot);
    else if (res.error.code === 'NOT_RESCHEDULABLE') setError(T.notAllowed);
    else setError(res.error.message);
  };

  const question = asking === 'no_show' ? B.noShowAsk : B.cancelAsk;

  return (
    <Drawer title={patient} subtitle={`${formatDate(A.lang, row.appointment_date)} · ${time}`} onClose={onClose}>
      <div className="na-drawer-section">
        <dl className="na-drawer-facts">
          <dt>{T.status}</dt>
          <dd>
            <StatusPill status={row.status} />
          </dd>
          <dt>{T.doctor}</dt>
          <dd>{doctor}</dd>
          <dt>{T.phone}</dt>
          <dd className="na-ltr">{row.patient_phone || '—'}</dd>
          <dt>{T.reason}</dt>
          <dd>{row.reason || '—'}</dd>
        </dl>
      </div>

      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}

      {moving ? (
        <form
          className="na-drawer-section"
          onSubmit={(e) => {
            e.preventDefault();
            void move();
          }}
        >
          <h3>{D.moveTitle}</h3>
          <div className="na-form">
            <Field label={BK.doctor} htmlFor="mv-doc">
              <select id="mv-doc" className="na-select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                {doctors.map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {nameOf(A.lang, d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={BK.date} htmlFor="mv-date">
              <input id="mv-date" type="date" className="na-input" min={todayIso()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </Field>
          </div>
          <SlotPicker doctorId={doctorId} date={date} value={slot} onChange={setSlot} reloadKey={reloadKey} />
          <div className="na-row">
            <Button type="submit" variant="primary" disabled={pending}>
              {D.saveMove}
            </Button>
            <Button variant="quiet" onClick={() => setMoving(false)}>
              {D.back}
            </Button>
          </div>
        </form>
      ) : asking ? (
        <div className="na-drawer-section" role="group" aria-label={fill(question, { name: patient })}>
          <p>{fill(question, { name: patient })}</p>
          <div className="na-row">
            <Button variant="danger" disabled={pending} onClick={() => setStatus(asking)}>
              {asking === 'no_show' ? B.noShowYes : B.cancelYes}
            </Button>
            <Button variant="quiet" onClick={() => setAsking(null)}>
              {B.cancelKeep}
            </Button>
          </div>
        </div>
      ) : (
        <div className="na-drawer-section">
          <div className="na-row">
            {row.status === 'pending' && (
              <Button variant="primary" disabled={pending} onClick={() => setStatus('confirmed')}>
                {B.confirm}
              </Button>
            )}
            {row.status === 'confirmed' && (
              <Button variant="primary" disabled={pending} onClick={() => setStatus('checked_in')}>
                {B.checkIn}
              </Button>
            )}
            {movable && (
              <Button icon="calendar" onClick={() => setMoving(true)}>
                {D.move}
              </Button>
            )}
            {canNoShow && (
              <Button variant="quiet" onClick={() => setAsking('no_show')}>
                {B.noShow}
              </Button>
            )}
            {cancellable && (
              <Button variant="quiet" onClick={() => setAsking('cancelled')}>
                {B.cancel}
              </Button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
};
