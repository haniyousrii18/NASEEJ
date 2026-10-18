import React, { useEffect, useState } from 'react';
import { useMutation, useRequest } from '../api.js';
import { nameOf, todayIso } from '../format.js';
import { Button, Drawer, Field, Notice } from '../ui.js';
import { useA } from '../useA.js';
import { SlotPicker, type Slot } from './SlotPicker.js';
import type { Doctor } from './useDoctors.js';

export interface BookingPreset {
  patientId?: string;
  doctorId?: string;
  date?: string;
  time?: string;
}

interface PatientHit {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  mrn: string;
}

const specialtyOf = (lang: 'ar' | 'en', d: Doctor) => nameOf(lang, { name_ar: d.specialty_ar, name_en: d.specialty_en });

/** Books an appointment: pick the patient, the doctor, the day and a free slot. The server decides who gets a contested slot. */
export const BookingDrawer: React.FC<{
  preset: BookingPreset;
  doctors: Doctor[];
  onClose: () => void;
  onBooked: () => void;
  onDone: (text: string) => void;
}> = ({ preset, doctors, onClose, onBooked, onDone }) => {
  const A = useA();
  const B = A.reception.book;
  const request = useRequest();
  const { run, pending } = useMutation();

  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [doctorId, setDoctorId] = useState(preset.doctorId ?? '');
  const [date, setDate] = useState(preset.date ?? todayIso());
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const chosenDoctor = doctorId || doctors[0]?.user_id || '';

  useEffect(() => {
    if (!preset.patientId) return;
    void request<PatientHit>(`/api/patients/${preset.patientId}`).then((r) => r.ok && setPatient(r.data));
  }, [preset.patientId, request]);

  useEffect(() => {
    if (patient || term.trim().length < 2) return setHits([]);
    const id = window.setTimeout(async () => {
      const res = await request<PatientHit[]>(`/api/patients?search=${encodeURIComponent(term.trim())}`);
      if (res.ok) setHits(res.data.slice(0, 6));
    }, 300);
    return () => window.clearTimeout(id);
  }, [term, patient, request]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return setError(B.needPatient);
    if (!slot) return setError(B.needSlot);
    const res = await run('/api/appointments', 'POST', {
      patient_id: patient.id,
      clinician_id: chosenDoctor,
      appointment_date: date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      reason: reason.trim() || undefined,
    });
    if (res.ok) {
      onBooked();
      onDone(B.booked);
      return onClose();
    }
    setError(res.error.status === 409 ? B.conflict : res.error.message);
    if (res.error.status === 409) setReloadKey((k) => k + 1);
  };

  return (
    <Drawer title={B.title} onClose={onClose}>
      <form className="na-stack" onSubmit={submit} noValidate>
        <div className="na-drawer-section">
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
        </div>

        <div className="na-form">
          <Field label={B.doctor} htmlFor="bk-doc">
            <select id="bk-doc" className="na-select" value={chosenDoctor} onChange={(e) => setDoctorId(e.target.value)}>
              {doctors.map((d) => (
                <option key={d.user_id} value={d.user_id}>
                  {nameOf(A.lang, d)}
                  {specialtyOf(A.lang, d) ? ` · ${specialtyOf(A.lang, d)}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={B.date} htmlFor="bk-date">
            <input id="bk-date" type="date" className="na-input" min={todayIso()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
        </div>
        {doctors.length === 0 && <Notice tone="warn">{B.noDoctors}</Notice>}

        <SlotPicker doctorId={chosenDoctor} date={date} value={slot} onChange={setSlot} reloadKey={reloadKey} preferredTime={preset.time} />

        <Field label={B.reason} htmlFor="bk-reason" help={B.reasonHint}>
          <input id="bk-reason" className="na-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && (
          <Notice tone="danger" live>
            {error}
          </Notice>
        )}
        <div className="na-row">
          <Button type="submit" variant="primary" disabled={pending || !chosenDoctor}>
            {B.confirm}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {A.common.actions.cancel}
          </Button>
        </div>
      </form>
    </Drawer>
  );
};
