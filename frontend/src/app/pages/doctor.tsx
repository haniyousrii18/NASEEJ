import React, { useEffect, useState } from 'react';
import { DoctorWorkspace } from '../../pages/DoctorWorkspace.js';
import { useApiData, useMutation } from '../api.js';
import { addDays, fill, formatDate, nameOf, pick, todayIso } from '../format.js';
import { ProvenancePill, ReviewPill } from '../record/badges.js';
import { RecentRecords } from '../record/RecentRecords.js';
import { ResultsComparison } from '../record/ResultsComparison.js';
import { Timeline, type TimelineItem } from '../record/Timeline.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, Stat } from '../ui.js';
import { useA } from '../useA.js';
import { AppointmentList, StatusPill, type AppointmentRow } from './AppointmentList.js';
import { DocumentUpload } from './shared.js';

const nameOfPatient = (lang: 'ar' | 'en', r: { patient_name_ar: string; patient_name_en: string }) => nameOf(lang, { name_ar: r.patient_name_ar, name_en: r.patient_name_en });

interface Overview {
  today: Array<AppointmentRow & { reason?: string }>;
  waitingCount: number;
  pendingSignOff: { counts: Record<string, number>; total: number; items: Array<{ type: string; id: string; patient_id: string; created_at: string; patient_name_ar: string; patient_name_en: string }> };
}

