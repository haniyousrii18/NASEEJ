import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate, nameOf, pick, todayIso } from '../format.js';
import { ProvenancePill, ReviewPill } from '../record/badges.js';
import { ResultsComparison } from '../record/ResultsComparison.js';
import { Timeline, titleOf, type TimelineItem } from '../record/Timeline.js';
import { Async, Button, Card, EmptyState, ErrorState, Field, Loading, Notice, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { DocumentUpload } from './shared.js';

/** Pages of the patient role. Everything comes from /api/portal and /api/documents, which scope by the patient's own profile. */

export interface PortalSummary {
  profile: { full_name_ar: string; full_name_en: string; date_of_birth: string; blood_type: string | null };
  allergies: Array<{ id: string; allergen_ar: string; allergen_en: string; reaction_ar: string | null; reaction_en: string | null; severity: string }>;
  affiliatedCenters: Array<{ id: string; name_ar: string; name_en: string; mrn: string; first_visit_date: string | null }>;
  visits: Array<any>;
  prescriptions: Array<any>;
  labResults: Array<any>;
  upcomingAppointments: Array<any>;
}

const usePortalSummary = () => useApiData<PortalSummary>('/api/portal/summary');

const Source: React.FC<{ center?: any; clinician?: any; date?: string; withTime?: boolean }> = ({ center, clinician, date, withTime }) => {
  const A = useA();
  const parts = [date ? formatDate(A.lang, date, withTime) : '', center ? nameOf(A.lang, center) : '', clinician ? nameOf(A.lang, clinician) : ''].filter(Boolean);
  return <span className="na-muted">{parts.join(' · ')}</span>;
};

const centerOf = (r: any) => ({ name_ar: r.center_name_ar, name_en: r.center_name_en });
const clinicianOf = (r: any) => ({ name_ar: r.clinician_name_ar, name_en: r.clinician_name_en });

export const PatientHome: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const H = A.patient.home;
  const { user } = useAuth();
  const summary = usePortalSummary();
  const recent = useApiData<TimelineItem[]>('/api/portal/timeline?limit=5');
  const messages = useApiData<any[]>('/api/portal/messages');
  const consents = useApiData<any[]>('/api/portal/consents');

  const name = user ? (A.lang === 'ar' ? user.fullNameAr : user.fullNameEn) : '';

  return (
    <>
      <PageHead title={fill(H.title, { name })} subtitle={H.subtitle} />
      <div className="na-grid na-grid--2">
        <Card title={H.nextAppointment}>
          <Async
            state={summary.state}
            onRetry={summary.reload}
            isEmpty={(s) => s.upcomingAppointments.length === 0}
            empty={
              <EmptyState
                title={H.noAppointment}
                body={H.noAppointmentBody}
                action={<Button variant="primary" onClick={() => navigate('patient/appointments')}>{A.patient.appointments.requestAction}</Button>}
              />
            }
          >
            {(s) => {
              const a = s.upcomingAppointments[0];
              return (
                <div className="na-stack">
                  <div className="na-bignum">
                    {formatDate(A.lang, a.appointment_date)} <span className="na-ltr">{String(a.start_time).slice(0, 5)}</span>
                  </div>
                  <p>{fill(H.withDoctor, { doctor: nameOf(A.lang, clinicianOf(a)) })}</p>
                  <div className="na-row">
                    <Pill tone="info">{nameOf(A.lang, centerOf(a))}</Pill>
                    <Pill>{(A.common.appointmentStatus as Record<string, string>)[a.status]}</Pill>
                  </div>
                  <div>
                    <Button small variant="quiet" onClick={() => navigate('patient/appointments')}>
                      {A.nav.items.patientAppointments}
                    </Button>
                  </div>
                </div>
              );
            }}
          </Async>
        </Card>

        <Card title={H.nextActions}>
          <div className="na-stack">
            {messages.state.status === 'ready' &&
              (() => {
                const replies = messages.state.data.filter((m) => m.response).length;
                return replies > 0 ? (
                  <Notice tone="ok" icon="message">
                    <strong>{H.actionReply}</strong>
                    <br />
                    {fill(H.actionReplyBody, { n: replies })}{' '}
                    <button type="button" className="na-link" onClick={() => navigate('patient/messages')}>
                      {A.nav.items.patientMessages}
                    </button>
                  </Notice>
                ) : (
                  <p className="na-muted">{H.allClear}</p>
                );
              })()}
          </div>
        </Card>
      </div>

      <Card
        title={H.recent}
        actions={
          <Button small variant="quiet" onClick={() => navigate('patient/timeline')}>
            {H.seeAll}
          </Button>
        }
      >
        <Async state={recent.state} onRetry={recent.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={H.recentEmpty} body={H.recentEmptyBody} />}>
          {(items) => (
            <ul className="na-list">
              {items.map((i) => (
                <li key={i.id} className="na-list-item">
                  <div className="na-row">
                    <Pill>{A.common.recordType[i.type]}</Pill>
                    <ProvenancePill provenance={i.provenance} />
                    <ReviewPill status={i.reviewStatus} />
                  </div>
                  <strong className="na-item-title">{titleOf(i, A)}</strong>
                  <Source center={i.organization} clinician={i.author} date={i.occurredAt} />
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>

      <Card title={H.centers}>
        <Async state={summary.state} onRetry={summary.reload}>
          {(s) => (
            <div className="na-row">
              {s.affiliatedCenters.map((c) => (
                <Pill key={c.id} tone="info">
                  {nameOf(A.lang, c)}
                </Pill>
              ))}
            </div>
          )}
        </Async>
      </Card>
    </>
  );
};

/** The approved health summary. Shared by the patient and by a caregiver whose authorization allows viewing records. */
export const SummaryView: React.FC<{ s: PortalSummary }> = ({ s }) => {
  const A = useA();
  const S = A.patient.summary;
  return (
    <div className="na-stack">

      <Card title={S.profile}>
        <dl className="na-dl">
          <dt>{S.dob}</dt>
          <dd>{formatDate(A.lang, s.profile.date_of_birth)}</dd>
          <dt>{S.blood}</dt>
          <dd className="na-ltr">{s.profile.blood_type || A.common.states.notRecorded}</dd>
        </dl>
      </Card>

      <Card title={S.allergies}>
        {s.allergies.length === 0 ? (
          <p>{A.common.record.noAllergies}</p>
        ) : (
          <ul className="na-list">
            {s.allergies.map((a) => (
              <li key={a.id} className="na-list-item">
                <strong>{pick(A.lang, a, 'allergen')}</strong> <Pill tone="warn">{S.severity[a.severity] ?? a.severity}</Pill>
                {pick(A.lang, a, 'reaction') && (
                  <div className="na-muted">
                    {S.reaction}: {pick(A.lang, a, 'reaction')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="na-grid na-grid--2">
        <Card title={S.recentVisits}>
          {s.visits.length === 0 ? (
            <p className="na-muted">{S.noVisits}</p>
          ) : (
            <ul className="na-list">
              {s.visits.slice(0, 3).map((v) => (
                <li key={v.id} className="na-list-item">
                  <strong>{v.chief_complaint}</strong>
                  {v.diagnosis && (
                    <div>
                      {A.common.record.diagnosis}: {v.diagnosis}
                    </div>
                  )}
                  <div className="na-row">
                    <ProvenancePill provenance="clinician_authored" />
                    <ReviewPill status="approved" />
                  </div>
                  <Source center={centerOf(v)} clinician={clinicianOf(v)} date={v.visit_date} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={S.recentMeds}>
          {s.prescriptions.length === 0 ? (
            <p className="na-muted">{S.noMeds}</p>
          ) : (
            <ul className="na-list">
              {s.prescriptions.slice(0, 3).map((p) => (
                <li key={p.id} className="na-list-item">
                  <strong>{(p.items || []).map((i: any) => `${i.medication_name} ${i.dosage}`).join('، ')}</strong>
                  <div className="na-row">
                    <ProvenancePill provenance="clinician_authored" />
                    <ReviewPill status="approved" />
                  </div>
                  <Source center={centerOf(p)} clinician={clinicianOf(p)} date={p.created_at} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={S.recentResults}>
        {s.labResults.length === 0 ? (
          <p className="na-muted">{S.noResults}</p>
        ) : (
          <div className="na-table-wrap">
            <table className="na-table">
              <thead>
                <tr>
                  <th>{A.common.record.parameter}</th>
                  <th>{A.common.record.value}</th>
                  <th>{A.common.record.reference}</th>
                  <th>{A.common.record.sourceCenter}</th>
                  <th>{A.common.record.reviewedAt}</th>
                </tr>
              </thead>
              <tbody>
                {s.labResults.slice(0, 6).map((r) => (
                  <tr key={r.id}>
                    <td>{r.parameter_name}</td>
                    <td className="na-ltr">
                      {r.value} {r.unit}
                    </td>
                    <td className="na-ltr">{r.reference_range || '—'}</td>
                    <td>{nameOf(A.lang, centerOf(r))}</td>
                    <td>{formatDate(A.lang, r.reviewed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={S.centers}>
        <ul className="na-list">
          {s.affiliatedCenters.map((c) => (
            <li key={c.id} className="na-list-item">
              <strong>{nameOf(A.lang, c)}</strong>
              <div className="na-muted">
                {S.mrn}: <span className="na-ltr">{c.mrn}</span>
                {c.first_visit_date ? ` · ${fill(S.since, { date: formatDate(A.lang, c.first_visit_date) })}` : ''}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export const PatientSummary: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const S = A.patient.summary;
  const { state, reload } = usePortalSummary();
  return (
    <>
      <PageHead title={S.title} subtitle={S.subtitle} actions={<Button variant="quiet" onClick={() => navigate('patient/timeline')}>{S.seeTimeline}</Button>} />
      <Async state={state} onRetry={reload}>
        {(s) => <SummaryView s={s} />}
      </Async>
    </>
  );
};

export const PatientTimeline: React.FC = () => {
  const A = useA();
  return (
    <>
      <PageHead title={A.nav.items.patientTimeline} />
      <Timeline endpoint="/api/portal/timeline" audience="patient" />
    </>
  );
};

export const PatientDocuments: React.FC = () => {
  const A = useA();
  const D = A.record.documents;
  const summary = usePortalSummary();
  const [version, setVersion] = useState(0);
  return (
    <>
      <PageHead title={A.nav.items.patientDocuments} />
      <div className="na-stack">
        <Async state={summary.state} onRetry={summary.reload}>
          {(s) => <DocumentUpload centers={s.affiliatedCenters} onUploaded={() => setVersion((v) => v + 1)} />}
        </Async>
        <Card title={D.sectionDocs}>
          <Timeline key={version} endpoint="/api/portal/timeline" audience="patient" types={['document']} />
        </Card>
        <ResultsComparison endpoint="/api/portal/timeline" />
      </div>
    </>
  );
};

export const PatientMedications: React.FC = () => {
  const A = useA();
  const M = A.patient.medications;
  return (
    <>
      <PageHead title={M.title} subtitle={M.subtitle} />
      <Timeline endpoint="/api/portal/timeline" audience="patient" types={['prescription']} pageSize={10} />
    </>
  );
};

interface PortalClinician {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  specialty_ar: string | null;
  specialty_en: string | null;
}

interface PortalAvailability {
  date: string;
  clinicianId: string;
  working: boolean;
  slots: Array<{ start_time: string; end_time: string; available: boolean }>;
}

export const PatientAppointments: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const P = A.patient.appointments;
  const summary = usePortalSummary();
  const past = useApiData<TimelineItem[]>('/api/portal/timeline?type=appointment&limit=50');
  const request = useMutation();
  const [selectedCenter, setSelectedCenter] = useState('');
  const [selectedClinician, setSelectedClinician] = useState('');
  const [date, setDate] = useState(todayIso());
  const [selectedSlot, setSelectedSlot] = useState('');
  const [requestMessage, setRequestMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const today = todayIso();

  const centers = summary.state.status === 'ready' ? summary.state.data.affiliatedCenters : [];
  const centerId = selectedCenter || centers[0]?.id || '';
  const clinicians = useApiData<PortalClinician[]>(centerId ? `/api/portal/clinicians?organizationId=${encodeURIComponent(centerId)}` : null);
  const clinicianIds = clinicians.state.status === 'ready' ? clinicians.state.data.map((c) => c.id).join('|') : '';

  React.useEffect(() => {
    if (clinicians.state.status === 'ready' && !clinicians.state.data.some((c) => c.id === selectedClinician)) {
      setSelectedClinician(clinicians.state.data[0]?.id ?? '');
      setSelectedSlot('');
    }
  }, [centerId, clinicianIds, selectedClinician]);

  const availabilityQuery = new URLSearchParams({ organizationId: centerId, clinicianId: selectedClinician, date });
  const availabilityPath = centerId && selectedClinician && date ? `/api/portal/availability?${availabilityQuery}` : null;
  const availability = useApiData<PortalAvailability>(availabilityPath);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setRequestMessage(null);
    if (!centerId || !selectedClinician || !selectedSlot) {
      setRequestMessage({ tone: 'danger', text: P.requestRequired });
      return;
    }
    const slot = availability.state.status === 'ready' ? availability.state.data.slots.find((item) => item.start_time === selectedSlot && item.available) : null;
    if (!slot) {
      setSelectedSlot('');
      setRequestMessage({ tone: 'danger', text: P.slotConflict });
      void availability.reload();
      return;
    }
    const result = await request.run('/api/portal/appointments', 'POST', {
      organization_id: centerId,
      clinician_id: selectedClinician,
      appointment_date: date,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });
    if (!result.ok) {
      const text = result.error.code === 'APPOINTMENT_CONFLICT' || result.error.code === 'APPOINTMENT_SLOT_UNAVAILABLE'
        ? P.slotConflict
        : result.error.code === 'APPOINTMENT_SLOT_PAST' ? P.chooseFuture : P.requestFailed;
      setRequestMessage({ tone: 'danger', text });
      setSelectedSlot('');
      void availability.reload();
      return;
    }
    setRequestMessage({ tone: 'ok', text: P.requestSent });
    setSelectedSlot('');
    summary.reload();
    void availability.reload();
  };

  const row = (a: { id: string; date: string; from: string; to: string; status: string; center: any; clinician?: any }) => (
    <li key={a.id} className="na-list-item">
      <strong>{fill(P.when, { date: formatDate(A.lang, a.date), from: a.from, to: a.to })}</strong>
      <div className="na-row">
        <Pill>{(A.common.appointmentStatus as Record<string, string>)[a.status] ?? a.status}</Pill>
        <Pill tone="info">{nameOf(A.lang, a.center)}</Pill>
      </div>
      {a.clinician && <span className="na-muted">{nameOf(A.lang, a.clinician)}</span>}
    </li>
  );

  return (
    <>
      <PageHead title={P.title} subtitle={P.subtitle} />
      <div className="na-stack">
        <Card title={P.requestTitle}>
          {summary.state.status === 'loading' ? <Loading /> : summary.state.status === 'error' ? (
            <ErrorState error={summary.state.error} onRetry={summary.reload} />
          ) : centers.length === 0 ? (
            <EmptyState title={P.noCenters} body={P.noCentersBody} />
          ) : (
            <form className="na-form na-form--stack" onSubmit={submitRequest} noValidate>
              <Field label={P.center} htmlFor="pa-center">
                <select
                  id="pa-center"
                  className="na-select"
                  value={centerId}
                  onChange={(event) => {
                    setSelectedCenter(event.target.value);
                    setSelectedClinician('');
                    setSelectedSlot('');
                    setRequestMessage(null);
                  }}
                >
                  {centers.map((center) => <option key={center.id} value={center.id}>{nameOf(A.lang, center)}</option>)}
                </select>
              </Field>

              <Field label={P.clinician} htmlFor="pa-clinician">
                {clinicians.state.status === 'loading' ? <Loading /> : clinicians.state.status === 'error' ? (
                  <ErrorState error={clinicians.state.error} onRetry={clinicians.reload} />
                ) : clinicians.state.data.length === 0 ? <p className="na-muted">{P.noClinicians}</p> : (
                  <select
                    id="pa-clinician"
                    className="na-select"
                    value={selectedClinician}
                    onChange={(event) => { setSelectedClinician(event.target.value); setSelectedSlot(''); }}
                  >
                    {clinicians.state.data.map((clinician) => (
                      <option key={clinician.id} value={clinician.id}>
                        {nameOf(A.lang, clinician)}{(A.lang === 'ar' ? clinician.specialty_ar : clinician.specialty_en) ? ` · ${A.lang === 'ar' ? clinician.specialty_ar : clinician.specialty_en}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label={P.date} htmlFor="pa-date">
                <input
                  id="pa-date"
                  type="date"
                  className="na-input"
                  min={today}
                  value={date}
                  onChange={(event) => { setDate(event.target.value); setSelectedSlot(''); }}
                />
              </Field>

              {centerId && selectedClinician && date && (
                <div className="na-field">
                  <span className="na-label" id="pa-time-label">{P.time}</span>
                  {availability.state.status === 'loading' ? <Loading /> : availability.state.status === 'error' ? (
                    <ErrorState error={availability.state.error} onRetry={availability.reload} />
                  ) : !availability.state.data.working ? <p className="na-muted">{P.noSchedule}</p> : (
                    <div className="na-slot-list" role="group" aria-labelledby="pa-time-label">
                      {availability.state.data.slots.filter((slot) => slot.available).length === 0 ? <p className="na-muted">{P.noSlots}</p> :
                        availability.state.data.slots.filter((slot) => slot.available).map((slot) => (
                          <button
                            key={slot.start_time}
                            type="button"
                            className="na-slot"
                            aria-pressed={selectedSlot === slot.start_time}
                            onClick={() => setSelectedSlot(slot.start_time)}
                          >
                            <span className="na-ltr">{slot.start_time}–{slot.end_time}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {requestMessage && <Notice tone={requestMessage.tone} live>{requestMessage.text}</Notice>}
              <div className="na-form-actions">
                <Button type="submit" variant="primary" disabled={request.pending || clinicians.state.status !== 'ready' || !selectedClinician || !selectedSlot}>
                  {request.pending ? P.sending : P.requestAction}
                </Button>
                <Button type="button" variant="quiet" onClick={() => navigate('patient/messages')}>
                  {P.contactCenter}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card title={P.upcoming}>
          <Async state={summary.state} onRetry={summary.reload} isEmpty={(s) => s.upcomingAppointments.length === 0} empty={<p className="na-muted">{P.noUpcoming}</p>}>
            {(s) => (
              <ul className="na-list">
                {s.upcomingAppointments.map((a) =>
                  row({ id: a.id, date: a.appointment_date, from: String(a.start_time).slice(0, 5), to: String(a.end_time).slice(0, 5), status: a.status, center: centerOf(a), clinician: clinicianOf(a) }),
                )}
              </ul>
            )}
          </Async>
        </Card>
        <Card title={P.past}>
          <Async
            state={past.state}
            onRetry={past.reload}
            isEmpty={(d) => d.filter((i) => String(i.data.date) < today).length === 0}
            empty={<p className="na-muted">{P.noPast}</p>}
          >
            {(items) => (
              <ul className="na-list">
                {items
                  .filter((i) => String(i.data.date) < today)
                  .map((i) => row({ id: i.id, date: String(i.data.date), from: String(i.data.startTime), to: String(i.data.endTime), status: String(i.data.status), center: i.organization, clinician: i.author }))}
              </ul>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
};

export const PatientMessages: React.FC = () => {
  const A = useA();
  const M = A.patient.messages;
  const summary = usePortalSummary();
  const sent = useApiData<any[]>('/api/portal/messages');
  const symptoms = useApiData<any[]>('/api/portal/symptoms');
  const send = useMutation();
  const logSymptom = useMutation();

  const [q, setQ] = useState({ organization_id: '', subject: '', body: '', category: 'medical' });
  const [qErr, setQErr] = useState('');
  const [qOk, setQOk] = useState(false);
  const [s, setS] = useState({ organization_id: '', symptom_description: '', severity: '5', onset_date: todayIso(), notes: '' });
  const [sErr, setSErr] = useState('');
  const [sOk, setSOk] = useState(false);

  const centers = summary.state.status === 'ready' ? summary.state.data.affiliatedCenters : [];
  const center = q.organization_id || centers[0]?.id || '';
  const sCenter = s.organization_id || '';

  const submitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setQOk(false);
    if (!q.subject.trim() || !q.body.trim() || !center) return setQErr(M.required);
    const res = await send.run('/api/portal/messages', 'POST', { ...q, organization_id: center });
    if (!res.ok) return setQErr(res.error.message);
    setQErr('');
    setQOk(true);
    setQ({ organization_id: q.organization_id, subject: '', body: '', category: 'medical' });
    sent.reload();
  };

  const submitSymptom = async (e: React.FormEvent) => {
    e.preventDefault();
    setSOk(false);
    if (!s.symptom_description.trim()) return setSErr(M.required);
    const res = await logSymptom.run('/api/portal/symptoms', 'POST', {
      organization_id: sCenter || null,
      symptom_description: s.symptom_description,
      severity: Number(s.severity),
      onset_date: s.onset_date,
      notes: s.notes || null,
    });
    if (!res.ok) return setSErr(res.error.message);
    setSErr('');
    setSOk(true);
    setS({ ...s, symptom_description: '', notes: '' });
    symptoms.reload();
  };

  return (
    <>
      <PageHead title={M.title} subtitle={M.subtitle} />
      <div className="na-stack">
        <Notice tone="danger" icon="alert">
          {M.emergency}
        </Notice>
        <div className="na-grid na-grid--2">
          <Card title={M.ask}>
            <form className="na-form na-form--stack" onSubmit={submitQuestion} noValidate>
              <Field label={M.center} htmlFor="q-center">
                <select id="q-center" className="na-select" value={center} onChange={(e) => setQ({ ...q, organization_id: e.target.value })}>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nameOf(A.lang, c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={M.category} htmlFor="q-cat">
                <select id="q-cat" className="na-select" value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value })}>
                  {Object.entries(M.categories).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={M.subject} htmlFor="q-subject">
                <input id="q-subject" className="na-input" maxLength={255} value={q.subject} onChange={(e) => setQ({ ...q, subject: e.target.value })} />
              </Field>
              <Field label={M.body} htmlFor="q-body">
                <textarea id="q-body" className="na-textarea" rows={4} value={q.body} onChange={(e) => setQ({ ...q, body: e.target.value })} />
              </Field>
              {qErr && <Notice tone="danger" live>{qErr}</Notice>}
              {qOk && <Notice tone="ok" live>{M.sent}</Notice>}
              <div>
                <Button type="submit" variant="primary" disabled={send.pending}>
                  {M.send}
                </Button>
              </div>
            </form>
          </Card>

          <Card title={M.symptoms}>
            <form className="na-form na-form--stack" onSubmit={submitSymptom} noValidate>
              <Field label={M.description} htmlFor="s-desc">
                <textarea id="s-desc" className="na-textarea" rows={3} value={s.symptom_description} onChange={(e) => setS({ ...s, symptom_description: e.target.value })} />
              </Field>
              <Field label={`${M.severity}: ${s.severity}`} htmlFor="s-sev">
                <input id="s-sev" type="range" min={1} max={10} value={s.severity} onChange={(e) => setS({ ...s, severity: e.target.value })} />
              </Field>
              <Field label={M.onset} htmlFor="s-onset">
                <input id="s-onset" type="date" className="na-input" max={todayIso()} value={s.onset_date} onChange={(e) => setS({ ...s, onset_date: e.target.value })} />
              </Field>
              <Field label={M.center} htmlFor="s-center">
                <select id="s-center" className="na-select" value={sCenter} onChange={(e) => setS({ ...s, organization_id: e.target.value })}>
                  <option value="">—</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nameOf(A.lang, c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={M.notes} htmlFor="s-notes">
                <input id="s-notes" className="na-input" value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} />
              </Field>
              {sErr && <Notice tone="danger" live>{sErr}</Notice>}
              {sOk && <Notice tone="ok" live>{M.savedSymptom}</Notice>}
              <div>
                <Button type="submit" variant="primary" disabled={logSymptom.pending}>
                  {M.saveSymptom}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <Card title={M.sentList}>
          <Async state={sent.state} onRetry={sent.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{M.none}</p>}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((m) => (
                  <li key={m.id} className="na-list-item">
                    <strong>{m.subject}</strong>
                    <div className="na-row">
                      <Pill tone={m.response ? 'ok' : 'warn'}>{M.status[m.status] ?? m.status}</Pill>
                      <Pill tone="info">{nameOf(A.lang, centerOf(m))}</Pill>
                      <span className="na-muted">{formatDate(A.lang, m.created_at, true)}</span>
                    </div>
                    <p>{m.body}</p>
                    {m.response ? (
                      <Notice tone="ok" icon="message">
                        <strong>{M.response}:</strong> {m.response}
                      </Notice>
                    ) : (
                      <span className="na-muted">{M.awaiting}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Card>

        <Card title={M.mySymptoms}>
          <Async state={symptoms.state} onRetry={symptoms.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{M.noSymptoms}</p>}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((r) => (
                  <li key={r.id} className="na-list-item">
                    <strong>{r.symptom_description}</strong>
                    <div className="na-row">
                      <Pill tone="lilac">{A.common.provenance.patient_reported}</Pill>
                      <span className="na-muted">
                        {r.severity}/10 · {formatDate(A.lang, r.onset_date)}
                      </span>
                    </div>
                    {r.notes && <span className="na-muted">{r.notes}</span>}
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

export const PatientConsents: React.FC = () => {
  const A = useA();
  const C = A.patient.consents;
  const summary = usePortalSummary();
  const list = useApiData<any[]>('/api/portal/consents');
  const grant = useMutation();
  const revoke = useMutation();
  const [form, setForm] = useState({ from: '', to: '', scope: 'all', days: '90' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const centers = summary.state.status === 'ready' ? summary.state.data.affiliatedCenters : [];
  const from = form.from || centers[0]?.id || '';
  const to = form.to || centers.find((c) => c.id !== from)?.id || '';
  const nameById = useMemo(() => new Map(centers.map((c) => [c.id, c])), [centers]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await grant.run('/api/portal/consents', 'POST', {
      from_organization_id: from,
      to_organization_id: to,
      scope: form.scope,
      expires_in_days: Number(form.days),
    });
    setMsg(res.ok ? { tone: 'ok', text: C.granted } : { tone: 'danger', text: res.error.message });
    if (res.ok) list.reload();
  };

  const doRevoke = async (id: string) => {
    if (!window.confirm(C.confirmRevoke)) return;
    const res = await revoke.run(`/api/portal/consents/${id}/revoke`, 'POST');
    setMsg(res.ok ? { tone: 'ok', text: C.revoked } : { tone: 'danger', text: res.error.message });
    list.reload();
  };

  return (
    <>
      <PageHead title={C.title} subtitle={C.subtitle} />
      <div className="na-stack">
        {msg && (
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        )}

        <Card title={C.new}>
          {centers.length < 2 ? (
            <p className="na-muted">{C.needTwo}</p>
          ) : (
            <form className="na-form" onSubmit={submit}>
              <Field label={C.from} htmlFor="c-from">
                <select id="c-from" className="na-select" value={from} onChange={(e) => setForm({ ...form, from: e.target.value, to: '' })}>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nameOf(A.lang, c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={C.to} htmlFor="c-to">
                <select id="c-to" className="na-select" value={to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
                  {centers
                    .filter((c) => c.id !== from)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {nameOf(A.lang, c)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={C.scope} htmlFor="c-scope">
                <select id="c-scope" className="na-select" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                  {Object.entries(C.scopes).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={C.duration} htmlFor="c-days">
                <select id="c-days" className="na-select" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })}>
                  {[30, 90, 180, 365].map((d) => (
                    <option key={d} value={d}>
                      {fill(C.days, { n: d })}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="na-form-actions">
                <Button type="submit" variant="primary" disabled={grant.pending || !from || !to}>
                  {C.grant}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card title={C.existing}>
          <Async state={list.state} onRetry={list.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={C.none} body={C.noneBody} />}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((c) => (
                  <li key={c.id} className="na-list-item">
                    <div className="na-row">
                      <strong>{C.scopes[c.scope] ?? c.scope}</strong>
                      <Pill tone={c.state === 'active' ? 'ok' : 'neutral'}>{C.state[c.state]}</Pill>
                    </div>
                    <div>
                      {fill(C.arrow, {
                        from: nameOf(A.lang, nameById.get(c.from_organization_id) ?? { name_ar: c.from_name_ar, name_en: c.from_name_en }),
                        to: nameOf(A.lang, nameById.get(c.to_organization_id) ?? { name_ar: c.to_name_ar, name_en: c.to_name_en }),
                      })}
                    </div>
                    <span className="na-muted">
                      {fill(C.grantedOn, { date: formatDate(A.lang, c.granted_at) })} ·{' '}
                      {c.state === 'revoked' ? fill(C.revokedOn, { date: formatDate(A.lang, c.revoked_at) }) : fill(C.expiresOn, { date: formatDate(A.lang, c.expires_at) })}
                    </span>
                    {c.state === 'active' && (
                      <div>
                        <Button small variant="danger" onClick={() => doRevoke(c.id)} disabled={revoke.pending}>
                          {C.revoke}
                        </Button>
                      </div>
                    )}
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
