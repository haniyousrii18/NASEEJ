import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData, useMutation, useRequest } from '../api.js';
import { addDays, formatDate, nameOf, todayIso } from '../format.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Stat } from '../ui.js';
import { useA } from '../useA.js';
import { AppointmentList, type AppointmentRow } from './AppointmentList.js';

const Scope: React.FC = () => {
  const A = useA();
  return (
    <Notice tone="info" icon="lock">
      {A.reception.scope}
    </Notice>
  );
};

interface Doctor {
  user_id: string;
  full_name_ar: string;
  full_name_en: string;
  specialty_ar?: string;
  specialty_en?: string;
}

/** The active doctors of the active center (the directory view of members: names and specialty only). */
function useDoctors() {
  const { currentOrgId } = useAuth();
  const { state } = useApiData<Array<Doctor & { role: string; status: string }>>(currentOrgId ? `/api/organizations/${currentOrgId}/members` : null);
  const doctors = state.status === 'ready' ? state.data.filter((m) => m.role === 'doctor' && m.status === 'active') : [];
  return { doctors, state };
}

export const ReceptionHome: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const H = A.reception.home;
  const today = todayIso();
  const { state, reload } = useApiData<AppointmentRow[]>(`/api/appointments?date=${today}`);
  return (
    <>
      <PageHead title={H.title} subtitle={H.subtitle} />
      <Async state={state} onRetry={reload}>
        {(rows) => {
          const active = rows.filter((r) => r.status !== 'cancelled');
          const waiting = active.filter((r) => r.status === 'checked_in').length;
          const toArrive = active.filter((r) => r.status === 'pending' || r.status === 'confirmed').length;
          const done = active.filter((r) => r.status === 'completed').length;
          return (
            <div className="na-stack">
              <Scope />
              <div className="na-grid na-grid--stats">
                <Stat label={H.total} value={active.length} />
                <Stat label={H.waiting} value={waiting} tone={waiting > 0 ? 'ok' : undefined} />
                <Stat label={H.toArrive} value={toArrive} />
                <Stat label={H.done} value={done} />
              </div>
              <Card title={H.shortcuts}>
                <div className="na-row">
                  <Button variant="primary" icon="plus" onClick={() => navigate('reception/book')}>
                    {H.book}
                  </Button>
                  <Button icon="door" onClick={() => navigate('reception/arrivals')}>
                    {H.arrivals}
                  </Button>
                  <Button icon="calendar" onClick={() => navigate('reception/schedule')}>
                    {H.schedule}
                  </Button>
                  <Button icon="search" onClick={() => navigate('reception/patients')}>
                    {H.search}
                  </Button>
                </div>
              </Card>
              <Card title={H.today}>
                <AppointmentList rows={rows} role="reception" showDoctor showReason showPhone onChanged={reload} />
              </Card>
            </div>
          );
        }}
      </Async>
    </>
  );
};

