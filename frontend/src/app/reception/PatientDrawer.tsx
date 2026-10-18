import React, { useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { formatDate, nameOf } from '../format.js';
import { Async, Button, Drawer, Field, Notice } from '../ui.js';
import { useA } from '../useA.js';
import type { PatientRow } from './patientTypes.js';

/** One patient: identity and contact as the front desk may see them, with the contact details editable. */
export const PatientDrawer: React.FC<{
  patientId: string;
  onClose: () => void;
  onChanged: () => void;
  onBook: (patientId: string) => void;
}> = ({ patientId, onClose, onChanged, onBook }) => {
  const A = useA();
  const P = A.reception.patients;
  const { state, reload } = useApiData<PatientRow>(`/api/patients/${patientId}`);
  const { run, pending } = useMutation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: '', email: '', emergency_contact_name: '', emergency_contact_phone: '' });
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const edit = (p: PatientRow) => {
    setForm({ phone: p.phone ?? '', email: p.email ?? '', emergency_contact_name: p.emergency_contact_name ?? '', emergency_contact_phone: p.emergency_contact_phone ?? '' });
    setMessage(null);
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.phone.trim().length < 5) return setMessage({ tone: 'danger', text: P.phoneRequired });
    const res = await run(`/api/patients/${patientId}`, 'PATCH', form);
    if (!res.ok) return setMessage({ tone: 'danger', text: res.error.message });
    setEditing(false);
    setMessage({ tone: 'ok', text: P.contactSaved });
    reload();
    onChanged();
  };

  return (
    <Drawer title={P.details} onClose={onClose}>
      <Async state={state} onRetry={reload}>
        {(p) => (
          <>
            <div className="na-drawer-section">
              <h3>{nameOf(A.lang, p)}</h3>
              <dl className="na-drawer-facts">
                <dt>{P.mrn}</dt>
                <dd className="na-ltr">{p.mrn}</dd>
                <dt>{P.nationalId}</dt>
                <dd className="na-ltr">{p.national_id}</dd>
                <dt>{P.dob}</dt>
                <dd>{formatDate(A.lang, p.date_of_birth)}</dd>
                <dt>{P.gender}</dt>
                <dd>{P.genders[p.gender]}</dd>
              </dl>
              <p className="na-muted">{P.identityLocked}</p>
            </div>

            {message && (
              <Notice tone={message.tone} live>
                {message.text}
              </Notice>
            )}

            {editing ? (
              <form className="na-drawer-section" onSubmit={save} noValidate>
                <h3>{P.contact}</h3>
                <Field label={P.phone} htmlFor="pd-phone">
                  <input id="pd-phone" className="na-input" dir="ltr" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label={P.email} htmlFor="pd-email">
                  <input id="pd-email" className="na-input" dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label={P.emergencyName} htmlFor="pd-en">
                  <input id="pd-en" className="na-input" value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} />
                </Field>
                <Field label={P.emergencyPhone} htmlFor="pd-ep">
                  <input id="pd-ep" className="na-input" dir="ltr" type="tel" value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} />
                </Field>
                <div className="na-row">
                  <Button type="submit" variant="primary" disabled={pending}>
                    {P.saveContact}
                  </Button>
                  <Button variant="quiet" onClick={() => setEditing(false)}>
                    {A.common.actions.cancel}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="na-drawer-section">
                <h3>{P.contact}</h3>
                <dl className="na-drawer-facts">
                  <dt>{P.phone}</dt>
                  <dd className="na-ltr">{p.phone || '—'}</dd>
                  <dt>{P.email}</dt>
                  <dd className="na-ltr">{p.email || '—'}</dd>
                  <dt>{P.emergencyName}</dt>
                  <dd>{p.emergency_contact_name || '—'}</dd>
                  <dt>{P.emergencyPhone}</dt>
                  <dd className="na-ltr">{p.emergency_contact_phone || '—'}</dd>
                </dl>
                <div className="na-row">
                  <Button variant="primary" icon="calendar" onClick={() => onBook(p.id)}>
                    {P.bookFor}
                  </Button>
                  <Button onClick={() => edit(p)}>{P.editContact}</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Async>
    </Drawer>
  );
};