export const DoctorHome: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const H = A.doctor.home;
  const { state, reload } = useApiData<Overview>('/api/doctor/overview');
  const openPatient = (id: string, tab = 'summary') => navigate(`doctor/patient/${id}/${tab}`);

  return (
    <>
      <PageHead title={H.title} subtitle={H.subtitle} />
      <Async state={state} onRetry={reload}>
        {(d) => (
          <div className="na-stack">
            <div className="na-grid na-grid--stats">
              <Stat label={H.todayCount} value={d.today.length} />
              <Stat label={H.waiting} value={d.waitingCount} tone={d.waitingCount > 0 ? 'ok' : undefined} />
              <Stat label={H.pending} value={d.pendingSignOff.total} tone={d.pendingSignOff.total > 0 ? 'warn' : undefined} />
            </div>

            <Card
              title={H.today}
              actions={
                <Button small variant="quiet" onClick={() => navigate('doctor/appointments')}>
                  {H.appointmentsAll}
                </Button>
              }
            >
              {d.today.length === 0 ? (
                <p className="na-muted">{H.todayEmpty}</p>
              ) : (
                <ul className="na-list">
                  {d.today.map((a) => (
                    <li key={a.id}>
                      <div className="na-item-main">
                        <span className="na-item-title">{nameOfPatient(A.lang, a)}</span>
                        <span className="na-item-sub">
                          <span className="na-ltr">
                            {String(a.start_time).slice(0, 5)}–{String(a.end_time).slice(0, 5)}
                          </span>
                          {a.reason ? ` · ${a.reason}` : ''}
                        </span>
                      </div>
                      <div className="na-row">
                        <StatusPill status={a.status} />
                        <Button small onClick={() => openPatient(a.patient_id)}>
                          {H.openPatient}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title={H.pending}
              hint={H.pendingBody}
              actions={
                d.pendingSignOff.total > 0 ? (
                  <Button small variant="quiet" onClick={() => navigate('doctor/pending')}>
                    {H.openAll}
                  </Button>
                ) : undefined
              }
            >
              {d.pendingSignOff.total === 0 ? (
                <p className="na-muted">{H.pendingEmpty}</p>
              ) : (
                <>
                  <div className="na-row">
                    <Pill tone="warn">
                      {d.pendingSignOff.counts.visit} {H.visits}
                    </Pill>
                    <Pill tone="warn">
                      {d.pendingSignOff.counts.prescription} {H.prescriptions}
                    </Pill>
                    <Pill tone="warn">
                      {d.pendingSignOff.counts.lab_result} {H.labs}
                    </Pill>
                  </div>
                  <ul className="na-list">
                    {d.pendingSignOff.items.map((i) => (
                      <li key={`${i.type}:${i.id}`}>
                        <div className="na-item-main">
                          <span className="na-item-title">{nameOfPatient(A.lang, i)}</span>
                          <span className="na-item-sub">
                            {A.doctor.pending.types[i.type]} · {formatDate(A.lang, i.created_at, true)}
                          </span>
                        </div>
                        <Button small onClick={() => openPatient(i.patient_id, 'visits')}>
                          {A.doctor.pending.review}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
            <p className="na-help">{H.followUpNote}</p>
          </div>
        )}
      </Async>
    </>
  );
};

export const DoctorAppointments: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const P = A.doctor.appointments;
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDays(todayIso(), 7));
  const { state, reload } = useApiData<AppointmentRow[]>(`/api/appointments?from=${from}&to=${to}`);
  return (
    <>
      <PageHead title={P.title} subtitle={P.subtitle} />
      <div className="na-stack">
        <Card>
          <div className="na-form">
            <Field label={P.from} htmlFor="da-from">
              <input id="da-from" type="date" className="na-input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </Field>
            <Field label={P.to} htmlFor="da-to">
              <input id="da-to" type="date" className="na-input" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={P.empty} />}>
            {(rows) => <AppointmentList rows={rows} role="doctor" showDate showReason onChanged={reload} onOpenPatient={(id) => navigate(`doctor/patient/${id}/summary`)} />}
          </Async>
        </Card>
      </div>
    </>
  );
};

export const DoctorPending: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const P = A.doctor.pending;
  const { state, reload } = useApiData<Overview['pendingSignOff']['items']>('/api/doctor/pending');
  return (
    <>
      <PageHead title={P.title} subtitle={P.subtitle} />
      <Card>
        <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={P.empty} />}>
          {(rows) => (
            <ul className="na-list">
              {rows.map((i) => (
                <li key={`${i.type}:${i.id}`}>
                  <div className="na-item-main">
                    <span className="na-item-title">{nameOfPatient(A.lang, i)}</span>
                    <span className="na-item-sub">
                      {P.types[i.type]} · {fill(P.created, { date: formatDate(A.lang, i.created_at, true) })}
                    </span>
                  </div>
                  <div className="na-row">
                    <Pill tone="warn">{A.common.review.draft}</Pill>
                    <Button small onClick={() => navigate(`doctor/patient/${i.patient_id}/visits`)}>
                      {P.review}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
    </>
  );
};

interface PatientRow {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  national_id?: string;
  phone?: string;
  mrn: string;
}

export const DoctorPatients: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const P = A.doctor.patients;
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(id);
  }, [text]);
  const { state, reload } = useApiData<PatientRow[]>(`/api/patients?search=${encodeURIComponent(term)}`);
  return (
    <>
      <PageHead title={P.title} subtitle={P.subtitle} />
      <div className="na-stack">
        <Card>
          <Field label={P.search} htmlFor="dp-search" help={P.hint}>
            <input id="dp-search" type="search" className="na-input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </Field>
        </Card>
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={P.empty} />}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((p) => (
                  <li key={p.id}>
                    <div className="na-item-main">
                      <span className="na-item-title">{nameOf(A.lang, p)}</span>
                      <span className="na-item-sub">
                        {P.mrn}: <span className="na-ltr">{p.mrn}</span>
                        {p.phone ? <> · <span className="na-ltr">{p.phone}</span></> : null}
                      </span>
                    </div>
                    <Button small onClick={() => navigate(`doctor/patient/${p.id}/summary`)}>
                      {P.open}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ patient workspace */

const TABS = ['summary', 'timeline', 'records', 'meds', 'visits'] as const;
type Tab = (typeof TABS)[number];

export const PatientWorkspace: React.FC<{ patientId: string; tab: string; navigate: (r: string) => void }> = ({ patientId, tab, navigate }) => {
  const A = useA();
  const W = A.doctor.workspace;
  const current: Tab = (TABS as readonly string[]).includes(tab) ? (tab as Tab) : 'summary';
  const patient = useApiData<any>(`/api/patients/${patientId}`);
  const endpoint = `/api/patients/${patientId}/timeline`;

  return (
    <>
      <PageHead
        title={patient.state.status === 'ready' ? nameOf(A.lang, patient.state.data) : A.common.states.loading}
        back={{ label: W.back, onClick: () => navigate('doctor/patients') }}
        subtitle={patient.state.status === 'ready' ? `${W.summary.mrn}: ${patient.state.data.mrn}` : undefined}
      />
      <nav className="na-tabs" aria-label={A.common.shell.breadcrumb}>
        {TABS.map((t) => (
          <button key={t} type="button" className="na-tab" aria-current={current === t ? 'page' : undefined} onClick={() => navigate(`doctor/patient/${patientId}/${t}`)}>
            {W.tabs[t]}
          </button>
        ))}
      </nav>

      <Async state={patient.state} onRetry={patient.reload}>
        {(p) => (
          <div className="na-stack">
            {current === 'summary' && <Summary patient={p} endpoint={endpoint} navigate={() => navigate(`doctor/patient/${patientId}/timeline`)} />}
            {current === 'timeline' && <Timeline endpoint={endpoint} audience="clinician" />}
            {current === 'records' && <Records patientId={patientId} endpoint={endpoint} />}
            {current === 'meds' && <MedsAndAllergies patient={p} endpoint={endpoint} reload={patient.reload} />}
            {current === 'visits' && <DoctorWorkspace initialPatientId={patientId} />}
          </div>
        )}
      </Async>
    </>
  );
};

const Summary: React.FC<{ patient: any; endpoint: string; navigate: () => void }> = ({ patient, endpoint, navigate }) => {
  const A = useA();
  const S = A.doctor.workspace.summary;
  return (
    <>
      <Notice tone="info" icon="shield">
        {S.currentVisitNote}
      </Notice>
      <Card title={S.allergies}>
        <Allergies allergies={patient.allergies ?? []} empty={S.noAllergies} />
      </Card>
      <Card title={S.identity}>
        <dl className="na-dl">
          <dt>{S.dob}</dt>
          <dd>{formatDate(A.lang, patient.date_of_birth)}</dd>
          <dt>{S.gender}</dt>
          <dd>{A.reception.patients.genders[patient.gender] || A.common.states.notRecorded}</dd>
          <dt>{S.blood}</dt>
          <dd className="na-ltr">{patient.blood_type || A.common.states.notRecorded}</dd>
          <dt>{S.phone}</dt>
          <dd className="na-ltr">{patient.phone || A.common.states.notRecorded}</dd>
        </dl>
      </Card>
      <div className="na-grid na-grid--3">
        <Card title={S.visits}>
          <RecentRecords endpoint={endpoint} types={['visit']} limit={3} emptyText={S.none} />
        </Card>
        <Card title={S.meds}>
          <RecentRecords endpoint={endpoint} types={['prescription']} limit={3} emptyText={S.none} />
        </Card>
        <Card title={S.results}>
          <RecentRecords endpoint={endpoint} types={['lab_result']} limit={4} emptyText={S.none} />
        </Card>
      </div>
      <div>
        <Button variant="quiet" onClick={navigate}>
          {S.fullTimeline}
        </Button>
      </div>
    </>
  );
};

const Allergies: React.FC<{ allergies: any[]; empty: string }> = ({ allergies, empty }) => {
  const A = useA();
  const M = A.doctor.workspace.meds;
  if (allergies.length === 0) return <p>{empty}</p>;
  return (
    <ul className="na-list">
      {allergies.map((a) => (
        <li key={a.id} className="na-list-item">
          <div className="na-row">
            <strong>{pick(A.lang, a, 'allergen')}</strong>
            <Pill tone="warn">{M.severities[a.severity] ?? a.severity}</Pill>
          </div>
          {pick(A.lang, a, 'reaction') && <span className="na-muted">{pick(A.lang, a, 'reaction')}</span>}
        </li>
      ))}
    </ul>
  );
};

const Records: React.FC<{ patientId: string; endpoint: string }> = ({ patientId, endpoint }) => {
  const A = useA();
  const R = A.doctor.workspace.records;
  const D = A.record.documents;
  const [version, setVersion] = useState(0);
  const docs = useApiData<TimelineItem[]>(`/api/documents?patientId=${patientId}&limit=50&v=${version}`);
  const review = useMutation();
  const [msg, setMsg] = useState('');

  const doReview = async (id: string, release: boolean) => {
    const res = await review.run(`/api/documents/${id}/review`, 'POST', { release });
    setMsg(res.ok ? D.released : res.error.message);
    setVersion((v) => v + 1);
  };

  return (
    <>
      <DocumentUpload patientId={patientId} onUploaded={() => setVersion((v) => v + 1)} />
      <Card title={R.docs} hint={R.reviewHint}>
        {msg && (
          <Notice tone="ok" live>
            {msg}
          </Notice>
        )}
        <Async state={docs.state} onRetry={docs.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{D.docsEmpty}</p>}>
          {(items) => (
            <ul className="na-list">
              {items.map((i) => (
                <li key={i.id} className="na-list-item">
                  <strong>{String(i.data.title || i.data.fileName)}</strong>
                  <div className="na-row">
                    <ProvenancePill provenance={i.provenance} />
                    <ReviewPill status={i.reviewStatus} />
                    <Pill tone="info">{nameOf(A.lang, i.organization)}</Pill>
                    {i.isExternal && <Pill tone="lilac">{A.common.record.external}</Pill>}
                  </div>
                  <span className="na-muted">{formatDate(A.lang, i.occurredAt)}</span>
                  {!i.isExternal && i.reviewStatus !== 'reviewed' && (
                    <div className="na-row">
                      <Button small variant="primary" disabled={review.pending} onClick={() => doReview(i.source.id, true)}>
                        {D.release}
                      </Button>
                      <Button small disabled={review.pending} onClick={() => doReview(i.source.id, false)}>
                        {D.reviewOnly}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
      <ResultsComparison endpoint={endpoint} />
    </>
  );
};

const MedsAndAllergies: React.FC<{ patient: any; endpoint: string; reload: () => void }> = ({ patient, endpoint, reload }) => {
  const A = useA();
  const M = A.doctor.workspace.meds;
  const { run, pending } = useMutation();
  const [form, setForm] = useState({ allergen_ar: '', allergen_en: '', reaction_ar: '', reaction_en: '', severity: 'mild' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.allergen_ar.trim() || !form.allergen_en.trim()) return setMsg({ tone: 'danger', text: M.required });
    const res = await run(`/api/patients/${patient.id}/allergies`, 'POST', form);
    if (res.ok) {
      setMsg({ tone: 'ok', text: M.saved });
      setForm({ allergen_ar: '', allergen_en: '', reaction_ar: '', reaction_en: '', severity: 'mild' });
      reload();
    } else setMsg({ tone: 'danger', text: res.error.message });
  };

  return (
    <>
      <Card title={M.allergies}>
        <Allergies allergies={patient.allergies ?? []} empty={A.doctor.workspace.summary.noAllergies} />
      </Card>
      <Card title={M.add}>
        <form className="na-form" onSubmit={submit} noValidate>
          <Field label={M.allergenAr} htmlFor="al-ar">
            <input id="al-ar" className="na-input" dir="rtl" value={form.allergen_ar} onChange={(e) => setForm({ ...form, allergen_ar: e.target.value })} />
          </Field>
          <Field label={M.allergenEn} htmlFor="al-en">
            <input id="al-en" className="na-input" dir="ltr" value={form.allergen_en} onChange={(e) => setForm({ ...form, allergen_en: e.target.value })} />
          </Field>
          <Field label={M.reactionAr} htmlFor="al-rar">
            <input id="al-rar" className="na-input" dir="rtl" value={form.reaction_ar} onChange={(e) => setForm({ ...form, reaction_ar: e.target.value })} />
          </Field>
          <Field label={M.reactionEn} htmlFor="al-ren">
            <input id="al-ren" className="na-input" dir="ltr" value={form.reaction_en} onChange={(e) => setForm({ ...form, reaction_en: e.target.value })} />
          </Field>
          <Field label={M.severity} htmlFor="al-sev">
            <select id="al-sev" className="na-select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {Object.entries(M.severities).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="na-form-actions">
            <Button type="submit" variant="primary" disabled={pending}>
              {M.save}
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
      <Card title={M.prescriptions} hint={M.prescriptionsNote}>
        <RecentRecords endpoint={endpoint} types={['prescription']} limit={30} emptyText={M.noRx} />
      </Card>
    </>
  );
};
