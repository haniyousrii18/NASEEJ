import React, { useCallback, useEffect, useState } from 'react';
import { useApiData, useRequest } from '../api.js';
import { formatDate, nameOf } from '../format.js';
import { Button, Card, ErrorState, Field, Loading } from '../ui.js';
import { useA } from '../useA.js';
import type { ApiFailure } from '../api.js';

interface AuditRow {
  id: string;
  organization_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  organization_name_ar: string | null;
  organization_name_en: string | null;
}

const detailText = (d: Record<string, unknown> | null) =>
  d
    ? Object.entries(d)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(' · ')
    : '';

/**
 * The audit log, read-only. A platform administrator can pick any center; a center manager sees their own.
 * The server redacts clinical keys from `details` for both roles, and this table only prints what it receives.
 */
export const AuditLog: React.FC<{ scope: 'admin' | 'manager' }> = ({ scope }) => {
  const A = useA();
  const T = A.ops.audit;
  const request = useRequest();
  const centers = useApiData<Array<{ id: string; name_ar: string; name_en: string }>>(scope === 'admin' ? '/api/organizations' : null);

  const [org, setOrg] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ org: '', action: '', resourceType: '', from: '', to: '' });

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'more' | 'error'>('loading');
  const [error, setError] = useState<ApiFailure | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setStatus(before ? 'more' : 'loading');
      const p = new URLSearchParams({ limit: '25' });
      if (applied.org) p.set('organizationId', applied.org);
      if (applied.action) p.set('action', applied.action.trim());
      if (applied.resourceType) p.set('resourceType', applied.resourceType.trim());
      if (applied.from) p.set('from', `${applied.from}T00:00:00`);
      if (applied.to) p.set('to', `${applied.to}T23:59:59`);
      if (before) p.set('before', before);
      const res = await request<AuditRow[]>(`/api/audit-logs?${p.toString()}`, scope === 'admin' ? { orgId: null } : {});
      if (!res.ok) {
        setError(res.error);
        return setStatus('error');
      }
      setRows((prev) => (before ? [...prev, ...res.data] : res.data));
      setNext(res.meta?.hasMore ? res.meta.nextBefore : null);
      setStatus('ready');
    },
    [applied, request, scope],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied({ org, action, resourceType, from, to });
  };
  const reset = () => {
    setOrg('');
    setAction('');
    setResourceType('');
    setFrom('');
    setTo('');
    setApplied({ org: '', action: '', resourceType: '', from: '', to: '' });
  };

  return (
    <div className="na-stack">
      <Card>
        <form className="na-form" onSubmit={apply}>
          {scope === 'admin' && (
            <Field label={T.center} htmlFor="au-org">
              <select id="au-org" className="na-select" value={org} onChange={(e) => setOrg(e.target.value)}>
                <option value="">{T.allCenters}</option>
                {centers.state.status === 'ready' &&
                  centers.state.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nameOf(A.lang, c)}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label={T.filterAction} htmlFor="au-action">
            <input id="au-action" className="na-input na-ltr" placeholder="APPOINTMENT_" value={action} onChange={(e) => setAction(e.target.value)} />
          </Field>
          <Field label={T.resourceType} htmlFor="au-type">
            <input id="au-type" className="na-input na-ltr" placeholder="appointment" value={resourceType} onChange={(e) => setResourceType(e.target.value)} />
          </Field>
          <Field label={T.from} htmlFor="au-from">
            <input id="au-from" type="date" className="na-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={T.to} htmlFor="au-to">
            <input id="au-to" type="date" className="na-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="na-row">
            <Button type="submit" variant="primary">
              {T.apply}
            </Button>
            <Button variant="quiet" onClick={reset}>
              {T.reset}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        {status === 'loading' && <Loading />}
        {status === 'error' && error && <ErrorState error={error} onRetry={() => void load()} />}
        {(status === 'ready' || status === 'more') && rows.length === 0 && <p className="na-muted">{T.none}</p>}
        {rows.length > 0 && (
          <div className="na-table-wrap">
            <table className="na-table">
              <thead>
                <tr>
                  <th>{T.when}</th>
                  <th>{T.actor}</th>
                  <th>{T.action}</th>
                  <th>{T.resource}</th>
                  {scope === 'admin' && <th>{T.center}</th>}
                  <th>{T.details}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="na-num">{formatDate(A.lang, r.created_at, true)}</td>
                    <td>
                      <span className="na-ltr">{r.actor_email || T.system}</span>
                      {r.actor_role && <div className="na-muted">{(A.common.roles as Record<string, string>)[r.actor_role] ?? r.actor_role}</div>}
                    </td>
                    <td className="na-ltr">{r.action}</td>
                    <td className="na-ltr">
                      {r.resource_type || '—'}
                      {r.resource_id ? <div className="na-muted">{r.resource_id.slice(0, 8)}</div> : null}
                    </td>
                    {scope === 'admin' && <td>{nameOf(A.lang, { name_ar: r.organization_name_ar, name_en: r.organization_name_en }) || '—'}</td>}
                    <td className="na-muted na-ltr">{detailText(r.details) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next && (
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => void load(next)} disabled={status === 'more'}>
              {A.common.actions.loadMore}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
