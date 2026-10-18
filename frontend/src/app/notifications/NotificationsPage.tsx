import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequest } from '../api.js';
import type { ApiFailure } from '../api.js';
import { fill } from '../format.js';
import type { AppRole } from '../nav.js';
import { Button, EmptyState, ErrorState, Loading, PageHead } from '../ui.js';
import { useA } from '../useA.js';
import { NotificationItem } from './NotificationItem.js';
import { useNotifications } from './NotificationsContext.js';
import type { NotificationDto } from './model.js';

const PAGE = 20;
const CATEGORIES = ['appointments', 'messages', 'records', 'access', 'operations', 'account', 'administration'] as const;
type Status = 'all' | 'unread' | 'archived';
interface Summary {
  total: number;
  unread: number;
  archived: number;
  byCategory: Record<string, { total: number; unread: number }>;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** The notifications inbox: status tabs with counts, category filters with counts, day groups, paging, bulk "mark all read". */
export const NotificationsPage: React.FC<{ role: AppRole; navigate: (route: string) => void }> = ({ role, navigate }) => {
  const A = useA();
  const T = A.notifications;
  const request = useRequest();
  const shared = useNotifications();
  const [status, setStatus] = useState<Status>('all');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<NotificationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [more, setMore] = useState(false);

  const path = useCallback(
    (offset: number) => `/api/notifications?role=${role}&limit=${PAGE}&offset=${offset}&status=${status}${category ? `&category=${category}` : ''}`,
    [role, status, category],
  );

  const loadSummary = useCallback(async () => {
    const res = await request<Summary>(`/api/notifications/summary?role=${role}`);
    if (res.ok) setSummary(res.data);
  }, [request, role]);

  const load = useCallback(async () => {
    setPhase('loading');
    const res = await request<NotificationDto[]>(path(0));
    if (res.ok) {
      setRows(res.data);
      setTotal(res.meta?.total ?? res.data.length);
      setPhase('ready');
    } else {
      setFailure(res.error);
      setPhase('error');
    }
  }, [request, path]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const loadMore = async () => {
    setMore(true);
    const res = await request<NotificationDto[]>(path(rows.length));
    setMore(false);
    if (res.ok) setRows((r) => [...r, ...res.data]);
  };

  const onChanged = (n: NotificationDto, wasRead: boolean) => {
    setRows((r) => r.map((x) => (x.id === n.id ? n : x)));
    shared.apply(n, wasRead);
    void loadSummary();
  };
  const onRemoved = (id: string, wasUnread: boolean) => {
    setRows((r) => r.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    if (status !== 'archived') shared.remove(id, wasUnread);
    else void shared.refresh();
    void loadSummary();
  };

  const markAll = async () => {
    const res = await request('/api/notifications/read-all', { method: 'POST', body: { role, ...(category ? { category } : {}) } });
    if (res.ok) {
      setRows((r) => r.map((x) => ({ ...x, read: true })));
      void shared.refresh();
      void loadSummary();
      if (status === 'unread') void load();
    }
  };

  // Day groups, newest first (the server already orders the rows).
  const groups = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const out: Array<{ label: string; items: NotificationDto[] }> = [];
    for (const n of rows) {
      const d = new Date(n.createdAt);
      const label = dayKey(d) === dayKey(today) ? T.groups.today : dayKey(d) === dayKey(yesterday) ? T.groups.yesterday : T.groups.earlier;
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [rows, T]);

  const count = (key: Status) => (!summary ? '' : ` (${key === 'all' ? summary.total : key === 'unread' ? summary.unread : summary.archived})`);
  const hasUnread = status !== 'archived' && rows.some((r) => !r.read);

  return (
    <>
      <PageHead
        title={T.title}
        subtitle={summary ? fill(T.summary, { n: summary.unread, total: summary.total }) : undefined}
        actions={hasUnread ? <Button small onClick={() => void markAll()}>{T.markAllRead}</Button> : undefined}
      />

      <div className="na-nt-filters" role="group" aria-label={T.filters.status}>
        {(['all', 'unread', 'archived'] as const).map((s) => (
          <button key={s} type="button" className="na-nt-chip na-nt-chip--status" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {status === s ? '✓ ' : ''}
            {T.filters[s]}
            {count(s)}
          </button>
        ))}
      </div>
      <div className="na-nt-filters" role="group" aria-label={T.filters.category}>
        {['', ...CATEGORIES].map((c) => {
          const n = c ? summary?.byCategory[c]?.total ?? 0 : null;
          if (c && summary && n === 0 && category !== c) return null;
          return (
            <button key={c || 'all'} type="button" className="na-nt-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {category === c ? '✓ ' : ''}
              {c ? T.categories[c as keyof typeof T.categories] : T.filters.all}
              {c && summary ? ` (${n})` : ''}
            </button>
          );
        })}
      </div>

      {phase === 'loading' ? (
        <Loading />
      ) : phase === 'error' && failure ? (
        <ErrorState error={failure} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState title={status === 'unread' ? T.emptyUnread : status === 'archived' ? T.emptyArchived : T.empty} />
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.label} className="na-nt-day" aria-label={g.label}>
              <h2 className="na-nt-day-h">{g.label}</h2>
              <ul className="na-nt-list na-nt-list--page">
                {g.items.map((n) => (
                  <NotificationItem key={n.id} n={n} archived={status === 'archived'} role={role} navigate={navigate} onChanged={onChanged} onRemoved={onRemoved} />
                ))}
              </ul>
            </section>
          ))}
          {rows.length < total && (
            <div className="na-set-actions">
              <Button disabled={more} onClick={() => void loadMore()}>{T.loadMore}</Button>
            </div>
          )}
        </>
      )}
    </>
  );
};
