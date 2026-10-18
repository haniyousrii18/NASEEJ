import React, { useEffect, useState } from 'react';
import { LabForm, RecordList, RxForm, VisitEditor, VisitsTab } from './doctorVisits.js';
import { AppIcon } from '../AppIcons.js';
import { useApiData, useMutation } from '../api.js';
import { addDays, fill, formatDate, nameOf, pick, todayIso } from '../format.js';
import { AiOverview, DocumentAiPanel } from '../record/AiPanel.js';
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
  awaitingReview?: { documents: number; suggestions: number; patientQuestions: number; operationalMessages: number };
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
            {d.awaitingReview && (
              <Card title={A.care.doctorHome.awaiting}>
                <ul className="na-list">
                  {(
                    [
                      ['documents', A.care.doctorHome.documents, 'doctor/patients'],
                      ['suggestions', A.care.doctorHome.suggestions, 'doctor/patients'],
                      ['patientQuestions', A.care.doctorHome.questions, 'doctor/messages'],
                      ['operationalMessages', A.care.doctorHome.ops, 'doctor/messages'],
                    ] as const
                  ).map(([key, label, route]) => (
                    <li key={key}>
                      <div className="na-item-main">
                        <span className="na-item-title">{label}</span>
                      </div>
                      <div className="na-row">
                        <Pill tone={d.awaitingReview![key] > 0 ? 'warn' : 'neutral'}>{d.awaitingReview![key]}</Pill>
                        <Button small variant="quiet" onClick={() => navigate(route)}>
                          {A.care.aiReview.show}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
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
          <Field label={P.search} htmlFor="dp-search">
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

const TABS = ['summary', 'visits', 'meds', 'labs'] as const;
type Tab = (typeof TABS)[number];
type Panel = 'docs' | 'timeline' | 'visit' | 'rx' | 'lab' | null;

const ageOf = (dob?: string): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
};

const Sec: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rec-sec">
    <h2 className="rec-h">{title}</h2>
    {children}
  </section>
);

export const PatientWorkspace: React.FC<{ patientId: string; tab: string; navigate: (r: string) => void }> = ({ patientId, tab, navigate }) => {
  const A = useA();
  const W = A.doctor.workspace;
  // Older links used the former "timeline" and "records" tabs; they now open the matching side panel on the summary.
  const legacyPanel: Panel = tab === 'timeline' ? 'timeline' : tab === 'records' ? 'docs' : null;
  const current: Tab = (TABS as readonly string[]).includes(tab) ? (tab as Tab) : 'summary';
  const [panel, setPanel] = useState<Panel>(legacyPanel);
  const [version, setVersion] = useState(0);
  const changed = () => setVersion((v) => v + 1);
  const patient = useApiData<any>(`/api/patients/${patientId}`);
  const endpoint = `/api/patients/${patientId}/timeline`;
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const ready = patient.state.status === 'ready' ? patient.state.data : null;
  const age = ready ? ageOf(ready.date_of_birth) : null;
  const panelTitle = (p: Exclude<Panel, null>) => (p === 'docs' ? W.quick.docs : p === 'timeline' ? W.quick.timelineTitle : W.visitsUi.titles[p]);

  return (
    <div className="rec">
      <PageHead
        title={ready ? nameOf(A.lang, ready) : A.common.states.loading}
        back={{ label: W.back, onClick: () => navigate('doctor/patients') }}
        subtitle={ready ? [`${W.summary.mrn}: ${ready.mrn}`, age !== null ? fill(W.brief.age, { n: age }) : ''].filter(Boolean).join(' · ') : undefined}
        actions={
          <div className="rec-quick" role="group">
            <Button small icon="documents" aria-pressed={panel === 'docs'} onClick={() => togglePanel('docs')}>
              {W.quick.docs}
            </Button>
            <Button small icon="timeline" aria-pressed={panel === 'timeline'} onClick={() => togglePanel('timeline')}>
              {W.quick.timeline}
            </Button>
          </div>
        }
      />
      {ready && <AllergyBar allergies={uniqueAllergies(ready.allergies ?? [])} />}
      <nav className="na-tabs" aria-label={A.common.shell.breadcrumb}>
        {TABS.map((t) => (
          <button key={t} type="button" className="na-tab" aria-current={current === t ? 'page' : undefined} onClick={() => navigate(`doctor/patient/${patientId}/${t}`)}>
            {W.tabs[t]}
          </button>
        ))}
      </nav>

      <Async state={patient.state} onRetry={patient.reload}>
        {(p) => (
          <div className="rec-body" data-panel={panel ?? 'none'}>
            <div className="rec-main">
              {current === 'summary' && <Summary patient={p} endpoint={endpoint} />}
              {current === 'visits' && <VisitsTab endpoint={endpoint} version={version} onChanged={changed} open={(p) => setPanel(p)} />}
              {current === 'meds' && <MedsAndAllergies patient={p} endpoint={endpoint} reload={patient.reload} version={version} onChanged={changed} />}
              {current === 'labs' && <Labs endpoint={endpoint} version={version} onChanged={changed} />}
            </div>
            {panel && (
              <aside className="rec-panel" aria-label={panelTitle(panel)}>
                <div className="rec-panel-head">
                  <h2 className="rec-h">{panelTitle(panel)}</h2>
                  <button type="button" className="na-icon-btn" onClick={() => setPanel(null)} aria-label={W.quick.close}>
                    <AppIcon name="close" />
                  </button>
                </div>
                {panel === 'docs' && <Documents patientId={patientId} />}
                {panel === 'timeline' && <Timeline endpoint={endpoint} audience="clinician" />}
                {panel === 'visit' && <VisitEditor patientId={patientId} onSaved={() => { changed(); setPanel(null); }} />}
                {panel === 'rx' && <RxForm patientId={patientId} endpoint={endpoint} onSaved={() => { changed(); setPanel(null); }} />}
                {panel === 'lab' && <LabForm patientId={patientId} onSaved={() => { changed(); setPanel(null); }} />}
              </aside>
            )}
          </div>
        )}
      </Async>
    </div>
  );
};

/** The same allergen can be recorded more than once; the glance views show each one a single time. The medications tab keeps the full list. */
const uniqueAllergies = (list: any[]) => {
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = `${a.allergen_ar}|${a.allergen_en}|${a.severity}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Shown on every tab when allergies are recorded; nothing is rendered otherwise. */
const AllergyBar: React.FC<{ allergies: any[] }> = ({ allergies }) => {
  const A = useA();
  if (allergies.length === 0) return null;
  return (
    <ul className="rec-allergy" aria-label={A.doctor.workspace.brief.allergyChip}>
      {allergies.map((a) => (
        <li key={a.id}>
          <Pill tone="danger">
            {pick(A.lang, a, 'allergen')}
            {a.severity ? ` · ${A.doctor.workspace.meds.severities[a.severity] ?? a.severity}` : ''}
          </Pill>
        </li>
      ))}
    </ul>
  );
};

const Summary: React.FC<{ patient: any; endpoint: string }> = ({ patient, endpoint }) => {
  const A = useA();
  const S = A.doctor.workspace.summary;
  const B = A.doctor.workspace.brief;
  const visits = useApiData<TimelineItem[]>(`${endpoint}?type=visit&limit=3`);
  return (
    <>
      <Sec title={B.title}>
        {patient.blood_type && (
          <p className="rec-fact">
            <span className="na-muted">{S.blood}</span> <span className="na-ltr">{patient.blood_type}</span>
          </p>
        )}
        <RecentRecords endpoint={endpoint} types={['prescription']} limit={3} emptyText={S.none} />
      </Sec>
      <Sec title={B.complaint}>
        <RecentRecords endpoint={endpoint} types={['symptom_report']} limit={1} emptyText={S.none} />
      </Sec>
      <AiOverview patientId={patient.id} />
      <Sec title={B.lastDx}>
        <Async state={visits.state} onRetry={visits.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{S.none}</p>}>
          {(items) => (
            <ul className="na-list">
              {items.map((v) => (
                <li key={v.id} className="na-list-item">
                  <strong dir="auto">{v.data.diagnosis || B.noDx}</strong>
                  <span className="na-muted">
                    {[formatDate(A.lang, v.occurredAt, true), nameOf(A.lang, v.author)].filter(Boolean).join(' · ')}
                  </span>
                  <ReviewPill status={v.reviewStatus} />
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Sec>
    </>
  );
};

const Labs: React.FC<{ endpoint: string; version: number; onChanged: () => void }> = ({ endpoint, version, onChanged }) => {
  const A = useA();
  return (
    <>
      <Sec title={A.doctor.workspace.records.results}>
        <RecordList endpoint={endpoint} types={['lab_result']} version={version} onChanged={onChanged} empty={A.doctor.workspace.summary.none} />
      </Sec>
      <ResultsComparison endpoint={endpoint} />
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

type DocSource = 'all' | 'center' | 'external' | 'patient';
type DocStatus = 'all' | 'needs' | 'reviewed';

const Documents: React.FC<{ patientId: string }> = ({ patientId }) => {
  const A = useA();
  const F = A.doctor.workspace.docsPanel;
  const D = A.record.documents;
  const [version, setVersion] = useState(0);
  const [source, setSource] = useState<DocSource>('all');
  const [status, setStatus] = useState<DocStatus>('all');
  const docs = useApiData<TimelineItem[]>(`/api/documents?patientId=${patientId}&limit=50&v=${version}`);
  const review = useMutation();
  const [error, setError] = useState('');

  const doReview = async (id: string, release: boolean) => {
    const res = await review.run(`/api/documents/${id}/review`, 'POST', { release });
    setError(res.ok ? '' : res.error.message);
    setVersion((v) => v + 1);
  };

  const matches = (i: TimelineItem) => {
    if (source === 'center' && (i.isExternal || i.provenance === 'patient_uploaded')) return false;
    if (source === 'external' && !i.isExternal) return false;
    if (source === 'patient' && i.provenance !== 'patient_uploaded') return false;
    if (status === 'needs' && i.reviewStatus === 'reviewed') return false;
    if (status === 'reviewed' && i.reviewStatus !== 'reviewed') return false;
    return true;
  };
  const chip = <T extends string>(value: T, current: T, set: (v: T) => void, label: string) => (
    <button key={value} type="button" className="rec-chip" aria-pressed={current === value} onClick={() => set(value)}>
      {label}
    </button>
  );

  return (
    <>
      <div className="rec-filters" role="group" aria-label={F.source}>
        {chip<DocSource>('all', source, setSource, F.all)}
        {chip<DocSource>('center', source, setSource, F.center)}
        {chip<DocSource>('external', source, setSource, F.external)}
        {chip<DocSource>('patient', source, setSource, F.patient)}
      </div>
      <div className="rec-filters" role="group" aria-label={F.status}>
        {chip<DocStatus>('all', status, setStatus, F.all)}
        {chip<DocStatus>('needs', status, setStatus, F.needsReview)}
        {chip<DocStatus>('reviewed', status, setStatus, F.reviewed)}
      </div>
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
      <Async state={docs.state} onRetry={docs.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{D.docsEmpty}</p>}>
        {(all) => {
          const items = all.filter(matches);
          if (items.length === 0) return <p className="na-muted">{F.noMatch}</p>;
          return (
            <ul className="na-list">
              {items.map((i) => (
                <li key={i.id} className="na-list-item">
                  <strong>{String(i.data.title || i.data.fileName)}</strong>
                  <span className="na-muted">{[formatDate(A.lang, i.occurredAt), nameOf(A.lang, i.organization)].join(' · ')}</span>
                  <div className="na-row">
                    <ProvenancePill provenance={i.provenance} />
                    <ReviewPill status={i.reviewStatus} />
                    {i.isExternal && <Pill tone="lilac">{A.common.record.external}</Pill>}
                  </div>
                  {!i.isExternal && (
                    <details className="rec-upload">
                      <summary>{A.care.aiReview.title}</summary>
                      <DocumentAiPanel documentId={i.source.id} fileName={String(i.data.fileName)} />
                    </details>
                  )}
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
          );
        }}
      </Async>
      <details className="rec-upload">
        <summary>{F.upload}</summary>
        <DocumentUpload patientId={patientId} onUploaded={() => setVersion((v) => v + 1)} />
      </details>
    </>
  );
};

const MedsAndAllergies: React.FC<{ patient: any; endpoint: string; reload: () => void; version: number; onChanged: () => void }> = ({ patient, endpoint, reload, version, onChanged }) => {
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
      <Card title={M.prescriptions}>
        <RecordList endpoint={endpoint} types={['prescription']} version={version} onChanged={onChanged} empty={M.noRx} />
      </Card>
    </>
  );
};
