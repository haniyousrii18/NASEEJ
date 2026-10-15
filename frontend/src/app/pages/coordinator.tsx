import React, { useEffect, useState } from 'react';
import { useApiData, useMutation, useRequest } from '../api.js';
import { fill, formatDate, nameOf, todayIso } from '../format.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, Stat } from '../ui.js';
import { useA } from '../useA.js';

const patientName = (lang: 'ar' | 'en', r: { patient_name_ar: string; patient_name_en: string }) => nameOf(lang, { name_ar: r.patient_name_ar, name_en: r.patient_name_en });
const personName = (lang: 'ar' | 'en', r: any, prefix: string) => nameOf(lang, { name_ar: r[`${prefix}_name_ar`], name_en: r[`${prefix}_name_en`] });

const Scope: React.FC = () => {
  const A = useA();
  return (
    <Notice tone="info" icon="lock">
      {A.coordinator.scope}
    </Notice>
  );
};

/* ------------------------------------------------------------------ dashboard */
export const CoordinatorHome: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const H = A.coordinator.home;
  const { state, reload } = useApiData<any>('/api/coordination/dashboard');
  return (
    <>
      <PageHead title={H.title} subtitle={H.subtitle} />
      <Async state={state} onRetry={reload}>
        {(d) => (
          <div className="na-stack">
            <Scope />
            <div className="na-grid na-grid--stats">
              <Stat label={H.openCases} value={d.openCases} />
              <Stat label={H.activeTasks} value={d.activeTasks} />
              <Stat label={H.overdue} value={d.overdueTasks} tone={d.overdueTasks > 0 ? 'warn' : undefined} />
              <Stat label={H.dueSoon} value={d.dueSoonTasks} />
              <Stat label={H.outgoing} value={d.pendingOutgoingReferrals} />
              <Stat label={H.incoming} value={d.incomingReferralsAwaitingReceipt} />
            </div>
            <Card
              title={H.upcoming}
              actions={
                <Button small variant="quiet" onClick={() => navigate('coordinator/tasks')}>
                  {H.allTasks}
                </Button>
              }
            >
              {d.upcomingTasks.length === 0 ? (
                <p className="na-muted">{H.upcomingEmpty}</p>
              ) : (
                <ul className="na-list">
                  {d.upcomingTasks.map((t: any) => (
                    <li key={t.id}>
                      <div className="na-item-main">
                        <span className="na-item-title">{t.title}</span>
                        <span className="na-item-sub">
                          {patientName(A.lang, t)} · {A.coordinator.tasks.types[t.task_type]}
                          {t.due_date ? ` · ${A.coordinator.tasks.due}: ${formatDate(A.lang, t.due_date)}` : ''}
                        </span>
                      </div>
                      <div className="na-row">
                        {t.is_overdue && <Pill tone="danger">{A.coordinator.tasks.overdue}</Pill>}
                        <Pill>{A.coordinator.tasks.status[t.status]}</Pill>
                        <Button small onClick={() => navigate(`coordinator/case/${t.case_id}`)}>
                          {H.open}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card
              title={H.recent}
              actions={
                <Button small variant="quiet" onClick={() => navigate('coordinator/log')}>
                  {H.allLog}
                </Button>
              }
            >
              {d.recentFollowups.length === 0 ? (
                <p className="na-muted">{H.recentEmpty}</p>
              ) : (
                <ul className="na-list">
                  {d.recentFollowups.map((f: any) => (
                    <li key={f.id}>
                      <div className="na-item-main">
                        <span className="na-item-title">{A.coordinator.log.events[f.event_type] ?? f.event_type}</span>
                        <span className="na-item-sub">
                          {personName(A.lang, f, 'actor')} · {formatDate(A.lang, f.created_at, true)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </Async>
    </>
  );
};

/* ------------------------------------------------------------------ cases */
export const CoordinatorCases: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const C = A.coordinator.cases;
  const [status, setStatus] = useState('open');
  const { state, reload } = useApiData<any[]>(`/api/coordination/cases?status=${status}`);
  const request = useRequest();
  const create = useMutation();

  const [term, setTerm] = useState('');
  const [found, setFound] = useState<Array<{ id: string; full_name_ar: string; full_name_en: string; mrn: string }>>([]);
  const [patient, setPatient] = useState<{ id: string; full_name_ar: string; full_name_en: string; mrn: string } | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (term.trim().length < 2) {
      setFound([]);
      return;
    }
    const id = window.setTimeout(async () => {
      const res = await request<any[]>(`/api/coordination/patients?search=${encodeURIComponent(term.trim())}`);
      if (res.ok) setFound(res.data);
    }, 300);
    return () => window.clearTimeout(id);
  }, [term, request]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return setMsg({ tone: 'danger', text: C.needPatient });
    if (!reason.trim()) return setMsg({ tone: 'danger', text: C.needReason });
    const res = await create.run('/api/coordination/cases', 'POST', { patient_id: patient.id, reason });
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.message });
    setMsg({ tone: 'ok', text: C.opened });
    navigate(`coordinator/case/${res.data.id}`);
  };

  return (
    <>
      <PageHead title={C.title} subtitle={C.subtitle} />
      <div className="na-stack">
        <Scope />
        <Card title={C.new}>
          <form className="na-form" onSubmit={submit} noValidate>
            <Field label={C.patientSearch} htmlFor="cs-patient">
              <input id="cs-patient" type="search" className="na-input" autoComplete="off" value={term} onChange={(e) => { setTerm(e.target.value); setPatient(null); }} />
            </Field>
            <Field label={C.reason} htmlFor="cs-reason" help={C.reasonHint}>
              <input id="cs-reason" className="na-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="na-form-actions">
              <Button type="submit" variant="primary" disabled={create.pending}>
                {C.open}
              </Button>
            </div>
          </form>
          {patient && (
            <p style={{ marginTop: 10 }}>
              <strong>{C.selected}:</strong> {nameOf(A.lang, patient)} · <span className="na-ltr">{patient.mrn}</span>
            </p>
          )}
          {!patient && found.length > 0 && (
            <ul className="na-list" style={{ marginTop: 8 }}>
              {found.map((p) => (
                <li key={p.id}>
                  <span>
                    {nameOf(A.lang, p)} · <span className="na-ltr">{p.mrn}</span>
                  </span>
                  <Button small onClick={() => setPatient(p)}>
                    {C.pick}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {msg && (
            <div style={{ marginTop: 12 }}>
              <Notice tone={msg.tone} live>
                {msg.text}
              </Notice>
            </div>
          )}
        </Card>

        <div className="na-tabs" role="group">
          {(['open', 'closed', 'all'] as const).map((s) => (
            <button key={s} type="button" className="na-tab" aria-current={status === s ? 'page' : undefined} onClick={() => setStatus(s)}>
              {C.status[s]}
            </button>
          ))}
        </div>
        <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={C.none} body={C.noneBody} />}>
          {(rows) => (
            <div className="na-grid na-grid--3">
              {rows.map((c) => (
                <Card key={c.id}>
                  <div className="na-stack">
                    <div className="na-row na-row--between">
                      <strong>{patientName(A.lang, c)}</strong>
                      <Pill tone={c.status === 'open' ? 'ok' : 'neutral'}>{C.status[c.status]}</Pill>
                    </div>
                    <span className="na-muted">
                      {C.mrn}: <span className="na-ltr">{c.mrn}</span>
                    </span>
                    <p>{c.reason}</p>
                    <span className="na-muted">
                      {fill(C.openTasks, { n: c.open_tasks })} ·{' '}
                      {c.next_appointment
                        ? `${C.nextAppointment}: ${formatDate(A.lang, c.next_appointment.date)} ${c.next_appointment.start_time}`
                        : C.noNextAppointment}
                    </span>
                    <div>
                      <Button small onClick={() => navigate(`coordinator/case/${c.id}`)}>
                        {C.open}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Async>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ task row (shared by the case and the task list) */
interface TaskRowData {
  id: string;
  title: string;
  details?: string | null;
  task_type: string;
  status: string;
  due_date: string | null;
  completion_note?: string | null;
  version: number;
  is_overdue: boolean;
  owner_name_ar: string;
  owner_name_en: string;
  case_id?: string;
  patient_name_ar?: string;
  patient_name_en?: string;
}

export const TaskRow: React.FC<{ task: TaskRowData; onChanged: () => void; onOpenCase?: (id: string) => void }> = ({ task, onChanged, onOpenCase }) => {
  const A = useA();
  const T = A.coordinator.tasks;
  const { run, pending } = useMutation();
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const finished = task.status === 'done' || task.status === 'cancelled';

  const patch = async (body: Record<string, unknown>) => {
    const res = await run(`/api/coordination/tasks/${task.id}`, 'PATCH', { ...body, version: task.version });
    if (res.ok) {
      setMsg(null);
      setFinishing(false);
      onChanged();
    } else setMsg({ tone: 'danger', text: res.error.code === 'STALE_VERSION' ? T.stale : res.error.message });
  };

  return (
    <li className="na-list-item">
      <div className="na-row na-row--between">
        <strong>{task.title}</strong>
        <div className="na-row">
          {task.is_overdue && <Pill tone="danger">{T.overdue}</Pill>}
          <Pill tone={task.status === 'done' ? 'ok' : 'neutral'}>{T.status[task.status]}</Pill>
          <Pill>{T.types[task.task_type]}</Pill>
        </div>
      </div>
      {task.patient_name_en && <span className="na-muted">{patientName(A.lang, task as any)}</span>}
      {task.details && <p>{task.details}</p>}
      <span className="na-muted">
        {T.owner}: {personName(A.lang, task, 'owner')}
        {task.due_date ? ` · ${T.due}: ${formatDate(A.lang, task.due_date)}` : ''}
      </span>
      {task.completion_note && <span className="na-muted">{fill(T.note, { note: task.completion_note })}</span>}
      {!finished && !finishing && (
        <div className="na-row">
          {task.status === 'open' && (
            <Button small disabled={pending} onClick={() => patch({ status: 'in_progress' })}>
              {T.start}
            </Button>
          )}
          {task.status === 'in_progress' && (
            <Button small variant="quiet" disabled={pending} onClick={() => patch({ status: 'open' })}>
              {T.reopen}
            </Button>
          )}
          <Button small variant="primary" onClick={() => setFinishing(true)}>
            {T.finish}
          </Button>
          <Button small variant="danger" disabled={pending} onClick={() => patch({ status: 'cancelled' })}>
            {T.cancel}
          </Button>
          {onOpenCase && task.case_id && (
            <Button small variant="quiet" onClick={() => onOpenCase(task.case_id!)}>
              {A.coordinator.home.open}
            </Button>
          )}
        </div>
      )}
      {finishing && (
        <form
          className="na-form na-form--stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return setMsg({ tone: 'danger', text: T.needNote });
            void patch({ status: 'done', completion_note: note });
          }}
        >
          <Field label={T.completionNote} htmlFor={`note-${task.id}`}>
            <textarea id={`note-${task.id}`} className="na-textarea" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="na-row">
            <Button type="submit" variant="primary" disabled={pending}>
              {T.saveDone}
            </Button>
            <Button variant="quiet" onClick={() => setFinishing(false)}>
              {A.common.actions.cancel}
            </Button>
          </div>
        </form>
      )}
      {msg && (
        <Notice tone={msg.tone} live>
          {msg.text}
        </Notice>
      )}
    </li>
  );
};

const AddTask: React.FC<{ caseId: string; onAdded: () => void }> = ({ caseId, onAdded }) => {
  const A = useA();
  const T = A.coordinator.tasks;
  const { run, pending } = useMutation();
  const [f, setF] = useState({ title: '', details: '', task_type: 'other', due_date: '' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return setMsg({ tone: 'danger', text: T.needTitle });
    const res = await run('/api/coordination/tasks', 'POST', { case_id: caseId, title: f.title, details: f.details || undefined, task_type: f.task_type, due_date: f.due_date || undefined });
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.message });
    setMsg({ tone: 'ok', text: T.created });
    setF({ title: '', details: '', task_type: 'other', due_date: '' });
    onAdded();
  };
  return (
    <form className="na-form" onSubmit={submit} noValidate>
      <Field label={T.taskTitle} htmlFor="nt-title">
        <input id="nt-title" className="na-input" maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <Field label={T.type} htmlFor="nt-type">
        <select id="nt-type" className="na-select" value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value })}>
          {Object.entries(T.types).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label={T.due} htmlFor="nt-due">
        <input id="nt-due" type="date" className="na-input" min={todayIso()} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
      </Field>
      <Field label={T.details} htmlFor="nt-details">
        <input id="nt-details" className="na-input" maxLength={1000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
      </Field>
      <div className="na-form-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {A.coordinator.detail.addTask}
        </Button>
      </div>
      {msg && (
        <div style={{ gridColumn: '1 / -1' }}>
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        </div>
      )}
    </form>
  );
};

/* ------------------------------------------------------------------ referral row (shared) */
interface ReferralData {
  id: string;
  status: string;
  reason: string;
  version: number;
  sent_at?: string | null;
  receipt_confirmed_at?: string | null;
  other_name_ar?: string;
  other_name_en?: string;
  to_name_ar?: string;
  to_name_en?: string;
  patient_name_ar?: string;
  patient_name_en?: string;
  consent_effective?: boolean;
}

export const ReferralRow: React.FC<{ referral: ReferralData; direction: 'outgoing' | 'incoming'; onChanged: () => void }> = ({ referral: r, direction, onChanged }) => {
  const A = useA();
  const R = A.coordinator.referrals;
  const { run, pending } = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const other = nameOf(A.lang, { name_ar: r.other_name_ar ?? r.to_name_ar, name_en: r.other_name_en ?? r.to_name_en });

  const act = async (action: 'send' | 'cancel' | 'confirm_receipt') => {
    const res = await run(`/api/coordination/referrals/${r.id}`, 'PATCH', { action, version: r.version });
    if (res.ok) {
      setMsg({ tone: 'ok', text: R.updated });
      onChanged();
    } else setMsg({ tone: 'danger', text: res.error.code === 'CONSENT_REQUIRED' ? R.consentRequired : res.error.message });
  };

  return (
    <li className="na-list-item">
      <div className="na-row na-row--between">
        <strong>
          {direction === 'outgoing' ? R.to : R.from}: {other}
        </strong>
        <Pill tone={r.status === 'receipt_confirmed' ? 'ok' : r.status === 'cancelled' ? 'neutral' : 'info'}>{R.status[r.status]}</Pill>
      </div>
      {r.patient_name_en && (
        <span className="na-muted">
          {R.patient}: {patientName(A.lang, r as any)}
        </span>
      )}
      <p>
        {R.reason}: {r.reason}
      </p>
      <span className="na-muted">
        {r.sent_at ? fill(R.sentAt, { date: formatDate(A.lang, r.sent_at, true) }) : ''}
        {r.receipt_confirmed_at ? ` · ${fill(R.receivedAt, { date: formatDate(A.lang, r.receipt_confirmed_at, true) })}` : ''}
      </span>
      {direction === 'outgoing' && r.consent_effective === false && r.status !== 'cancelled' && r.status !== 'receipt_confirmed' && <Notice tone="warn">{R.consentMissing}</Notice>}
      <div className="na-row">
        {direction === 'outgoing' && r.status === 'requested' && (
          <Button small variant="primary" disabled={pending} onClick={() => act('send')}>
            {R.send}
          </Button>
        )}
        {direction === 'outgoing' && (r.status === 'requested' || r.status === 'sent') && (
          <Button small variant="danger" disabled={pending} onClick={() => act('cancel')}>
            {R.cancel}
          </Button>
        )}
        {direction === 'incoming' && r.status === 'sent' && (
          <Button small variant="primary" disabled={pending} onClick={() => act('confirm_receipt')}>
            {R.confirm}
          </Button>
        )}
      </div>
      {msg && (
        <Notice tone={msg.tone} live>
          {msg.text}
        </Notice>
      )}
    </li>
  );
};

/* ------------------------------------------------------------------ case detail */
export const CaseDetail: React.FC<{ caseId: string; navigate: (r: string) => void }> = ({ caseId, navigate }) => {
  const A = useA();
  const D = A.coordinator.detail;
  const C = A.coordinator.cases;
  const { state, reload } = useApiData<any>(`/api/coordination/cases/${caseId}`);
  const destinations = useApiData<Array<{ id: string; name_ar: string; name_en: string }>>('/api/coordination/destinations');
  const close = useMutation();
  const create = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [ref, setRef] = useState({ to: '', reason: '' });

  const doClose = async (c: any) => {
    if (!window.confirm(D.closeConfirm)) return;
    const res = await close.run(`/api/coordination/cases/${c.id}`, 'PATCH', { action: 'close', version: c.version });
    setMsg(res.ok ? { tone: 'ok', text: D.closed } : { tone: 'danger', text: res.error.code === 'OPEN_TASKS_REMAIN' ? D.openTasksRemain : res.error.message });
    reload();
  };

  const createReferral = async (e: React.FormEvent, c: any) => {
    e.preventDefault();
    const to = ref.to || (destinations.state.status === 'ready' ? destinations.state.data[0]?.id : '');
    if (!to || !ref.reason.trim()) return setMsg({ tone: 'danger', text: A.coordinator.cases.needReason });
    const res = await create.run('/api/coordination/referrals', 'POST', { case_id: c.id, to_organization_id: to, reason: ref.reason });
    setMsg(res.ok ? { tone: 'ok', text: D.referralCreated } : { tone: 'danger', text: res.error.message });
    if (res.ok) {
      setRef({ to: ref.to, reason: '' });
      reload();
    }
  };

  return (
    <>
      <Async state={state} onRetry={reload}>
        {(c) => (
          <>
            <PageHead
              title={patientName(A.lang, c)}
              subtitle={`${C.mrn}: ${c.mrn} · ${c.reason}`}
              back={{ label: D.back, onClick: () => navigate('coordinator/cases') }}
              actions={
                c.status === 'open' ? (
                  <Button variant="quiet" disabled={close.pending} onClick={() => doClose(c)}>
                    {D.close}
                  </Button>
                ) : (
                  <Pill>{C.status.closed}</Pill>
                )
              }
            />
            <div className="na-stack">
              <Scope />
              {msg && (
                <Notice tone={msg.tone} live>
                  {msg.text}
                </Notice>
              )}
              <div className="na-grid na-grid--stats">
                <Stat label={C.coordinator} value={personName(A.lang, c, 'coordinator')} />
                <Stat label={C.nextAppointment} value={c.next_appointment ? `${formatDate(A.lang, c.next_appointment.date)} ${c.next_appointment.start_time}` : C.noNextAppointment} />
                <Stat label={A.coordinator.home.activeTasks} value={c.open_tasks} />
              </div>

              <Card title={D.tasks}>
                {c.status === 'open' && <AddTask caseId={c.id} onAdded={reload} />}
                {c.tasks.length === 0 ? (
                  <p className="na-muted">{D.noTasks}</p>
                ) : (
                  <ul className="na-list">
                    {c.tasks.map((t: any) => (
                      <TaskRow key={`${t.id}:${t.version}`} task={t} onChanged={reload} />
                    ))}
                  </ul>
                )}
              </Card>

              <Card title={D.referrals}>
                {c.status === 'open' && destinations.state.status === 'ready' && destinations.state.data.length > 0 && (
                  <form className="na-form" onSubmit={(e) => createReferral(e, c)} noValidate>
                    <Field label={D.destination} htmlFor="rf-to">
                      <select id="rf-to" className="na-select" value={ref.to || destinations.state.data[0].id} onChange={(e) => setRef({ ...ref, to: e.target.value })}>
                        {destinations.state.data.map((o) => (
                          <option key={o.id} value={o.id}>
                            {nameOf(A.lang, o)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={D.referralReason} htmlFor="rf-reason">
                      <input id="rf-reason" className="na-input" maxLength={500} value={ref.reason} onChange={(e) => setRef({ ...ref, reason: e.target.value })} />
                    </Field>
                    <div className="na-form-actions">
                      <Button type="submit" variant="primary" disabled={create.pending}>
                        {D.createReferral}
                      </Button>
                    </div>
                  </form>
                )}
                {c.referrals.length === 0 ? (
                  <p className="na-muted">{D.noReferrals}</p>
                ) : (
                  <ul className="na-list">
                    {c.referrals.map((r: any) => (
                      <ReferralRow key={`${r.id}:${r.version}`} referral={r} direction="outgoing" onChanged={reload} />
                    ))}
                  </ul>
                )}
              </Card>

              <Card title={D.log}>
                {c.followups.length === 0 ? (
                  <p className="na-muted">{D.noLog}</p>
                ) : (
                  <ul className="na-list">
                    {c.followups.map((f: any) => (
                      <li key={f.id}>
                        <div className="na-item-main">
                          <span className="na-item-title">{A.coordinator.log.events[f.event_type] ?? f.event_type}</span>
                          <span className="na-item-sub">
                            {personName(A.lang, f, 'actor')} · {formatDate(A.lang, f.created_at, true)}
                            {f.note ? ` · ${f.note}` : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </Async>
    </>
  );
};

/* ------------------------------------------------------------------ tasks */
export const CoordinatorTasks: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const T = A.coordinator.tasks;
  const [status, setStatus] = useState('active');
  const [overdue, setOverdue] = useState(false);
  const { state, reload } = useApiData<TaskRowData[]>(`/api/coordination/tasks?status=${status}${overdue ? '&overdue=1' : ''}`);
  return (
    <>
      <PageHead title={T.title} subtitle={T.subtitle} />
      <div className="na-stack">
        <Scope />
        <div className="na-row">
          <div className="na-tabs" role="group" style={{ marginBottom: 0 }}>
            {(['active', 'done', 'cancelled', 'all'] as const).map((s) => (
              <button key={s} type="button" className="na-tab" aria-current={status === s ? 'page' : undefined} onClick={() => setStatus(s)}>
                {T.filter[s]}
              </button>
            ))}
          </div>
          <label className="na-row">
            <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
            {T.overdueOnly}
          </label>
        </div>
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={T.none} body={T.noneBody} />}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((t) => (
                  <TaskRow key={`${t.id}:${t.version}`} task={t} onChanged={reload} onOpenCase={(id) => navigate(`coordinator/case/${id}`)} />
                ))}
              </ul>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ referrals */
export const CoordinatorReferrals: React.FC = () => {
  const A = useA();
  const R = A.coordinator.referrals;
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing');
  const { state, reload } = useApiData<ReferralData[]>(`/api/coordination/referrals?direction=${direction}`);
  return (
    <>
      <PageHead title={R.title} subtitle={R.subtitle} />
      <div className="na-stack">
        <Scope />
        <div className="na-tabs" role="group">
          {(['outgoing', 'incoming'] as const).map((d) => (
            <button key={d} type="button" className="na-tab" aria-current={direction === d ? 'page' : undefined} onClick={() => setDirection(d)}>
              {R[d]}
            </button>
          ))}
        </div>
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={R.none} body={R.noneBody} />}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((r) => (
                  <ReferralRow key={`${r.id}:${r.version}`} referral={r} direction={direction} onChanged={reload} />
                ))}
              </ul>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ follow-up log (read-only) */
export const FollowupLog: React.FC = () => {
  const A = useA();
  const L = A.coordinator.log;
  const request = useRequest();
  const [rows, setRows] = useState<any[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);

  const load = React.useCallback(
    async (before?: string) => {
      if (before) setMore(true);
      const res = await request<any[]>(`/api/coordination/followup-log?limit=25${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      setMore(false);
      if (!res.ok) return setStatus('error');
      setRows((prev) => (before ? [...prev, ...res.data] : res.data));
      setNext(res.meta?.hasMore ? res.meta.nextBefore : null);
      setStatus('ready');
    },
    [request],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHead title={L.title} subtitle={L.subtitle} />
      <Card>
        {status === 'loading' && <p className="na-muted">{A.common.states.loading}</p>}
        {status === 'error' && <Notice tone="danger" live>{A.common.states.errorBody}</Notice>}
        {status === 'ready' && rows.length === 0 && <p className="na-muted">{L.none}</p>}
        {rows.length > 0 && (
          <div className="na-table-wrap">
            <table className="na-table">
              <thead>
                <tr>
                  <th>{L.when}</th>
                  <th>{L.event}</th>
                  <th>{L.patient}</th>
                  <th>{L.actor}</th>
                  <th>{L.note}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td>{formatDate(A.lang, f.created_at, true)}</td>
                    <td>{L.events[f.event_type] ?? f.event_type}</td>
                    <td>{patientName(A.lang, f)}</td>
                    <td>{personName(A.lang, f, 'actor')}</td>
                    <td>{f.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next && (
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => void load(next)} disabled={more}>
              {A.common.actions.loadMore}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
};
