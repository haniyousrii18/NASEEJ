import React, { useEffect, useState } from 'react';
import { useMutation, useRequest } from '../api.js';
import { fill, nameOf, todayIso } from '../format.js';
import { Button, Drawer, Field, Notice } from '../ui.js';
import { useA } from '../useA.js';
import type { PatientRow } from './patientTypes.js';

const EMPTY = { national_id: '', full_name_ar: '', full_name_en: '', date_of_birth: '', gender: 'male', phone: '', email: '', emergency_contact_name: '', emergency_contact_phone: '' };

/**
 * Registers a patient. While the national ID is typed, an existing patient of this center with that ID is shown
 * so the desk opens them instead of registering twice; the server refuses a duplicate in any case.
 */
export const RegisterDrawer: React.FC<{
  onClose: () => void;
  onRegistered: (result: { patientId: string; mrn: string }, name: string) => void;
  onOpenExisting: (patientId: string) => void;
}> = ({ onClose, onRegistered, onOpenExisting }) => {
  const A = useA();
  const P = A.reception.patients;
  const request = useRequest();
  const { run, pending } = useMutation();
  const [f, setF] = useState(EMPTY);
  const [existing, setExisting] = useState<PatientRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nationalId = f.national_id.trim();
  useEffect(() => {
    if (nationalId.length < 5) return setExisting(null);
    const id = window.setTimeout(async () => {
      const res = await request<PatientRow[]>(`/api/patients?search=${encodeURIComponent(nationalId)}`);
      setExisting(res.ok ? res.data.find((p) => p.national_id === nationalId) ?? null : null);
    }, 300);
    return () => window.clearTimeout(id);
  }, [nationalId, request]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nationalId || f.full_name_ar.trim().length < 2 || f.full_name_en.trim().length < 2 || !f.date_of_birth || f.phone.trim().length < 5) return setError(P.required);
    const body: Record<string, unknown> = { ...f };
    for (const k of ['email', 'emergency_contact_name', 'emergency_contact_phone']) if (!body[k]) delete body[k];
    const res = await run<{ patientId: string; mrn: string }>('/api/patients', 'POST', body);
    if (res.ok) return onRegistered(res.data, f.full_name_ar.trim() || f.full_name_en.trim());
    if (res.error.code === 'PATIENT_ALREADY_REGISTERED') {
      setError(P.alreadyHere);
      const patientId = res.error.details?.patientId as string | undefined;
      if (patientId) setExisting({ id: patientId, mrn: res.error.details.mrn } as PatientRow);
    } else if (res.error.code === 'IDENTITY_MISMATCH') setError(P.mismatch);
    else setError(res.error.message);
  };

  return (
    <Drawer title={P.register} onClose={onClose}>
      <form className="na-stack" onSubmit={submit} noValidate>
        <p className="na-muted">{P.registerHint}</p>
        <Field label={P.nationalId} htmlFor="rg-nid">
          <input id="rg-nid" className="na-input" dir="ltr" inputMode="numeric" autoComplete="off" value={f.national_id} onChange={set('national_id')} />
        </Field>
        {existing && (
          <Notice tone="warn" live>
            <div className="na-stack">
              <span>{existing.full_name_ar || existing.full_name_en ? fill(P.duplicateNamed, { name: nameOf(A.lang, existing), mrn: existing.mrn }) : fill(P.duplicateMrn, { mrn: existing.mrn })}</span>
              <div>
                <Button small onClick={() => onOpenExisting(existing.id)}>
                  {P.openExisting}
                </Button>
              </div>
            </div>
          </Notice>
        )}
        <div className="na-form">
          <Field label={P.nameAr} htmlFor="rg-ar">
            <input id="rg-ar" className="na-input" dir="rtl" value={f.full_name_ar} onChange={set('full_name_ar')} />
          </Field>
          <Field label={P.nameEn} htmlFor="rg-en">
            <input id="rg-en" className="na-input" dir="ltr" value={f.full_name_en} onChange={set('full_name_en')} />
          </Field>
          <Field label={P.dob} htmlFor="rg-dob">
            <input id="rg-dob" type="date" className="na-input" max={todayIso()} value={f.date_of_birth} onChange={set('date_of_birth')} />
          </Field>
          <Field label={P.gender} htmlFor="rg-gender">
            <select id="rg-gender" className="na-select" value={f.gender} onChange={set('gender')}>
              {Object.entries(P.genders).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={P.phone} htmlFor="rg-phone">
            <input id="rg-phone" className="na-input" dir="ltr" type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label={P.email} htmlFor="rg-email">
            <input id="rg-email" className="na-input" dir="ltr" type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label={P.emergencyName} htmlFor="rg-en2">
            <input id="rg-en2" className="na-input" value={f.emergency_contact_name} onChange={set('emergency_contact_name')} />
          </Field>
          <Field label={P.emergencyPhone} htmlFor="rg-ep">
            <input id="rg-ep" className="na-input" dir="ltr" type="tel" value={f.emergency_contact_phone} onChange={set('emergency_contact_phone')} />
          </Field>
        </div>
        {error && (
          <Notice tone="danger" live>
            {error}
          </Notice>
        )}
        <div className="na-row">
          <Button type="submit" variant="primary" disabled={pending}>
            {P.save}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {A.common.actions.cancel}
          </Button>
        </div>
      </form>
    </Drawer>
  );
};
