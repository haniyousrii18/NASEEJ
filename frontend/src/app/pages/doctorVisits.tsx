import React, { useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { formatDate, nameOf } from '../format.js';
import { ReviewPill } from '../record/badges.js';
import { titleOf, type TimelineItem } from '../record/Timeline.js';
import { Async, Button, Field } from '../ui.js';
import { useA } from '../useA.js';

/** Visits, prescriptions and lab results all come from the patient's timeline, so one list shape serves every tab. */

/** Approval is one deliberate click, then one confirming click. */
export const ApproveButton: React.FC<{ url: string; onDone: () => void }> = ({ url, onDone }) => {
  const A = useA();
  const V = A.doctor.workspace.visitsUi;
  const { run, pending } = useMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const approve = async () => {
    const res = await run(url, 'POST');
    if (res.ok) {
      setConfirming(false);
      onDone();
    } else setError(res.error.message);
  };

  if (!confirming)
    return (
      <Button small variant="primary" onClick={() => setConfirming(true)}>
        {V.approve}
      </Button>
    );
  return (
    <span className="rec-confirm">
      <Button small variant="primary" disabled={pending} onClick={approve}>
        {V.confirm}
      </Button>
      <Button small variant="quiet" onClick={() => setConfirming(false)}>
        {A.common.actions.cancel}
      </Button>
      {error && <span className="rec-error">{error}</span>}
    </span>
  );
};

const APPROVE_URL: Record<string, string> = { visit: '/api/visits', prescription: '/api/prescriptions', lab_result: '/api/labs/results' };

/** Records of the given types for this patient. Drafts written at this center carry an approve button. */
export const RecordList: React.FC<{ endpoint: string; types: TimelineItem['type'][]; version: number; onChanged: () => void; empty: string }> = ({
  endpoint,
  types,
  version,
  onChanged,
  empty,
}) => {
  const A = useA();
  const { state, reload } = useApiData<TimelineItem[]>(`${endpoint}?type=${types.join(',')}&limit=50&v=${version}`);
  return (
    <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{empty}</p>}>
      {(items) => (
        <ul className="na-list">
          {items.map((i) => (
            <li key={i.id} className="na-list-item">
              <div className="rec-line">
                <strong dir="auto">{i.type === 'visit' ? i.data.diagnosis || titleOf(i, A) : titleOf(i, A)}</strong>
                <ReviewPill status={i.reviewStatus} />
              </div>
              <span className="na-muted">{[formatDate(A.lang, i.occurredAt, i.type === 'visit'), nameOf(A.lang, i.author)].filter(Boolean).join(' · ')}</span>
              {i.type === 'visit' && <VisitDetail item={i} />}
              {i.reviewStatus === 'draft' && !i.isExternal && APPROVE_URL[i.type] && (
                <div className="na-row">
                  <ApproveButton url={`${APPROVE_URL[i.type]}/${i.source.id}/approve`} onDone={onChanged} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Async>
  );
};

const VisitDetail: React.FC<{ item: TimelineItem }> = ({ item }) => {
  const A = useA();
  const V = A.doctor.workspace.visitsUi;
  const [open, setOpen] = useState(false);
  const d = item.data;
  const rows: Array<[string, string]> = [
    [V.s, d.chiefComplaint],
    [V.o, d.examinationNotes],
    [V.a, d.diagnosis],
    [V.p, d.treatmentPlan],
  ];
  return (
    <>
      <button type="button" className="rec-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? V.hide : V.show}
      </button>
      {open && (
        <dl className="rec-soap">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd dir="auto">{v}</dd>
              </React.Fragment>
            ))}
        </dl>
      )}
    </>
  );
};

export const VisitsTab: React.FC<{ endpoint: string; version: number; onChanged: () => void; open: (p: 'visit' | 'rx' | 'lab') => void }> = ({
  endpoint,
  version,
  onChanged,
  open,
}) => {
  const A = useA();
  const V = A.doctor.workspace.visitsUi;
  return (
    <section className="rec-sec">
      <div className="rec-sec-head">
        <h2 className="rec-h">{A.doctor.workspace.tabs.visits}</h2>
        <div className="rec-actions">
          <Button small variant="primary" onClick={() => open('visit')}>
            {V.newVisit}
          </Button>
          <Button small variant="quiet" onClick={() => open('rx')}>
            {V.newRx}
          </Button>
          <Button small variant="quiet" onClick={() => open('lab')}>
            {V.newLab}
          </Button>
        </div>
      </div>
      <RecordList endpoint={endpoint} types={['visit']} version={version} onChanged={onChanged} empty={V.noVisits} />
    </section>
  );
};

/* ------------------------------------------------------------------ panels */

const vital = (v: string, int = false) => {
  const n = int ? parseInt(v, 10) : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export const VisitEditor: React.FC<{ patientId: string; onSaved: () => void }> = ({ patientId, onSaved }) => {
  const A = useA();
  const V = A.doctor.workspace.visitsUi;
  const { run, pending } = useMutation();
  const [f, setF] = useState({ s: '', o: '', a: '', p: '', bp: '', pulse: '', temp: '', spo2: '' });
  const [errors, setErrors] = useState<{ s?: boolean; a?: boolean; api?: string }>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setErrors({});
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = { s: !f.s.trim(), a: !f.a.trim() };
    if (missing.s || missing.a) return setErrors(missing);
    const res = await run('/api/visits', 'POST', {
      patient_id: patientId,
      chief_complaint: f.s.trim(),
      vital_signs: { blood_pressure: f.bp.trim() || null, pulse: vital(f.pulse, true), temperature: vital(f.temp), spo2: vital(f.spo2, true) },
      examination_notes: f.o.trim(),
      diagnosis: f.a.trim(),
      treatment_plan: f.p.trim(),
    });
    if (!res.ok) return setErrors({ api: res.error.message });
    setF({ s: '', o: '', a: '', p: '', bp: '', pulse: '', temp: '', spo2: '' });
    onSaved();
  };

  return (
    <form className="rec-form" onSubmit={save} noValidate>
      <Field label={V.sFull} htmlFor="v-s" help={errors.s ? V.required : undefined}>
        <textarea id="v-s" className="na-textarea" rows={2} value={f.s} onChange={set('s')} aria-invalid={errors.s || undefined} />
      </Field>
      <div className="rec-vitals">
        <Field label={V.bp} htmlFor="v-bp">
          <input id="v-bp" className="na-input na-ltr" inputMode="numeric" placeholder="120/80" value={f.bp} onChange={set('bp')} />
        </Field>
        <Field label={V.pulse} htmlFor="v-pulse">
          <input id="v-pulse" className="na-input na-ltr" inputMode="numeric" value={f.pulse} onChange={set('pulse')} />
        </Field>
        <Field label={V.temp} htmlFor="v-temp">
          <input id="v-temp" className="na-input na-ltr" inputMode="decimal" value={f.temp} onChange={set('temp')} />
        </Field>
        <Field label={V.spo2} htmlFor="v-spo2">
          <input id="v-spo2" className="na-input na-ltr" inputMode="numeric" value={f.spo2} onChange={set('spo2')} />
        </Field>
      </div>
      <Field label={V.oFull} htmlFor="v-o">
        <textarea id="v-o" className="na-textarea" rows={3} value={f.o} onChange={set('o')} />
      </Field>
      <Field label={V.aFull} htmlFor="v-a" help={errors.a ? V.required : undefined}>
        <textarea id="v-a" className="na-textarea" rows={2} value={f.a} onChange={set('a')} aria-invalid={errors.a || undefined} />
      </Field>
      <Field label={V.pFull} htmlFor="v-p">
        <textarea id="v-p" className="na-textarea" rows={3} value={f.p} onChange={set('p')} />
      </Field>
      {errors.api && <p className="rec-error">{errors.api}</p>}
      <div className="rec-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {V.saveDraft}
        </Button>
      </div>
    </form>
  );
};

export const RxForm: React.FC<{ patientId: string; endpoint: string; onSaved: () => void }> = ({ patientId, endpoint, onSaved }) => {
  const A = useA();
  const V = A.doctor.workspace.visitsUi;
  const visits = useApiData<TimelineItem[]>(`${endpoint}?type=visit&limit=20`);
  const { run, pending } = useMutation();
  const [f, setF] = useState({ visit: '', name: '', dose: '', freq: '', dur: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const visitId = f.visit || (visits.state.status === 'ready' ? visits.state.data.find((v) => v.reviewStatus === 'draft')?.source.id : '') || '';
    if (!f.name.trim() || !visitId) return setError(V.required);
    const res = await run('/api/prescriptions', 'POST', {
      visit_id: visitId,
      patient_id: patientId,
      items: [{ medication_name: f.name.trim(), dosage: f.dose.trim(), frequency: f.freq.trim(), duration: f.dur.trim() }],
    });
    if (!res.ok) return setError(res.error.message);
    setF({ visit: '', name: '', dose: '', freq: '', dur: '' });
    onSaved();
  };

  return (
    <form className="rec-form" onSubmit={save} noValidate>
      <Field label={V.forVisit} htmlFor="rx-visit">
        <select id="rx-visit" className="na-select" value={f.visit} onChange={set('visit')}>
          {visits.state.status === 'ready' &&
            visits.state.data.map((v) => (
              <option key={v.id} value={v.source.id}>
                {[formatDate(A.lang, v.occurredAt, true), v.data.diagnosis].filter(Boolean).join(' · ')}
              </option>
            ))}
        </select>
      </Field>
      <Field label={V.medication} htmlFor="rx-name">
        <input id="rx-name" className="na-input" dir="auto" value={f.name} onChange={set('name')} />
      </Field>
      <div className="rec-vitals">
        <Field label={V.dose} htmlFor="rx-dose">
          <input id="rx-dose" className="na-input" dir="auto" value={f.dose} onChange={set('dose')} />
        </Field>
        <Field label={V.freq} htmlFor="rx-freq">
          <input id="rx-freq" className="na-input" dir="auto" value={f.freq} onChange={set('freq')} />
        </Field>
        <Field label={V.dur} htmlFor="rx-dur">
          <input id="rx-dur" className="na-input" dir="auto" value={f.dur} onChange={set('dur')} />
        </Field>
      </div>
      {error && <p className="rec-error">{error}</p>}
      <div className="rec-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {V.saveDraft}
        </Button>
      </div>
    </form>
  );
};

export const LabForm: React.FC<{ patientId: string; onSaved: () => void }> = ({ patientId, onSaved }) => {
  const A = useA();
  const V = A.doctor.workspace.visitsUi;
  const { run, pending } = useMutation();
  const [f, setF] = useState({ ar: '', en: '' });
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.ar.trim() || !f.en.trim()) return setError(V.required);
    const res = await run('/api/labs/orders', 'POST', { patient_id: patientId, visit_id: null, test_name_ar: f.ar.trim(), test_name_en: f.en.trim() });
    if (!res.ok) return setError(res.error.message);
    setF({ ar: '', en: '' });
    onSaved();
  };

  return (
    <form className="rec-form" onSubmit={save} noValidate>
      <Field label={V.testAr} htmlFor="lab-ar">
        <input id="lab-ar" className="na-input" dir="rtl" value={f.ar} onChange={(e) => { setF({ ...f, ar: e.target.value }); setError(''); }} />
      </Field>
      <Field label={V.testEn} htmlFor="lab-en">
        <input id="lab-en" className="na-input" dir="ltr" value={f.en} onChange={(e) => { setF({ ...f, en: e.target.value }); setError(''); }} />
      </Field>
      {error && <p className="rec-error">{error}</p>}
      <div className="rec-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {V.order}
        </Button>
      </div>
    </form>
  );
};
