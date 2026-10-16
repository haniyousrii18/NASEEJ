import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData, useMutation } from '../api.js';
import { addDays, formatDate, nameOf, todayIso } from '../format.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, Stat } from '../ui.js';
import { useA } from '../useA.js';
import { AppointmentList, StatusPill, type AppointmentRow } from './AppointmentList.js';
import { AuditLog } from './AuditLog.js';

interface Member {
  membership_id: string;
  role: string;
  specialty_ar?: string | null;
  specialty_en?: string | null;
  status: string;
  user_id: string;
  email?: string;
  full_name_ar: string;
  full_name_en: string;
}

export const ManagerHome: React.FC = () => {
  const A = useA();
  const H = A.manager.home;
  const { state, reload } = useApiData<any>('/api/center/overview');
  return (
    <>
      <PageHead title={H.title} subtitle={H.subtitle} />
      <Async state={state} onRetry={reload}>
        {(d) => (
          <div className="na-stack">
            <div className="na-grid na-grid--stats">
              <Stat label={H.today} value={d.appointmentsToday.total} />
              <Stat label={H.next7} value={d.appointmentsNext7Days} />
              <Stat label={H.patients} value={d.registeredPatients} />
              <Stat label={H.openCases} value={d.coordination.openCases} />
              <Stat label={H.overdue} value={d.coordination.overdueTasks} tone={d.coordination.overdueTasks > 0 ? 'warn' : undefined} />
            </div>
            <div className="na-grid na-grid--2">
              <Card title={H.byStatus}>
                {Object.keys(d.appointmentsToday.byStatus).length === 0 ? (
                  <p className="na-muted">{H.loadEmpty}</p>
                ) : (
                  <div className="na-row">
                    {Object.entries(d.appointmentsToday.byStatus).map(([s, n]) => (
                      <span key={s} className="na-row">
                        <StatusPill status={s} /> <strong>{String(n)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </Card>
              <Card title={H.staff}>
                <div className="na-row">
                  {Object.entries(d.activeStaffByRole).map(([r, n]) => (
                    <Pill key={r}>
                      {A.manager.staff.roles[r] ?? r}: {String(n)}
                    </Pill>
                  ))}
                </div>
              </Card>
            </div>
            <Card title={H.load}>
              {d.clinicianLoadToday.length === 0 ? (
                <p className="na-muted">{H.loadEmpty}</p>
              ) : (
                <ul className="na-list">
                  {d.clinicianLoadToday.map((c: any) => (
                    <li key={c.clinician_id}>
                      <span>{nameOf(A.lang, c)}</span>
                      <strong>
                        {c.count} {H.appointments}
                      </strong>
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

/* ------------------------------------------------------------------ schedule + resources */
export const ManagerSchedule: React.FC = () => {
  const A = useA();
  const S = A.manager.schedule;
  const { currentOrgId } = useAuth();
  const members = useApiData<Member[]>(currentOrgId ? `/api/organizations/${currentOrgId}/members` : null);
  const doctors = members.state.status === 'ready' ? members.state.data.filter((m) => m.role === 'doctor' && m.status === 'active') : [];
  const schedules = useApiData<any[]>('/api/appointments/schedules');
  const { run, pending } = useMutation();

  const [f, setF] = useState({ clinician_id: '', day_of_week: '0', start_time: '09:00', end_time: '13:00', slot_duration_minutes: '30' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDays(todayIso(), 6));
  const appts = useApiData<AppointmentRow[]>(`/api/appointments?from=${from}&to=${to}`);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run('/api/appointments/schedules', 'POST', {
      clinician_id: f.clinician_id || doctors[0]?.user_id,
      day_of_week: Number(f.day_of_week),
      start_time: f.start_time,
      end_time: f.end_time,
      slot_duration_minutes: Number(f.slot_duration_minutes),
    });
    if (res.ok) {
      setMsg({ tone: 'ok', text: S.added });
      schedules.reload();
    } else setMsg({ tone: 'danger', text: res.error.code === 'SCHEDULE_OVERLAP' ? S.overlap : res.error.message });
  };

  const toggle = async (id: string, is_active: boolean) => {
    const res = await run(`/api/appointments/schedules/${id}`, 'PATCH', { is_active });
    setMsg(res.ok ? { tone: 'ok', text: S.changed } : { tone: 'danger', text: res.error.message });
    schedules.reload();
  };

  return (
    <>
      <PageHead title={S.title} subtitle={S.subtitle} />
      <div className="na-stack">
        <Card title={S.hours}>
          <form className="na-form" onSubmit={add}>
            <Field label={S.doctor} htmlFor="ms-doc">
              <select id="ms-doc" className="na-select" value={f.clinician_id || doctors[0]?.user_id || ''} onChange={(e) => setF({ ...f, clinician_id: e.target.value })}>
                {doctors.map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {nameOf(A.lang, d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={S.day} htmlFor="ms-day">
              <select id="ms-day" className="na-select" value={f.day_of_week} onChange={(e) => setF({ ...f, day_of_week: e.target.value })}>
                {S.days.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={S.from} htmlFor="ms-from">
              <input id="ms-from" type="time" className="na-input" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
            </Field>
            <Field label={S.to} htmlFor="ms-to">
              <input id="ms-to" type="time" className="na-input" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
            </Field>
            <Field label={S.slot} htmlFor="ms-slot">
              <input id="ms-slot" type="number" min={5} max={240} className="na-input" value={f.slot_duration_minutes} onChange={(e) => setF({ ...f, slot_duration_minutes: e.target.value })} />
            </Field>
            <div className="na-form-actions">
              <Button type="submit" variant="primary" disabled={pending || doctors.length === 0}>
                {S.add}
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
          <Async state={schedules.state} onRetry={schedules.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{S.noHours}</p>}>
            {(rows) => (
              <div className="na-table-wrap" style={{ marginTop: 14 }}>
                <table className="na-table">
                  <thead>
                    <tr>
                      <th>{S.doctor}</th>
                      <th>{S.day}</th>
                      <th>{S.from}</th>
                      <th>{S.to}</th>
                      <th>{S.slot}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{nameOf(A.lang, { name_ar: r.clinician_name_ar, name_en: r.clinician_name_en })}</td>
                        <td>{S.days[r.day_of_week]}</td>
                        <td className="na-ltr">{String(r.start_time).slice(0, 5)}</td>
                        <td className="na-ltr">{String(r.end_time).slice(0, 5)}</td>
                        <td>{r.slot_duration_minutes}</td>
                        <td>
                          <Button small variant="danger" disabled={pending} onClick={() => toggle(r.id, false)}>
                            {S.off}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>

        <Card title={S.appointments}>
          <div className="na-form" style={{ marginBottom: 12 }}>
            <Field label={S.dateFrom} htmlFor="ma-from">
              <input id="ma-from" type="date" className="na-input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </Field>
            <Field label={S.dateTo} htmlFor="ma-to">
              <input id="ma-to" type="date" className="na-input" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
          </div>
          <Async state={appts.state} onRetry={appts.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={A.ops.appt.empty} />}>
            {(rows) => <AppointmentList rows={rows} role="center_manager" showDate showDoctor onChanged={appts.reload} />}
          </Async>
        </Card>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ staff */
export const ManagerStaff: React.FC = () => {
  const A = useA();
  const T = A.manager.staff;
  const { currentOrgId, user } = useAuth();
  const { state, reload } = useApiData<Member[]>(currentOrgId ? `/api/organizations/${currentOrgId}/members` : null);
  const { run, pending } = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [issued, setIssued] = useState('');
  const [f, setF] = useState({ email: '', full_name_ar: '', full_name_en: '', phone: '', role: 'doctor', password: '', specialty_ar: '', specialty_en: '', license_number: '' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssued('');
    if (!f.email.trim() || !f.full_name_ar.trim() || !f.full_name_en.trim()) return setMsg({ tone: 'danger', text: T.required });
    const body: Record<string, unknown> = { ...f };
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
    const res = await run(`/api/organizations/${currentOrgId}/members`, 'POST', body);
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.message });
    setMsg({ tone: 'ok', text: T.added });
    if ((res.data as any).temporaryPassword) setIssued((res.data as any).temporaryPassword);
    setF({ ...f, email: '', full_name_ar: '', full_name_en: '', phone: '', password: '', specialty_ar: '', specialty_en: '', license_number: '' });
    reload();
  };

  const change = async (m: Member, status: 'active' | 'inactive') => {
    const res = await run(`/api/organizations/${currentOrgId}/members/${m.membership_id}`, 'PATCH', { status });
    setMsg(res.ok ? { tone: 'ok', text: T.changed } : { tone: 'danger', text: res.error.code === 'FORBIDDEN_SELF_CHANGE' ? T.self : res.error.message });
    reload();
  };

  return (
    <>
      <PageHead title={T.title} subtitle={T.subtitle} />
      <div className="na-stack">
        {msg && (
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        )}
        {issued && (
          <Notice tone="warn" icon="lock" live>
            <strong>{T.tempPassword}:</strong> <code className="na-ltr">{issued}</code>
            <br />
            {T.copyWarn}
          </Notice>
        )}
        <Card>
          <Async state={state} onRetry={reload}>
            {(rows) => (
              <div className="na-table-wrap">
                <table className="na-table">
                  <thead>
                    <tr>
                      <th>{T.name}</th>
                      <th>{T.role}</th>
                      <th>{T.specialty}</th>
                      <th>{T.email}</th>
                      <th>{T.status}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.membership_id}>
                        <td>{nameOf(A.lang, m)}</td>
                        <td>{T.roles[m.role] ?? m.role}</td>
                        <td>{nameOf(A.lang, { name_ar: m.specialty_ar, name_en: m.specialty_en }) || '—'}</td>
                        <td className="na-ltr">{m.email}</td>
                        <td>
                          <Pill tone={m.status === 'active' ? 'ok' : 'neutral'}>{m.status === 'active' ? T.active : T.inactive}</Pill>
                        </td>
                        <td>
                          {m.user_id !== user?.id && (
                            <Button small variant={m.status === 'active' ? 'danger' : undefined} disabled={pending} onClick={() => change(m, m.status === 'active' ? 'inactive' : 'active')}>
                              {m.status === 'active' ? T.deactivate : T.activate}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>
        <Card title={T.add}>
          <form className="na-form" onSubmit={submit} noValidate>
            <Field label={T.nameAr} htmlFor="st-ar">
              <input id="st-ar" className="na-input" dir="rtl" value={f.full_name_ar} onChange={(e) => setF({ ...f, full_name_ar: e.target.value })} />
            </Field>
            <Field label={T.nameEn} htmlFor="st-en">
              <input id="st-en" className="na-input" dir="ltr" value={f.full_name_en} onChange={(e) => setF({ ...f, full_name_en: e.target.value })} />
            </Field>
            <Field label={T.email} htmlFor="st-email">
              <input id="st-email" type="email" className="na-input" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label={T.phone} htmlFor="st-phone">
              <input id="st-phone" type="tel" className="na-input" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label={T.role} htmlFor="st-role">
              <select id="st-role" className="na-select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {['doctor', 'reception', 'care_coordinator'].map((r) => (
                  <option key={r} value={r}>
                    {T.roles[r]}
                  </option>
                ))}
              </select>
            </Field>
            {f.role === 'doctor' && (
              <>
                <Field label={T.specialtyAr} htmlFor="st-sar">
                  <input id="st-sar" className="na-input" dir="rtl" value={f.specialty_ar} onChange={(e) => setF({ ...f, specialty_ar: e.target.value })} />
                </Field>
                <Field label={T.specialtyEn} htmlFor="st-sen">
                  <input id="st-sen" className="na-input" dir="ltr" value={f.specialty_en} onChange={(e) => setF({ ...f, specialty_en: e.target.value })} />
                </Field>
                <Field label={T.license} htmlFor="st-lic">
                  <input id="st-lic" className="na-input" dir="ltr" value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} />
                </Field>
              </>
            )}
            <Field label={T.password} htmlFor="st-pw">
              <input id="st-pw" type="password" className="na-input" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
            <div className="na-form-actions">
              <Button type="submit" variant="primary" disabled={pending}>
                {T.save}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ services (derived from specialties) */
export const ManagerServices: React.FC = () => {
  const A = useA();
  const S = A.manager.services;
  const { state, reload } = useApiData<Array<{ specialty_ar: string | null; specialty_en: string | null; doctors: number }>>('/api/center/specialties');
  return (
    <>
      <PageHead title={S.title} subtitle={S.subtitle} />
      <Card>
        <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={S.none} />}>
          {(rows) => (
            <ul className="na-list">
              {rows.map((r, i) => (
                <li key={i}>
                  <span>{nameOf(A.lang, { name_ar: r.specialty_ar, name_en: r.specialty_en }) || S.unspecified}</span>
                  <strong>
                    {r.doctors} {S.doctors}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
    </>
  );
};

/* ------------------------------------------------------------------ reports */
export const ManagerReports: React.FC = () => {
  const A = useA();
  const R = A.manager.reports;
  const [from, setFrom] = useState(addDays(todayIso(), -29));
  const [to, setTo] = useState(todayIso());
  const { state, reload } = useApiData<any>(`/api/center/reports/appointments?from=${from}&to=${to}`);
  return (
    <>
      <PageHead title={R.title} subtitle={R.subtitle} />
      <div className="na-stack">
        <Card>
          <div className="na-form">
            <Field label={R.from} htmlFor="mr-from">
              <input id="mr-from" type="date" className="na-input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </Field>
            <Field label={R.to} htmlFor="mr-to">
              <input id="mr-to" type="date" className="na-input" value={to} min={from} max={todayIso()} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
          </div>
          <p className="na-help">{R.range}</p>
        </Card>
        <Async state={state} onRetry={reload}>
          {(d) => {
            const total = d.byClinician.reduce((n: number, c: any) => n + c.total, 0);
            const completed = d.byClinician.reduce((n: number, c: any) => n + c.completed, 0);
            const cancelled = d.byClinician.reduce((n: number, c: any) => n + c.cancelled, 0);
            if (d.daily.length === 0) return <EmptyState title={R.none} />;
            return (
              <>
                <div className="na-grid na-grid--stats">
                  <Stat label={R.total} value={total} />
                  <Stat label={R.completed} value={completed} />
                  <Stat label={R.cancelled} value={cancelled} />
                </div>
                <Card title={R.byDoctor}>
                  <div className="na-table-wrap">
                    <table className="na-table">
                      <thead>
                        <tr>
                          <th>{A.manager.schedule.doctor}</th>
                          <th>{R.total}</th>
                          <th>{R.completed}</th>
                          <th>{R.cancelled}</th>
                          <th>{R.booked}</th>
                          <th>{R.capacity}</th>
                          <th>{R.utilization}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.byClinician.map((c: any) => (
                          <tr key={c.clinician_id}>
                            <td>{nameOf(A.lang, c)}</td>
                            <td className="na-num">{c.total}</td>
                            <td className="na-num">{c.completed}</td>
                            <td className="na-num">{c.cancelled}</td>
                            <td className="na-num">{c.bookedMinutes}</td>
                            <td className="na-num">{c.capacityMinutes}</td>
                            <td className="na-num">{c.utilizationPercent === null ? R.noCapacity : `${c.utilizationPercent}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card title={R.daily}>
                  <div className="na-table-wrap">
                    <table className="na-table">
                      <thead>
                        <tr>
                          <th>{R.date}</th>
                          <th>{R.status}</th>
                          <th>{R.count}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.daily.map((r: any, i: number) => (
                          <tr key={i}>
                            <td>{formatDate(A.lang, r.date)}</td>
                            <td>
                              <StatusPill status={r.status} />
                            </td>
                            <td className="na-num">{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            );
          }}
        </Async>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ coordination oversight */
export const ManagerCoordination: React.FC = () => {
  const A = useA();
  const C = A.manager.coordination;
  const [status, setStatus] = useState('open');
  const cases = useApiData<any[]>(`/api/coordination/cases?status=${status}`);
  const overdue = useApiData<any[]>('/api/coordination/tasks?status=active&overdue=1');
  const coordinators = useApiData<Array<{ user_id: string; full_name_ar: string; full_name_en: string }>>('/api/coordination/coordinators');
  const { run, pending } = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const reassign = async (c: any, coordinatorId: string) => {
    if (!coordinatorId || coordinatorId === c.coordinator_id) return;
    const res = await run(`/api/coordination/cases/${c.id}`, 'PATCH', { action: 'reassign', coordinator_id: coordinatorId, version: c.version });
    setMsg(res.ok ? { tone: 'ok', text: C.reassigned } : { tone: 'danger', text: res.error.code === 'STALE_VERSION' ? A.coordinator.tasks.stale : res.error.message });
    cases.reload();
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
        <Card title={C.overdue}>
          <Async state={overdue.state} onRetry={overdue.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{C.noOverdue}</p>}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((t) => (
                  <li key={t.id}>
                    <div className="na-item-main">
                      <span className="na-item-title">{t.title}</span>
                      <span className="na-item-sub">
                        {nameOf(A.lang, { name_ar: t.patient_name_ar, name_en: t.patient_name_en })} · {C.owner}: {nameOf(A.lang, { name_ar: t.owner_name_ar, name_en: t.owner_name_en })} · {C.due}: {formatDate(A.lang, t.due_date)}
                      </span>
                    </div>
                    <Pill tone="danger">{A.coordinator.tasks.overdue}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Card>
        <div className="na-tabs" role="group">
          {(['open', 'closed', 'all'] as const).map((s) => (
            <button key={s} type="button" className="na-tab" aria-current={status === s ? 'page' : undefined} onClick={() => setStatus(s)}>
              {C.status[s]}
            </button>
          ))}
        </div>
        <Card title={C.cases}>
          <Async state={cases.state} onRetry={cases.reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{C.none}</p>}>
            {(rows) => (
              <div className="na-table-wrap">
                <table className="na-table">
                  <thead>
                    <tr>
                      <th>{C.patient}</th>
                      <th>{C.reason}</th>
                      <th>{C.openTasks}</th>
                      <th>{C.coordinator}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>{nameOf(A.lang, { name_ar: c.patient_name_ar, name_en: c.patient_name_en })}</td>
                        <td>{c.reason}</td>
                        <td className="na-num">{c.open_tasks}</td>
                        <td>
                          {c.status === 'open' && coordinators.state.status === 'ready' ? (
                            <select
                              className="na-select"
                              aria-label={`${C.reassign}: ${nameOf(A.lang, { name_ar: c.patient_name_ar, name_en: c.patient_name_en })}`}
                              value={c.coordinator_id}
                              disabled={pending}
                              onChange={(e) => reassign(c, e.target.value)}
                            >
                              {coordinators.state.data.map((u) => (
                                <option key={u.user_id} value={u.user_id}>
                                  {nameOf(A.lang, u)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            nameOf(A.lang, { name_ar: c.coordinator_name_ar, name_en: c.coordinator_name_en })
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
};

export const ManagerActivity: React.FC = () => {
  const A = useA();
  return (
    <>
      <PageHead title={A.manager.activity.title} subtitle={A.manager.activity.subtitle} />
      <AuditLog scope="manager" />
    </>
  );
};