export const ReceptionSchedule: React.FC = () => {
  const A = useA();
  const S = A.reception.schedule;
  const [date, setDate] = useState(todayIso());
  const [doctor, setDoctor] = useState('');
  const { doctors } = useDoctors();
  const { state, reload } = useApiData<AppointmentRow[]>(`/api/appointments?date=${date}${doctor ? `&clinicianId=${doctor}` : ''}`);
  return (
    <>
      <PageHead title={S.title} subtitle={S.subtitle} />
      <div className="na-stack">
        <Scope />
        <Card>
          <div className="na-form">
            <Field label={S.date} htmlFor="rs-date">
              <input id="rs-date" type="date" className="na-input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </Field>
            <Field label={S.doctor} htmlFor="rs-doc">
              <select id="rs-doc" className="na-select" value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                <option value="">{S.allDoctors}</option>
                {doctors.map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {nameOf(A.lang, d)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="na-row">
              <Button small onClick={() => setDate(addDays(date, -1))}>
                {S.prev}
              </Button>
              <Button small onClick={() => setDate(addDays(date, 1))}>
                {S.next}
              </Button>
            </div>
          </div>
        </Card>
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={S.empty} />}>
            {(rows) => <AppointmentList rows={rows} role="reception" showDoctor showReason showPhone onChanged={reload} />}
          </Async>
        </Card>
      </div>
    </>
  );
};

interface PatientHit {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  mrn: string;
  phone?: string;
  national_id?: string;
  date_of_birth?: string;
  gender?: string;
}

export const ReceptionBook: React.FC<{ initialPatientId?: string }> = ({ initialPatientId }) => {
  const A = useA();
  const B = A.reception.book;
  const request = useRequest();
  const { run, pending } = useMutation();
  const { doctors, state: docState } = useDoctors();

  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState<{ start_time: string; end_time: string } | null>(null);
  const [slots, setSlots] = useState<{ working: boolean; slots: Array<{ start_time: string; end_time: string; available: boolean }> } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const chosenDoctor = doctorId || doctors[0]?.user_id || '';

  useEffect(() => {
    if (!initialPatientId) return;
    void request<PatientHit>(`/api/patients/${initialPatientId}`).then((r) => r.ok && setPatient(r.data));
  }, [initialPatientId, request]);

  useEffect(() => {
    if (patient || term.trim().length < 2) return setHits([]);
    const id = window.setTimeout(async () => {
      const res = await request<PatientHit[]>(`/api/patients?search=${encodeURIComponent(term.trim())}`);
      if (res.ok) setHits(res.data.slice(0, 8));
    }, 300);
    return () => window.clearTimeout(id);
  }, [term, patient, request]);

  const loadSlots = useCallback(async () => {
    if (!chosenDoctor) return;
    setLoadingSlots(true);
    setSlot(null);
    const res = await request<any>(`/api/appointments/availability?clinicianId=${chosenDoctor}&date=${date}`);
    setLoadingSlots(false);
    setSlots(res.ok ? res.data : null);
  }, [chosenDoctor, date, request]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return setMsg({ tone: 'danger', text: B.needPatient });
    if (!slot) return setMsg({ tone: 'danger', text: B.needSlot });
    const res = await run('/api/appointments', 'POST', {
      patient_id: patient.id,
      clinician_id: chosenDoctor,
      appointment_date: date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      reason: reason.trim() || undefined,
    });
    if (res.ok) {
      setMsg({ tone: 'ok', text: B.booked });
      setReason('');
    } else {
      setMsg({ tone: 'danger', text: res.error.status === 409 ? B.conflict : res.error.message });
    }
    await loadSlots();
  };

  return (
    <>
      <PageHead title={B.title} subtitle={B.subtitle} />
      <div className="na-stack">
        <Scope />
        <Card>
          <form className="na-stack" onSubmit={submit} noValidate>
            <Field label={B.patientSearch} htmlFor="bk-patient">
              <input
                id="bk-patient"
                type="search"
                className="na-input"
                autoComplete="off"
                value={patient ? nameOf(A.lang, patient) : term}
                onChange={(e) => {
                  setPatient(null);
                  setTerm(e.target.value);
                }}
              />
            </Field>
            {patient && (
              <p>
                <strong>{B.selected}:</strong> {nameOf(A.lang, patient)} · <span className="na-ltr">{patient.mrn}</span>
              </p>
            )}
            {!patient && hits.length > 0 && (
              <ul className="na-list">
                {hits.map((p) => (
                  <li key={p.id}>
                    <span>
                      {nameOf(A.lang, p)} · <span className="na-ltr">{p.mrn}</span>
                    </span>
                    <Button small onClick={() => setPatient(p)}>
                      {B.pick}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="na-form">
              <Field label={B.doctor} htmlFor="bk-doc">
                <select id="bk-doc" className="na-select" value={chosenDoctor} onChange={(e) => setDoctorId(e.target.value)}>
                  {doctors.map((d) => (
                    <option key={d.user_id} value={d.user_id}>
                      {nameOf(A.lang, d)}
                      {nameOf(A.lang, { name_ar: d.specialty_ar, name_en: d.specialty_en }) ? ` · ${nameOf(A.lang, { name_ar: d.specialty_ar, name_en: d.specialty_en })}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={B.date} htmlFor="bk-date">
                <input id="bk-date" type="date" className="na-input" min={todayIso()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </Field>
            </div>
            {docState.status === 'ready' && doctors.length === 0 && <Notice tone="warn">{B.noDoctors}</Notice>}

            <fieldset className="na-fieldset">
              <legend className="na-label">{B.slots}</legend>
              {loadingSlots && <p className="na-muted">{B.loading}</p>}
              {!loadingSlots && slots && !slots.working && <p className="na-muted">{B.notWorking}</p>}
              {!loadingSlots && slots && slots.working && slots.slots.length === 0 && <p className="na-muted">{B.noSlots}</p>}
              <div className="na-chips" role="group" aria-label={B.slots}>
                {slots?.slots.map((s) => (
                  <button
                    key={s.start_time}
                    type="button"
                    aria-pressed={slot?.start_time === s.start_time}
                    className="na-chip na-ltr"
                    disabled={!s.available}
                    title={s.available ? undefined : B.taken}
                    onClick={() => setSlot(s)}
                  >
                    {s.start_time}
                  </button>
                ))}
              </div>
            </fieldset>

            <Field label={B.reason} htmlFor="bk-reason" help={B.reasonHint}>
              <input id="bk-reason" className="na-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {msg && (
              <Notice tone={msg.tone} live>
                {msg.text}
              </Notice>
            )}
            <div>
              <Button type="submit" variant="primary" disabled={pending || !chosenDoctor}>
                {B.confirm}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};

export const ReceptionArrivals: React.FC = () => {
  const A = useA();
  const R = A.reception.arrivals;
  const { state, reload } = useApiData<AppointmentRow[]>(`/api/appointments?date=${todayIso()}`);
  return (
    <>
      <PageHead title={R.title} subtitle={R.subtitle} actions={<Button variant="quiet" icon="refresh" onClick={reload}>{A.common.actions.refresh}</Button>} />
      <Async state={state} onRetry={reload}>
        {(rows) => {
          const waiting = rows.filter((r) => r.status === 'checked_in');
          const expected = rows.filter((r) => r.status === 'pending' || r.status === 'confirmed');
          const inside = rows.filter((r) => r.status === 'in_consultation');
          return (
            <div className="na-stack">
              <Scope />
              <Card title={`${R.waiting} (${waiting.length})`}>
                {waiting.length === 0 ? <p className="na-muted">{R.noneWaiting}</p> : <AppointmentList rows={waiting} role="reception" showDoctor onChanged={reload} />}
              </Card>
              <Card title={`${R.expected} (${expected.length})`}>
                {expected.length === 0 ? <p className="na-muted">{R.noneExpected}</p> : <AppointmentList rows={expected} role="reception" showDoctor showPhone onChanged={reload} />}
              </Card>
              <Card title={`${R.inConsultation} (${inside.length})`}>
                {inside.length === 0 ? <p className="na-muted">{R.noneIn}</p> : <AppointmentList rows={inside} role="reception" showDoctor onChanged={reload} />}
              </Card>
            </div>
          );
        }}
      </Async>
    </>
  );
};

export const ReceptionPatients: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const P = A.reception.patients;
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(id);
  }, [text]);
  const { state, reload } = useApiData<PatientHit[]>(`/api/patients?search=${encodeURIComponent(term)}`);
  const { run, pending } = useMutation();
  const [f, setF] = useState({ national_id: '', full_name_ar: '', full_name_en: '', date_of_birth: '', gender: 'male', phone: '', email: '', emergency_contact_name: '', emergency_contact_phone: '' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.national_id.trim() || !f.full_name_ar.trim() || !f.full_name_en.trim() || !f.date_of_birth || !f.phone.trim()) return setMsg({ tone: 'danger', text: P.required });
    const body: Record<string, unknown> = { ...f };
    for (const k of ['email', 'emergency_contact_name', 'emergency_contact_phone']) if (!body[k]) delete body[k];
    const res = await run('/api/patients', 'POST', body);
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.message });
    setMsg({ tone: 'ok', text: P.saved });
    setF({ ...f, national_id: '', full_name_ar: '', full_name_en: '', phone: '', email: '', emergency_contact_name: '', emergency_contact_phone: '' });
    reload();
  };

  return (
    <>
      <PageHead title={P.title} subtitle={P.subtitle} />
      <div className="na-stack">
        <Scope />
        <Card>
          <Field label={P.search} htmlFor="rp-search">
            <input id="rp-search" type="search" className="na-input" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </Card>
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={P.empty} />}>
            {(rows) => (
              <div className="na-table-wrap">
                <table className="na-table">
                  <thead>
                    <tr>
                      <th>{A.reception.book.patient}</th>
                      <th>{P.mrn}</th>
                      <th>{P.nationalId}</th>
                      <th>{P.phone}</th>
                      <th>{P.dob}</th>
                      <th>{P.gender}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td>{nameOf(A.lang, p)}</td>
                        <td className="na-ltr">{p.mrn}</td>
                        <td className="na-ltr">{p.national_id}</td>
                        <td className="na-ltr">{p.phone}</td>
                        <td>{formatDate(A.lang, p.date_of_birth)}</td>
                        <td>{p.gender ? P.genders[p.gender] : ''}</td>
                        <td>
                          <Button small onClick={() => navigate(`reception/book?patient=${p.id}`)}>
                            {P.bookFor}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>
        <Card title={P.register} hint={P.registerHint}>
          <form className="na-form" onSubmit={submit} noValidate>
            <Field label={P.nameAr} htmlFor="rg-ar">
              <input id="rg-ar" className="na-input" dir="rtl" value={f.full_name_ar} onChange={(e) => setF({ ...f, full_name_ar: e.target.value })} />
            </Field>
            <Field label={P.nameEn} htmlFor="rg-en">
              <input id="rg-en" className="na-input" dir="ltr" value={f.full_name_en} onChange={(e) => setF({ ...f, full_name_en: e.target.value })} />
            </Field>
            <Field label={P.nationalId} htmlFor="rg-nid">
              <input id="rg-nid" className="na-input" dir="ltr" inputMode="numeric" value={f.national_id} onChange={(e) => setF({ ...f, national_id: e.target.value })} />
            </Field>
            <Field label={P.dob} htmlFor="rg-dob">
              <input id="rg-dob" type="date" className="na-input" max={todayIso()} value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} />
            </Field>
            <Field label={P.gender} htmlFor="rg-gender">
              <select id="rg-gender" className="na-select" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
                {Object.entries(P.genders).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={P.phone} htmlFor="rg-phone">
              <input id="rg-phone" className="na-input" dir="ltr" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label={P.email} htmlFor="rg-email">
              <input id="rg-email" className="na-input" dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label={P.emergencyName} htmlFor="rg-en2">
              <input id="rg-en2" className="na-input" value={f.emergency_contact_name} onChange={(e) => setF({ ...f, emergency_contact_name: e.target.value })} />
            </Field>
            <Field label={P.emergencyPhone} htmlFor="rg-ep">
              <input id="rg-ep" className="na-input" dir="ltr" type="tel" value={f.emergency_contact_phone} onChange={(e) => setF({ ...f, emergency_contact_phone: e.target.value })} />
            </Field>
            <div className="na-form-actions">
              <Button type="submit" variant="primary" disabled={pending}>
                {P.save}
              </Button>
            </div>
          </form>
          {msg && (
            <div style={{ marginTop: 12 }}>
              <Notice tone={msg.tone} live>
                {msg.text}
              </Notice>
            </div>
          )}
        </Card>
      </div>
    </>
  );
};

