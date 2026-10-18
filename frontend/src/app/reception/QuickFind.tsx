import React, { useEffect, useState } from 'react';
import { useApiData, useMutation, useRequest } from '../api.js';
import { formatDate, nameOf, todayIso } from '../format.js';
import { type AppointmentRow, StatusPill } from '../pages/AppointmentList.js';
import { Button, Drawer, Field, Notice } from '../ui.js';
import { useA } from '../useA.js';
import type { PatientRow } from './patientTypes.js';

/** Find a patient from anywhere in reception and take the next step: check in today's visit, book, or open them. */
export const QuickFind: React.FC<{ navigate: (r: string) => void; onClose: () => void }> = ({ navigate, onClose }) => {
  const A = useA();
  const F = A.reception.find;
  const request = useRequest();
  const { run, pending } = useMutation();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<PatientRow[] | null>(null);
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const today = useApiData<AppointmentRow[]>(patient ? `/api/appointments?date=${todayIso()}` : null);

  useEffect(() => {
    if (patient || term.trim().length < 2) return setHits(null);
    const id = window.setTimeout(async () => {
      const res = await request<PatientRow[]>(`/api/patients?search=${encodeURIComponent(term.trim())}`);
      setHits(res.ok ? res.data.slice(0, 8) : []);
    }, 250);
    return () => window.clearTimeout(id);
  }, [term, patient, request]);

  const go = (route: string) => {
    onClose();
    navigate(route);
  };

  const step = async (row: AppointmentRow, status: string) => {
    const res = await run(`/api/appointments/${row.id}/status`, 'PATCH', { status });
    setMessage(res.ok ? { tone: 'ok', text: A.ops.appt.changed } : { tone: 'danger', text: res.error.status === 409 ? A.ops.appt.notAllowed : res.error.message });
    today.reload();
  };

  const visits = today.state.status === 'ready' ? today.state.data.filter((r) => r.patient_id === patient?.id && r.status !== 'cancelled') : [];

  return (
    <Drawer title={F.title} onClose={onClose}>
      {!patient ? (
        <>
          <Field label={F.label} htmlFor="qf-term">
            <input id="qf-term" type="search" className="na-input" autoComplete="off" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} />
          </Field>
          {hits && hits.length === 0 && <p className="na-muted">{A.reception.patients.empty}</p>}
          {hits && hits.length > 0 && (
            <ul className="na-drawer-pick">
              {hits.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPatient(p)}>
                    <span>{nameOf(A.lang, p)}</span>
                    <span className="na-ltr na-muted">{p.mrn}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="na-drawer-section">
            <h3>{nameOf(A.lang, patient)}</h3>
            <dl className="na-drawer-facts">
              <dt>{A.reception.patients.mrn}</dt>
              <dd className="na-ltr">{patient.mrn}</dd>
              <dt>{A.reception.patients.phone}</dt>
              <dd className="na-ltr">{patient.phone || '—'}</dd>
              <dt>{A.reception.patients.dob}</dt>
              <dd>{formatDate(A.lang, patient.date_of_birth)}</dd>
            </dl>
          </div>
          {message && (
            <Notice tone={message.tone} live>
              {message.text}
            </Notice>
          )}
          <div className="na-drawer-section">
            <h3>{F.today}</h3>
            {today.state.status === 'loading' && <p className="na-muted">{A.common.states.loading}</p>}
            {today.state.status === 'ready' && visits.length === 0 && <p className="na-muted">{F.noVisits}</p>}
            {visits.map((r) => (
              <div key={r.id} className="na-row">
                <span className="na-ltr">{String(r.start_time).slice(0, 5)}</span>
                <span>{nameOf(A.lang, { name_ar: r.clinician_name_ar, name_en: r.clinician_name_en })}</span>
                <StatusPill status={r.status} />
                {r.status === 'confirmed' && (
                  <Button small variant="primary" disabled={pending} onClick={() => step(r, 'checked_in')}>
                    {A.reception.board.checkIn}
                  </Button>
                )}
                {r.status === 'pending' && (
                  <Button small variant="primary" disabled={pending} onClick={() => step(r, 'confirmed')}>
                    {A.reception.board.confirm}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="na-row">
            <Button icon="calendar" onClick={() => go(`reception/book?patient=${patient.id}`)}>
              {A.reception.patients.bookFor}
            </Button>
            <Button variant="quiet" onClick={() => go(`reception/patients?open=${patient.id}`)}>
              {F.openRecord}
            </Button>
            <Button variant="quiet" onClick={() => setPatient(null)}>
              {F.another}
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
};
