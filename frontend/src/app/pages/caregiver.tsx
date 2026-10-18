import React, { useMemo, useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { addDays, fill, formatDate, nameOf, todayIso } from '../format.js';
import { Timeline } from '../record/Timeline.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';
import { SummaryView, type PortalSummary } from './patient.js';
import { StatusPill } from './AppointmentList.js';

/**
 * The caregiver workspace. A caregiver acts for a patient only through an authorization the patient granted and the
 * caregiver accepted. Every request below goes to /api/caregiver/..., where the server re-checks that the
 * authorization is active, unexpired and includes the action. Hiding a tab here is only a convenience.
 */
interface Delegation {
  id: string;
  relationship: string | null;
  can_view_records: boolean;
  can_manage_appointments: boolean;
  can_send_messages: boolean;
  state: 'invited' | 'active' | 'expired' | 'declined' | 'revoked' | 'ended';
  invited_at: string;
  accepted_at: string | null;
  expires_at: string;
  patient_name_ar: string;
  patient_name_en: string;
}

const STATE_TONE: Record<Delegation['state'], Tone> = { invited: 'warn', active: 'ok', expired: 'neutral', declined: 'neutral', revoked: 'danger', ended: 'neutral' };
const patientName = (lang: 'ar' | 'en', d: Delegation) => nameOf(lang, { name_ar: d.patient_name_ar, name_en: d.patient_name_en });

export const ScopeList: React.FC<{ d: Pick<Delegation, 'can_view_records' | 'can_manage_appointments' | 'can_send_messages'> }> = ({ d }) => {
  const A = useA();
  const S = A.care.scopeNames;
  const rows: Array<[string, boolean]> = [
    [S.view, d.can_view_records],
    [S.appointments, d.can_manage_appointments],
    [S.messages, d.can_send_messages],
  ];
  return (
    <ul className="cg-scopes">
      {rows.map(([label, on]) => (
        <li key={label} data-on={on}>
          <span aria-hidden="true">{on ? '✓' : '—'}</span> {label}
          {!on && <span className="na-sr"> ({A.care.caregiver.notIncluded})</span>}
        </li>
      ))}
    </ul>
  );
};

export const CaregiverHome: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const C = A.care.caregiver;
  const list = useApiData<Delegation[]>('/api/caregiver/delegations');
  const act = useMutation();
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const respond = async (id: string, action: 'accept' | 'decline' | 'leave') => {
    const res = await act.run(`/api/caregiver/delegations/${id}/${action}`, 'POST');
    setMessage(res.ok ? { tone: 'ok', text: action === 'accept' ? C.accepted : action === 'decline' ? C.declined : C.leaveDone } : { tone: 'danger', text: res.error.message });
    list.reload();
  };

  return (
    <>
      <PageHead title={C.homeTitle} subtitle={C.homeSubtitle} />
      <div className="na-stack">
        {message && (
          <Notice tone={message.tone} live>
            {message.text}
          </Notice>
        )}
        <Async state={list.state} onRetry={list.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={C.noneTitle} body={C.noneBody} />}>
          {(all) => {
            const invites = all.filter((d) => d.state === 'invited');
            const active = all.filter((d) => d.state === 'active');
            const past = all.filter((d) => !['invited', 'active'].includes(d.state));
            return (
              <>
                {invites.length > 0 && (
                  <Card title={C.invitations}>
                    <ul className="na-list">
                      {invites.map((d) => (
                        <li key={d.id} className="na-list-item cg-card">
                          <p>{fill(C.invitationBody, { name: patientName(A.lang, d) })}</p>
                          <ScopeList d={d} />
                          <p className="na-muted">{fill(C.ends, { date: formatDate(A.lang, d.expires_at) })}</p>
                          <div className="na-row">
                            <Button variant="primary" small disabled={act.pending} onClick={() => respond(d.id, 'accept')}>
                              {C.accept}
                            </Button>
                            <Button small disabled={act.pending} onClick={() => respond(d.id, 'decline')}>
                              {C.decline}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card title={C.active}>
                  {active.length === 0 ? (
                    <p className="na-muted">{C.noneBody}</p>
                  ) : (
                    <ul className="na-list">
                      {active.map((d) => (
                        <li key={d.id} className="na-list-item cg-card">
                          <div className="na-row na-row--between">
                            <strong>{patientName(A.lang, d)}</strong>
                            <Pill tone={STATE_TONE[d.state]}>{A.care.states[d.state]}</Pill>
                          </div>
                          {d.relationship && (
                            <span className="na-muted">
                              {C.relationship}: {d.relationship}
                            </span>
                          )}
                          <span className="na-muted">{fill(C.ends, { date: formatDate(A.lang, d.expires_at) })}</span>
                          <p className="cg-sub">{C.includes}</p>
                          <ScopeList d={d} />
                          <div className="na-row">
                            <Button variant="primary" small onClick={() => navigate(`caregiver/patient/${d.id}/${d.can_view_records ? 'summary' : d.can_manage_appointments ? 'appointments' : 'messages'}`)}>
                              {C.open}
                            </Button>
                            <Button small variant="quiet" disabled={act.pending} onClick={() => window.confirm(C.leaveBody) && respond(d.id, 'leave')}>
                              {C.leave}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                {past.length > 0 && (
                  <Card title={C.past}>
                    <ul className="na-list">
                      {past.map((d) => (
                        <li key={d.id} className="na-list-item">
                          <div className="na-row na-row--between">
                            <span>{patientName(A.lang, d)}</span>
                            <Pill tone={STATE_TONE[d.state]}>{A.care.states[d.state]}</Pill>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            );
          }}
        </Async>
      </div>
    </>
  );
};

type CgTab = 'summary' | 'timeline' | 'appointments' | 'messages';

export const CaregiverPatient: React.FC<{ id: string; tab: string; navigate: (r: string) => void }> = ({ id, tab, navigate }) => {
  const A = useA();
  const C = A.care.caregiver;
  const list = useApiData<Delegation[]>('/api/caregiver/delegations');

  return (
    <Async state={list.state} onRetry={list.reload}>
      {(all) => {
        const d = all.find((x) => x.id === id && x.state === 'active');
        if (!d) {
          return (
            <>
              <PageHead title={C.homeTitle} back={{ label: C.back, onClick: () => navigate('caregiver/home') }} />
              <EmptyState title={C.unavailable} />
            </>
          );
        }
        const tabs: CgTab[] = [
          ...(d.can_view_records ? (['summary', 'timeline'] as CgTab[]) : []),
          ...(d.can_manage_appointments || d.can_view_records ? (['appointments'] as CgTab[]) : []),
          ...(d.can_send_messages ? (['messages'] as CgTab[]) : []),
        ];
        const current: CgTab = (tabs as string[]).includes(tab) ? (tab as CgTab) : tabs[0];
        const name = patientName(A.lang, d);
        return (
          <>
            <PageHead title={name} back={{ label: C.back, onClick: () => navigate('caregiver/home') }} />
            <nav className="na-tabs" aria-label={name}>
              {tabs.map((t) => (
                <button key={t} type="button" className="na-tab" aria-current={current === t ? 'page' : undefined} onClick={() => navigate(`caregiver/patient/${id}/${t}`)}>
                  {C.tabs[t]}
                </button>
              ))}
            </nav>
            <div className="na-stack">
              {current === 'summary' && <CgSummary id={id} />}
              {current === 'timeline' && <Timeline endpoint={`/api/caregiver/patients/${id}/timeline`} audience="patient" canDownload={false} />}
              {current === 'appointments' && <CgAppointments id={id} canRequest={d.can_manage_appointments} />}
              {current === 'messages' && <CgMessages id={id} />}
            </div>
          </>
        );
      }}
    </Async>
  );
};

const CgSummary: React.FC<{ id: string }> = ({ id }) => {
  const A = useA();
  const summary = useApiData<PortalSummary>(`/api/caregiver/patients/${id}/summary`);
  return (
    <>
      <Async state={summary.state} onRetry={summary.reload}>
        {(s) => <SummaryView s={s} />}
      </Async>
    </>
  );
};

const CgAppointments: React.FC<{ id: string; canRequest: boolean }> = ({ id, canRequest }) => {
  const A = useA();
  const C = A.care.caregiver;
  const appts = useApiData<any[]>(`/api/caregiver/patients/${id}/appointments`);
  return (
    <>
      <Card title={A.nav.items.patientAppointments}>
        <Async state={appts.state} onRetry={appts.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{C.appointmentsEmpty}</p>}>
          {(rows) => (
            <ul className="na-list">
              {rows.map((a) => (
                <li key={a.id} className="na-list-item">
                  <div className="na-row na-row--between">
                    <strong>
                      {formatDate(A.lang, a.appointment_date)} <span className="na-ltr">{a.start_time}–{a.end_time}</span>
                    </strong>
                    <StatusPill status={a.status} />
                  </div>
                  <span className="na-muted">{[nameOf(A.lang, { name_ar: a.center_name_ar, name_en: a.center_name_en }), nameOf(A.lang, { name_ar: a.clinician_name_ar, name_en: a.clinician_name_en })].join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
      {canRequest && <CgRequest id={id} onSent={appts.reload} />}
    </>
  );
};

const CgRequest: React.FC<{ id: string; onSent: () => void }> = ({ id, onSent }) => {
  const A = useA();
  const C = A.care.caregiver;
  const centers = useApiData<Array<{ id: string; name_ar: string; name_en: string }>>(`/api/caregiver/patients/${id}/centers`);
  const [org, setOrg] = useState('');
  const [doctor, setDoctor] = useState('');
  const [date, setDate] = useState(addDays(todayIso(), 1));
  const [slot, setSlot] = useState('');
  const send = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const orgId = org || (centers.state.status === 'ready' ? centers.state.data[0]?.id : '') || '';
  const clinicians = useApiData<any[]>(orgId ? `/api/caregiver/patients/${id}/clinicians?organizationId=${orgId}` : null);
  const doctorId = doctor || (clinicians.state.status === 'ready' ? clinicians.state.data[0]?.id : '') || '';
  const avail = useApiData<{ slots: Array<{ start_time: string; end_time: string; available: boolean }> }>(
    orgId && doctorId && date ? `/api/caregiver/patients/${id}/availability?organizationId=${orgId}&clinicianId=${doctorId}&date=${date}` : null,
  );
  const slots = useMemo(() => (avail.state.status === 'ready' ? avail.state.data.slots.filter((s) => s.available) : []), [avail.state]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = slots.find((s) => s.start_time === slot);
    if (!chosen) return setMsg({ tone: 'danger', text: C.pickSlot });
    const res = await send.run(`/api/caregiver/patients/${id}/appointments`, 'POST', {
      organization_id: orgId, clinician_id: doctorId, appointment_date: date, start_time: chosen.start_time, end_time: chosen.end_time,
    });
    if (!res.ok) {
      setMsg({ tone: 'danger', text: res.error.status === 409 ? C.conflict : res.error.message });
      avail.reload();
      return;
    }
    setMsg({ tone: 'ok', text: C.requestSent });
    setSlot('');
    onSent();
    avail.reload();
  };

  return (
    <Card title={C.newRequest}>
      <form className="na-form" onSubmit={submit} noValidate>
        <Field label={C.center} htmlFor="cg-center">
          <select id="cg-center" className="na-select" value={orgId} onChange={(e) => { setOrg(e.target.value); setDoctor(''); setSlot(''); }}>
            {centers.state.status === 'ready' && centers.state.data.map((c) => <option key={c.id} value={c.id}>{nameOf(A.lang, c)}</option>)}
          </select>
        </Field>
        <Field label={C.clinician} htmlFor="cg-doc">
          <select id="cg-doc" className="na-select" value={doctorId} onChange={(e) => { setDoctor(e.target.value); setSlot(''); }}>
            {clinicians.state.status === 'ready' && clinicians.state.data.map((c) => <option key={c.id} value={c.id}>{nameOf(A.lang, c)}</option>)}
          </select>
        </Field>
        <Field label={C.date} htmlFor="cg-date">
          <input id="cg-date" type="date" className="na-input" min={addDays(todayIso(), 0)} value={date} onChange={(e) => { setDate(e.target.value); setSlot(''); }} />
        </Field>
        <Field label={C.slot} htmlFor="cg-slot">
          <select id="cg-slot" className="na-select" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">{slots.length ? C.pickSlot : C.noSlots}</option>
            {slots.map((s) => <option key={s.start_time} value={s.start_time}>{s.start_time}–{s.end_time}</option>)}
          </select>
        </Field>
        <div className="na-form-actions">
          <Button type="submit" variant="primary" disabled={send.pending}>{C.send}</Button>
        </div>
      </form>
      {msg && <Notice tone={msg.tone} live>{msg.text}</Notice>}
    </Card>
  );
};

const CgMessages: React.FC<{ id: string }> = ({ id }) => {
  const A = useA();
  const C = A.care.caregiver;
  const sent = useApiData<any[]>(`/api/caregiver/patients/${id}/messages`);
  const centers = useApiData<Array<{ id: string; name_ar: string; name_en: string }>>(`/api/caregiver/patients/${id}/centers`);
  const send = useMutation();
  const [form, setForm] = useState({ organization_id: '', subject: '', body: '', category: 'administrative' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const org = form.organization_id || (centers.state.status === 'ready' ? centers.state.data[0]?.id : '') || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.body.trim() || !org) return setMsg({ tone: 'danger', text: A.patient.messages.required });
    const res = await send.run(`/api/caregiver/patients/${id}/messages`, 'POST', { ...form, organization_id: org });
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.message });
    setMsg({ tone: 'ok', text: C.messageSent });
    setForm({ ...form, subject: '', body: '' });
    sent.reload();
  };

  return (
    <div className="na-grid na-grid--2">
      <Card title={C.messageTitle}>
        <form className="na-form na-form--stack" onSubmit={submit} noValidate>
          <Field label={C.center} htmlFor="cm-center">
            <select id="cm-center" className="na-select" value={org} onChange={(e) => setForm({ ...form, organization_id: e.target.value })}>
              {centers.state.status === 'ready' && centers.state.data.map((c) => <option key={c.id} value={c.id}>{nameOf(A.lang, c)}</option>)}
            </select>
          </Field>
          <Field label={C.subject} htmlFor="cm-subject">
            <input id="cm-subject" className="na-input" maxLength={255} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label={C.body} htmlFor="cm-body">
            <textarea id="cm-body" className="na-textarea" rows={4} maxLength={4000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <div className="na-form-actions">
            <Button type="submit" variant="primary" icon="message" disabled={send.pending}>{C.sendMessage}</Button>
          </div>
        </form>
        {msg && <Notice tone={msg.tone} live>{msg.text}</Notice>}
      </Card>
      <Card title={C.sentMessages}>
        <Async state={sent.state} onRetry={sent.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{C.noSent}</p>}>
          {(rows) => (
            <ul className="na-list">
              {rows.map((m) => (
                <li key={m.id} className="na-list-item">
                  <strong dir="auto">{m.subject}</strong>
                  <span className="na-muted">{formatDate(A.lang, m.created_at, true)}</span>
                  <p dir="auto">{m.body}</p>
                  {m.response ? <p dir="auto"><strong>{C.reply}:</strong> {m.response}</p> : <Pill tone="warn">{C.awaiting}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
    </div>
  );
};
