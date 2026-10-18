import React, { useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { addDays, fill, formatDate, nameOf, todayIso } from '../format.js';
import { useDoctors } from '../reception/useDoctors.js';
import { usePolledApi } from '../reception/usePolledApi.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';

type Box = 'inbox' | 'sent' | 'all';
type Status = 'new' | 'read' | 'in_progress' | 'resolved';
const STATUS_TONE: Record<Status, Tone> = { new: 'warn', read: 'neutral', in_progress: 'info', resolved: 'ok' };
const STATUSES: Status[] = ['new', 'read', 'in_progress', 'resolved'];
const CATEGORIES = ['scheduling', 'arrival', 'paperwork', 'logistics', 'other'] as const;

interface MessageRow {
  id: string;
  subject: string;
  body: string;
  category: (typeof CATEGORIES)[number];
  status: Status;
  direction: 'sent' | 'received';
  created_at: string;
  from_role: string;
  from_name_ar: string;
  from_name_en: string;
  to_name_ar?: string | null;
  to_name_en?: string | null;
  patient_name_ar?: string | null;
  patient_name_en?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  reply_count: number;
  replies?: Array<{ id: string; author_role: string; body: string; created_at: string; author_name_ar: string; author_name_en: string }>;
}

const StatusPill: React.FC<{ status: Status }> = ({ status }) => {
  const A = useA();
  return <Pill tone={STATUS_TONE[status]}>{A.care.ops.statuses[status]}</Pill>;
};

const Detail: React.FC<{ id: string; onChanged: () => void }> = ({ id, onChanged }) => {
  const A = useA();
  const O = A.care.ops;
  const detail = useApiData<MessageRow>(`/api/ops-messages/${id}`);
  const act = useMutation();
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const setStatus = async (status: string) => {
    const res = await act.run(`/api/ops-messages/${id}/status`, 'PATCH', { status });
    setError(res.ok ? '' : res.error.message);
    detail.reload();
    onChanged();
  };
  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    const res = await act.run(`/api/ops-messages/${id}/replies`, 'POST', { body: reply.trim() });
    if (!res.ok) return setError(res.error.message);
    setError('');
    setReply('');
    detail.reload();
    onChanged();
  };

  return (
    <Async state={detail.state} onRetry={detail.reload}>
      {(m) => (
        <div className="na-stack">
          <div className="na-row na-row--between">
            <h3 className="na-card-title" dir="auto">
              {m.subject}
            </h3>
            <StatusPill status={m.status} />
          </div>
          <p className="na-muted">
            {[
              `${O.from}: ${nameOf(A.lang, { name_ar: m.from_name_ar, name_en: m.from_name_en })}`,
              O.categories[m.category],
              formatDate(A.lang, m.created_at, true),
              m.patient_name_ar || m.patient_name_en ? `${O.patient}: ${nameOf(A.lang, { name_ar: m.patient_name_ar, name_en: m.patient_name_en })}` : '',
              m.appointment_date ? `${formatDate(A.lang, m.appointment_date)} ${m.appointment_time ?? ''}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="ops-body" dir="auto">
            {m.body}
          </p>
          {m.replies && m.replies.length > 0 && (
            <div>
              <h4 className="ai-group">{O.replies}</h4>
              <ul className="na-list">
                {m.replies.map((r) => (
                  <li key={r.id} className="na-list-item">
                    <span className="na-muted">
                      {nameOf(A.lang, { name_ar: r.author_name_ar, name_en: r.author_name_en })} · {formatDate(A.lang, r.created_at, true)}
                    </span>
                    <span dir="auto">{r.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.status !== 'resolved' && (
            <form className="na-form na-form--stack" onSubmit={sendReply}>
              <Field label={O.reply} htmlFor="ops-reply">
                <textarea id="ops-reply" className="na-textarea" rows={2} maxLength={1000} placeholder={O.replyPlaceholder} value={reply} onChange={(e) => setReply(e.target.value)} />
              </Field>
              <div className="na-form-actions">
                <Button type="submit" variant="primary" small disabled={act.pending || !reply.trim()}>
                  {O.reply}
                </Button>
                {m.direction === 'received' && m.status !== 'in_progress' && (
                  <Button small disabled={act.pending} onClick={() => setStatus('in_progress')}>
                    {O.markProgress}
                  </Button>
                )}
                <Button small disabled={act.pending} onClick={() => setStatus('resolved')}>
                  {O.resolve}
                </Button>
              </div>
            </form>
          )}
          {error && (
            <Notice tone="danger" live>
              {error}
            </Notice>
          )}
        </div>
      )}
    </Async>
  );
};

const Compose: React.FC<{ role: 'reception' | 'doctor'; onSent: (id: string) => void; onCancel: () => void }> = ({ role, onSent, onCancel }) => {
  const A = useA();
  const O = A.care.ops;
  const { doctors } = useDoctors();
  const today = todayIso();
  const appts = useApiData<any[]>(`/api/appointments?from=${today}&to=${addDays(today, 14)}&limit=100`);
  const send = useMutation();
  const [form, setForm] = useState({ subject: '', body: '', category: 'scheduling', to_user_id: '', appointment_id: '' });
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.body.trim()) return setError(O.required);
    const res = await send.run<{ id: string }>('/api/ops-messages', 'POST', {
      subject: form.subject.trim(),
      body: form.body.trim(),
      category: form.category,
      ...(form.to_user_id ? { to_user_id: form.to_user_id } : {}),
      ...(form.appointment_id ? { appointment_id: form.appointment_id } : {}),
    });
    if (!res.ok) return setError(res.error.message);
    onSent(res.data.id);
  };

  return (
    <form className="na-form na-form--stack" onSubmit={submit} noValidate>
      <div className="na-grid na-grid--2">
        <Field label={O.category} htmlFor="ops-cat">
          <select id="ops-cat" className="na-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {O.categories[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={O.to} htmlFor="ops-to">
          {role === 'reception' ? (
            <select id="ops-to" className="na-select" value={form.to_user_id} onChange={(e) => setForm({ ...form, to_user_id: e.target.value })}>
              <option value="">{O.toAny}</option>
              {doctors.map((d) => (
                <option key={d.user_id} value={d.user_id}>
                  {nameOf(A.lang, d)}
                </option>
              ))}
            </select>
          ) : (
            <select id="ops-to" className="na-select" disabled>
              <option>{O.toReception}</option>
            </select>
          )}
        </Field>
      </div>
      <Field label={O.appointment} htmlFor="ops-appt">
        <select id="ops-appt" className="na-select" value={form.appointment_id} onChange={(e) => setForm({ ...form, appointment_id: e.target.value })}>
          <option value="">{O.noAppointment}</option>
          {appts.state.status === 'ready' &&
            appts.state.data.map((a) => (
              <option key={a.id} value={a.id}>
                {[formatDate(A.lang, a.appointment_date), String(a.start_time).slice(0, 5), nameOf(A.lang, { name_ar: a.patient_name_ar, name_en: a.patient_name_en })].join(' · ')}
              </option>
            ))}
        </select>
      </Field>
      <Field label={O.subject} htmlFor="ops-subject">
        <input id="ops-subject" className="na-input" maxLength={160} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      </Field>
      <Field label={O.body} htmlFor="ops-body">
        <textarea id="ops-body" className="na-textarea" rows={4} maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Field>
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
      <div className="na-form-actions">
        <Button type="submit" variant="primary" icon="message" disabled={send.pending}>
          {O.send}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {A.common.actions.cancel}
        </Button>
      </div>
    </form>
  );
};

/** Operational messages between the front desk and clinicians of one center. Server-side persisted; no clinical content. */
export const OpsMessages: React.FC<{ role: 'reception' | 'doctor' }> = ({ role }) => {
  const A = useA();
  const O = A.care.ops;
  const [box, setBox] = useState<Box>('inbox');
  const [status, setStatus] = useState<'' | Status>('');
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [flash, setFlash] = useState('');
  const path = `/api/ops-messages?box=${box}${status ? `&status=${status}` : ''}`;
  const list = usePolledApi<MessageRow[]>(path, 20_000);

  return (
    <>
      <PageHead
        title={O.title}
        subtitle={role === 'reception' ? O.subtitleReception : O.subtitleDoctor}
        actions={
          <Button variant="primary" icon="plus" onClick={() => { setComposing(true); setSelected(null); setFlash(''); }}>
            {O.compose}
          </Button>
        }
      />
      <div className="na-stack">
        {flash && (
          <Notice tone="ok" live>
            {flash}
          </Notice>
        )}
        {list.stale && (
          <Notice tone="warn" live>
            {O.stale}
          </Notice>
        )}
        <div className="ops-layout">
          <Card>
            <div className="rec-filters" role="group" aria-label={O.title}>
              {(['inbox', 'sent', 'all'] as Box[]).map((b) => (
                <button key={b} type="button" className="rec-chip" aria-pressed={box === b} onClick={() => setBox(b)}>
                  {O[b]}
                </button>
              ))}
            </div>
            <div className="rec-filters" role="group" aria-label={A.care.library.review}>
              <button type="button" className="rec-chip" aria-pressed={status === ''} onClick={() => setStatus('')}>
                {A.common.actions.all}
              </button>
              {STATUSES.map((s) => (
                <button key={s} type="button" className="rec-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {O.statuses[s]}
                </button>
              ))}
            </div>
            <Async state={list.state} onRetry={list.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={O.emptyTitle} body={O.emptyBody} />}>
              {(rows) => (
                <>
                  <p className="na-muted">{fill(O.newCount, { n: rows.filter((r) => r.status === 'new' && r.direction === 'received').length })}</p>
                  <ul className="ops-list">
                    {rows.map((m) => (
                      <li key={m.id}>
                        <button type="button" className="ops-item" aria-current={selected === m.id ? 'true' : undefined} data-unread={m.status === 'new' && m.direction === 'received'} onClick={() => { setSelected(m.id); setComposing(false); }}>
                          <span className="ops-item-top">
                            <strong dir="auto">{m.subject}</strong>
                            <StatusPill status={m.status} />
                          </span>
                          <span className="na-muted">
                            {[
                              m.direction === 'sent' ? (m.to_name_ar || m.to_name_en ? nameOf(A.lang, { name_ar: m.to_name_ar, name_en: m.to_name_en }) : O.toAny) : nameOf(A.lang, { name_ar: m.from_name_ar, name_en: m.from_name_en }),
                              O.categories[m.category],
                              formatDate(A.lang, m.created_at, true),
                            ].join(' · ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Async>
          </Card>
          <Card>
            {composing ? (
              <Compose
                role={role}
                onCancel={() => setComposing(false)}
                onSent={(id) => {
                  setComposing(false);
                  setSelected(id);
                  setFlash(O.sentOk);
                  list.reload();
                }}
              />
            ) : selected ? (
              <Detail key={selected} id={selected} onChanged={list.reload} />
            ) : (
              <EmptyState title={O.select} />
            )}
          </Card>
        </div>
      </div>
    </>
  );
};

interface PatientQuestion {
  id: string;
  subject: string;
  body: string;
  category: string;
  status: 'submitted' | 'under_review' | 'resolved';
  response: string | null;
  created_at: string;
  patient_name_ar: string;
  patient_name_en: string;
  caregiver_name_ar: string | null;
  caregiver_name_en: string | null;
}

const QuestionCard: React.FC<{ q: PatientQuestion; onSaved: () => void }> = ({ q, onSaved }) => {
  const A = useA();
  const P = A.care.patientQuestions;
  const act = useMutation();
  const [response, setResponse] = useState(q.response ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const tone: Tone = q.status === 'submitted' ? 'warn' : q.status === 'under_review' ? 'info' : 'ok';

  const save = async (status: 'under_review' | 'resolved') => {
    if (status === 'resolved' && !response.trim()) return setMsg({ tone: 'danger', text: P.needResponse });
    const res = await act.run(`/api/doctor/patient-messages/${q.id}/respond`, 'POST', { status, response: response.trim() || undefined });
    setMsg(res.ok ? { tone: 'ok', text: P.saved } : { tone: 'danger', text: res.error.message });
    if (res.ok) onSaved();
  };

  return (
    <li className="na-list-item">
      <div className="na-row na-row--between">
        <strong dir="auto">{q.subject}</strong>
        <Pill tone={tone}>{P[q.status]}</Pill>
      </div>
      <span className="na-muted">
        {[nameOf(A.lang, { name_ar: q.patient_name_ar, name_en: q.patient_name_en }), formatDate(A.lang, q.created_at, true)].join(' · ')}
        {q.caregiver_name_ar || q.caregiver_name_en ? ` · ${fill(P.fromCaregiver, { name: nameOf(A.lang, { name_ar: q.caregiver_name_ar, name_en: q.caregiver_name_en }) })}` : ''}
      </span>
      <p className="ops-body" dir="auto">
        {q.body}
      </p>
      {q.status !== 'resolved' ? (
        <div className="na-form na-form--stack">
          <Field label={P.response} htmlFor={`q-${q.id}`}>
            <textarea id={`q-${q.id}`} className="na-textarea" rows={3} maxLength={4000} value={response} onChange={(e) => setResponse(e.target.value)} />
          </Field>
          <div className="na-form-actions">
            <Button small variant="primary" disabled={act.pending} onClick={() => save('resolved')}>
              {P.respond}
            </Button>
            {q.status === 'submitted' && (
              <Button small disabled={act.pending} onClick={() => save('under_review')}>
                {P.markReview}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p dir="auto">
          <strong>{P.response}:</strong> {q.response}
        </p>
      )}
      {msg && (
        <Notice tone={msg.tone} live>
          {msg.text}
        </Notice>
      )}
    </li>
  );
};

/** The doctor's inbox of patient (and caregiver) questions, plus the reception messages tab. */
export const DoctorMessages: React.FC = () => {
  const A = useA();
  const P = A.care.patientQuestions;
  const [tab, setTab] = useState<'ops' | 'patients'>('patients');
  const questions = useApiData<PatientQuestion[]>(tab === 'patients' ? '/api/doctor/patient-messages' : null);

  return (
    <>
      <nav className="na-tabs" aria-label={A.care.ops.title}>
        <button type="button" className="na-tab" aria-current={tab === 'patients' ? 'page' : undefined} onClick={() => setTab('patients')}>
          {P.title}
        </button>
        <button type="button" className="na-tab" aria-current={tab === 'ops' ? 'page' : undefined} onClick={() => setTab('ops')}>
          {A.care.ops.title}
        </button>
      </nav>
      {tab === 'ops' ? (
        <OpsMessages role="doctor" />
      ) : (
        <>
          <PageHead title={P.title} subtitle={P.subtitle} />
          <div className="na-stack">
            <Notice tone="danger" icon="alert">
              {P.emergency}
            </Notice>
            <Async state={questions.state} onRetry={questions.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={P.empty} />}>
              {(rows) => (
                <ul className="na-list ops-questions">
                  {rows.map((q) => (
                    <QuestionCard key={q.id} q={q} onSaved={questions.reload} />
                  ))}
                </ul>
              )}
            </Async>
          </div>
        </>
      )}
    </>
  );
};
