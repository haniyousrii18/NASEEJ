import React, { useCallback, useEffect, useState } from 'react';
import { useApiData, useMutation, useRequest } from '../api.js';
import { fill, formatDate, nameOf } from '../format.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, Stat } from '../ui.js';
import { useA } from '../useA.js';
import { AuditLog } from './AuditLog.js';

const Scope: React.FC = () => {
  const A = useA();
  return (
    <Notice tone="info" icon="lock">
      {A.admin.scope}
    </Notice>
  );
};

export const AdminHome: React.FC = () => {
  const A = useA();
  const H = A.admin.home;
  const { state, reload } = useApiData<any>('/api/admin/overview');
  return (
    <>
      <PageHead title={H.title} subtitle={H.subtitle} />
      <Async state={state} onRetry={reload}>
        {(d) => {
          const s = d.service.uptimeSeconds as number;
          return (
            <div className="na-stack">
              <Scope />
              <div className="na-grid na-grid--stats">
                <Stat label={H.service} value={d.service.status === 'healthy' ? H.healthy : d.service.status} tone="ok" />
                <Stat label={H.database} value={fill(H.latency, { n: d.service.database.latencyMs })} tone={d.service.database.status === 'up' ? 'ok' : 'warn'} />
                <Stat label={H.uptime} value={fill(H.hours, { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) })} />
                <Stat label={H.centersActive} value={d.centers.active} />
                <Stat label={H.centersSuspended} value={d.centers.suspended} tone={d.centers.suspended > 0 ? 'warn' : undefined} />
                <Stat label={H.accountsActive} value={d.accounts.active} />
                <Stat label={H.accountsOff} value={d.accounts.deactivated} />
                <Stat label={H.audit24} value={d.auditEventsLast24h} />
                <Stat label={H.demos} value={d.newDemoRequests} tone={d.newDemoRequests > 0 ? 'warn' : undefined} />
              </div>
              <Card title={H.roles}>
                <div className="na-row">
                  {Object.entries(d.activeMembershipsByRole).map(([r, n]) => (
                    <Pill key={r}>
                      {(A.common.roles as Record<string, string>)[r] ?? r}: {String(n)}
                    </Pill>
                  ))}
                </div>
              </Card>
            </div>
          );
        }}
      </Async>
    </>
  );
};

