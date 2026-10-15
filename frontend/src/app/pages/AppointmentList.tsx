import React, { useState } from 'react';
import { useMutation } from '../api.js';
import { fill, formatDate, nameOf } from '../format.js';
import { Button, Notice, Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';

export interface AppointmentRow {
  id: string;
  patient_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  check_in_time?: string | null;
  reason?: string | null;
  patient_phone?: string | null;
  patient_name_ar: string;
  patient_name_en: string;
  clinician_name_ar: string;
  clinician_name_en: string;
}

type Action = 'confirmed' | 'checked_in' | 'in_consultation' | 'completed' | 'cancelled';

/** The buttons each role is offered per status. The server still decides whether the transition is allowed. */
const OFFERED: Record<'doctor' | 'reception' | 'center_manager', Record<string, Action[]>> = {
  doctor: { checked_in: ['in_consultation'], in_consultation: ['completed'] },
  reception: { pending: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'cancelled'], checked_in: ['cancelled'] },
  center_manager: { pending: ['cancelled'], confirmed: ['cancelled'], checked_in: ['cancelled'] },
};

const TONE: Record<string, Tone> = { pending: 'warn', confirmed: 'info', checked_in: 'ok', in_consultation: 'ok', completed: 'neutral', cancelled: 'danger' };

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const A = useA();
  return <Pill tone={TONE[status] ?? 'neutral'}>{(A.common.appointmentStatus as Record<string, string>)[status] ?? status}</Pill>;
};

interface Props {
  rows: AppointmentRow[];
  role: 'doctor' | 'reception' | 'center_manager';
  showDate?: boolean;
  showDoctor?: boolean;
  showReason?: boolean;
  showPhone?: boolean;
  onChanged: () => void;
  onOpenPatient?: (patientId: string) => void;
}

export const AppointmentList: React.FC<Props> = ({ rows, role, showDate, showDoctor, showReason, showPhone, onChanged, onOpenPatient }) => {
  const A = useA();
  const T = A.ops.appt;
  const { run, pending } = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const label: Record<Action, string> = { confirmed: T.confirm, checked_in: T.checkIn, in_consultation: T.startConsult, completed: T.complete, cancelled: T.cancel };

  const act = async (row: AppointmentRow, target: Action) => {
    if (target === 'cancelled' && !window.confirm(T.confirmCancel)) return;
    const res = await run(`/api/appointments/${row.id}/status`, 'PATCH', { status: target });
    if (res.ok) setMsg({ tone: 'ok', text: T.changed });
    else setMsg({ tone: 'danger', text: res.error.status === 409 ? T.notAllowed : res.error.message });
    onChanged();
  };

  if (rows.length === 0) return <p className="na-muted">{T.empty}</p>;

  return (
    <div className="na-stack">
      {msg && (
        <Notice tone={msg.tone} live>
          {msg.text}
        </Notice>
      )}
      <div className="na-table-wrap">
        <table className="na-table">
          <thead>
            <tr>
              <th>{T.time}</th>
              <th>{T.patient}</th>
              {showDoctor && <th>{T.doctor}</th>}
              {showReason && <th>{T.reason}</th>}
              {showPhone && <th>{T.phone}</th>}
              <th>{T.status}</th>
              <th>{T.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="na-num">
                  {showDate ? `${formatDate(A.lang, r.appointment_date)} ` : ''}
                  <span className="na-ltr">
                    {String(r.start_time).slice(0, 5)}–{String(r.end_time).slice(0, 5)}
                  </span>
                </td>
                <td>{nameOf(A.lang, { name_ar: r.patient_name_ar, name_en: r.patient_name_en })}</td>
                {showDoctor && <td>{nameOf(A.lang, { name_ar: r.clinician_name_ar, name_en: r.clinician_name_en })}</td>}
                {showReason && <td>{r.reason || '—'}</td>}
                {showPhone && <td className="na-ltr">{r.patient_phone || '—'}</td>}
                <td>
                  <StatusPill status={r.status} />
                  {r.status === 'checked_in' && r.check_in_time && (
                    <div className="na-muted">{fill(T.waitingSince, { time: new Date(r.check_in_time).toLocaleTimeString(A.lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) })}</div>
                  )}
                </td>
                <td>
                  <div className="na-row">
                    {(OFFERED[role][r.status] ?? []).map((target) => (
                      <Button key={target} small variant={target === 'cancelled' ? 'danger' : undefined} disabled={pending} onClick={() => act(r, target)}>
                        {label[target]}
                      </Button>
                    ))}
                    {onOpenPatient && (
                      <Button small variant="quiet" onClick={() => onOpenPatient(r.patient_id)}>
                        {T.openPatient}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