/* ------------------------------------------------------------------ centers */
export const AdminCenters: React.FC = () => {
  const A = useA();
  const C = A.admin.centers;
  const { state, reload } = useApiData<any[]>('/api/organizations');
  const { run, pending } = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [f, setF] = useState({ name_ar: '', name_en: '', code: '', type: 'clinic', contact_phone: '', contact_email: '' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name_ar.trim() || !f.name_en.trim() || !f.code.trim()) return setMsg({ tone: 'danger', text: C.required });
    const body: Record<string, unknown> = { ...f };
    for (const k of ['contact_phone', 'contact_email']) if (!body[k]) delete body[k];
    const res = await run('/api/organizations', 'POST', body);
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.code === 'CONFLICT_CODE' ? C.codeTaken : res.error.message });
    setMsg({ tone: 'ok', text: C.added });
    setF({ name_ar: '', name_en: '', code: '', type: 'clinic', contact_phone: '', contact_email: '' });
    reload();
  };

  const setStatus = async (o: any, status: 'active' | 'suspended') => {
    if (status === 'suspended' && !window.confirm(C.confirmSuspend)) return;
    const res = await run(`/api/organizations/${o.id}`, 'PATCH', { status });
    setMsg(res.ok ? { tone: 'ok', text: C.changed } : { tone: 'danger', text: res.error.message });
    reload();
  };

  return (
    <>
      <PageHead title={C.title} subtitle={C.subtitle} />
      <div className="na-stack">
        <Scope />
        {msg && (
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        )}
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={C.none} />}>
            {(rows) => (
              <div className="na-table-wrap">
                <table className="na-table">
                  <thead>
                    <tr>
                      <th>{A.admin.accounts.name}</th>
                      <th>{C.code}</th>
                      <th>{C.type}</th>
                      <th>{A.admin.accounts.status}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id}>
                        <td>{nameOf(A.lang, o)}</td>
                        <td className="na-ltr">{o.code}</td>
                        <td>{C.types[o.type] ?? o.type}</td>
                        <td>
                          <Pill tone={o.status === 'active' ? 'ok' : 'warn'}>{C.status[o.status] ?? o.status}</Pill>
                        </td>
                        <td>
                          {o.status === 'active' ? (
                            <Button small variant="danger" disabled={pending} onClick={() => setStatus(o, 'suspended')}>
                              {C.suspend}
                            </Button>
                          ) : (
                            <Button small disabled={pending} onClick={() => setStatus(o, 'active')}>
                              {C.activate}
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
        <Card title={C.add}>
          <form className="na-form" onSubmit={submit} noValidate>
            <Field label={C.nameAr} htmlFor="ce-ar">
              <input id="ce-ar" className="na-input" dir="rtl" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
            </Field>
            <Field label={C.nameEn} htmlFor="ce-en">
              <input id="ce-en" className="na-input" dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
            </Field>
            <Field label={C.code} htmlFor="ce-code">
              <input id="ce-code" className="na-input" dir="ltr" maxLength={20} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </Field>
            <Field label={C.type} htmlFor="ce-type">
              <select id="ce-type" className="na-select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {Object.entries(C.types).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={C.phone} htmlFor="ce-phone">
              <input id="ce-phone" type="tel" className="na-input" dir="ltr" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} />
            </Field>
            <Field label={C.email} htmlFor="ce-email">
              <input id="ce-email" type="email" className="na-input" dir="ltr" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} />
            </Field>
            <div className="na-form-actions">
              <Button type="submit" variant="primary" disabled={pending}>
                {C.save}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ accounts */
export const AdminAccounts: React.FC = () => {
  const A = useA();
  const T = A.admin.accounts;
  const request = useRequest();
  const centers = useApiData<any[]>('/api/organizations');
  const { run, pending } = useMutation();

  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [issued, setIssued] = useState('');
  const [f, setF] = useState({ organization_id: '', email: '', full_name_ar: '', full_name_en: '', role: 'doctor', password: '' });

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(id);
  }, [text]);

  const load = useCallback(
    async (offset = 0) => {
      const res = await request<any[]>(`/api/admin/users?limit=25&offset=${offset}&search=${encodeURIComponent(term)}`, { orgId: null });
      if (!res.ok) return setStatus('error');
      setRows((prev) => (offset ? [...prev, ...res.data] : res.data));
      setHasMore(!!res.meta?.hasMore);
      setStatus('ready');
    },
    [request, term],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (u: any) => {
    const res = await run(`/api/admin/users/${u.id}`, 'PATCH', { is_active: !u.is_active });
    setMsg(res.ok ? { tone: 'ok', text: T.changed } : { tone: 'danger', text: res.error.message });
    void load();
  };

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssued('');
    const org = f.organization_id || (centers.state.status === 'ready' ? centers.state.data[0]?.id : '');
    if (!org || !f.email.trim() || !f.full_name_ar.trim() || !f.full_name_en.trim()) return setMsg({ tone: 'danger', text: T.required });
    const body: Record<string, unknown> = { email: f.email, full_name_ar: f.full_name_ar, full_name_en: f.full_name_en, role: f.role };
    if (f.password) body.password = f.password;
    const res = await run(`/api/organizations/${org}/members`, 'POST', body);
    if (!res.ok) return setMsg({ tone: 'danger', text: res.error.message });
    setMsg({ tone: 'ok', text: T.assigned });
    if ((res.data as any).temporaryPassword) setIssued((res.data as any).temporaryPassword);
    setF({ ...f, email: '', full_name_ar: '', full_name_en: '', password: '' });
    void load();
  };

  return (
    <>
      <PageHead title={T.title} subtitle={T.subtitle} />
      <div className="na-stack">
        <Scope />
        {msg && (
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        )}
        {issued && (
          <Notice tone="warn" icon="lock" live>
            <strong>{T.tempPassword}:</strong> <code className="na-ltr">{issued}</code>
          </Notice>
        )}
        <Card>
          <Field label={T.search} htmlFor="ac-search">
            <input id="ac-search" type="search" className="na-input" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </Card>
        <Card>
          {status === 'loading' && <p className="na-muted">{A.common.states.loading}</p>}
          {status === 'error' && <Notice tone="danger" live>{A.common.states.errorBody}</Notice>}
          {status === 'ready' && rows.length === 0 && <p className="na-muted">{T.none}</p>}
          {rows.length > 0 && (
            <div className="na-table-wrap">
              <table className="na-table">
                <thead>
                  <tr>
                    <th>{T.name}</th>
                    <th>{T.email}</th>
                    <th>{T.memberships}</th>
                    <th>{T.status}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td>{nameOf(A.lang, u)}</td>
                      <td className="na-ltr">{u.email}</td>
                      <td>
                        <div className="na-row">
                          {u.system_role === 'platform_admin' && <Pill tone="info">{T.admin}</Pill>}
                          {u.has_patient_profile && <Pill tone="lilac">{T.patient}</Pill>}
                          {u.memberships.map((m: any) => (
                            <Pill key={m.membership_id} tone={m.status === 'active' ? 'neutral' : 'warn'}>
                              {(A.common.roles as Record<string, string>)[m.role] ?? m.role} · {nameOf(A.lang, { name_ar: m.organization_name_ar, name_en: m.organization_name_en })}
                            </Pill>
                          ))}
                        </div>
                      </td>
                      <td>
                        <Pill tone={u.is_active ? 'ok' : 'danger'}>{u.is_active ? T.active : T.off}</Pill>
                      </td>
                      <td>
                        <Button small variant={u.is_active ? 'danger' : undefined} disabled={pending} onClick={() => toggle(u)}>
                          {u.is_active ? T.deactivate : T.activate}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <div style={{ marginTop: 12 }}>
              <Button onClick={() => void load(rows.length)}>{T.more}</Button>
            </div>
          )}
        </Card>
        <Card title={T.assign} hint={T.assignHint}>
          <form className="na-form" onSubmit={assign} noValidate>
            <Field label={T.center} htmlFor="as-center">
              <select id="as-center" className="na-select" value={f.organization_id || (centers.state.status === 'ready' ? centers.state.data[0]?.id : '') || ''} onChange={(e) => setF({ ...f, organization_id: e.target.value })}>
                {centers.state.status === 'ready' &&
                  centers.state.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nameOf(A.lang, c)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={T.role} htmlFor="as-role">
              <select id="as-role" className="na-select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {Object.entries(T.roles).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T.nameAr} htmlFor="as-ar">
              <input id="as-ar" className="na-input" dir="rtl" value={f.full_name_ar} onChange={(e) => setF({ ...f, full_name_ar: e.target.value })} />
            </Field>
            <Field label={T.nameEn} htmlFor="as-en">
              <input id="as-en" className="na-input" dir="ltr" value={f.full_name_en} onChange={(e) => setF({ ...f, full_name_en: e.target.value })} />
            </Field>
            <Field label={T.email2} htmlFor="as-email">
              <input id="as-email" type="email" className="na-input" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label={A.manager.staff.password} htmlFor="as-pw">
              <input id="as-pw" type="password" className="na-input" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
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

/* ------------------------------------------------------------------ demo requests */
export const AdminRequests: React.FC = () => {
  const A = useA();
  const R = A.admin.requests;
  const [filter, setFilter] = useState('');
  const { state, reload } = useApiData<any[]>(`/api/admin/demo-requests${filter ? `?status=${filter}` : ''}`);
  const { run, pending } = useMutation();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const change = async (id: string, status: string) => {
    const res = await run(`/api/admin/demo-requests/${id}`, 'PATCH', { status });
    setMsg(res.ok ? { tone: 'ok', text: R.changed } : { tone: 'danger', text: res.error.message });
    reload();
  };

  return (
    <>
      <PageHead title={R.title} subtitle={R.subtitle} />
      <div className="na-stack">
        <Scope />
        {msg && (
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        )}
        <div className="na-tabs" role="group">
          {['', 'new', 'contacted', 'scheduled', 'completed'].map((s) => (
            <button key={s || 'all'} type="button" className="na-tab" aria-current={filter === s ? 'page' : undefined} onClick={() => setFilter(s)}>
              {s ? R.status[s] : R.all}
            </button>
          ))}
        </div>
        <Card>
          <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={R.none} />}>
            {(rows) => (
              <ul className="na-list">
                {rows.map((r) => (
                  <li key={r.id} className="na-list-item">
                    <div className="na-row na-row--between">
                      <strong>{r.organization_name}</strong>
                      <Pill tone={r.status === 'new' ? 'warn' : 'neutral'}>{R.status[r.status] ?? r.status}</Pill>
                    </div>
                    <span className="na-muted">
                      {r.contact_name} · <span className="na-ltr">{r.email}</span> · <span className="na-ltr">{r.phone}</span> · {r.center_type}
                    </span>
                    {r.notes && <p>{r.notes}</p>}
                    <span className="na-muted">
                      {R.received}: {formatDate(A.lang, r.created_at, true)}
                    </span>
                    <div className="na-row">
                      <select className="na-select" aria-label={R.status[r.status]} value={r.status} disabled={pending} onChange={(e) => change(r.id, e.target.value)} style={{ width: 'auto' }}>
                        {Object.entries(R.status).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
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

export const AdminAudit: React.FC = () => {
  const A = useA();
  return (
    <>
      <PageHead title={A.admin.audit.title} subtitle={A.admin.audit.subtitle} />
      <AuditLog scope="admin" />
    </>
  );
};
