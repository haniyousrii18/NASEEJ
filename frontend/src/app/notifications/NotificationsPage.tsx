import React, { useCallback, useEffect, useState } from 'react';
import { useRequest } from '../api.js';
import type { ApiFailure } from '../api.js';
import { fill } from '../format.js';
import type { AppRole } from '../nav.js';
import { Button, EmptyState, ErrorState, Loading, PageHead, Select } from '../ui.js';
import { useA } from '../useA.js';
import { NotificationItem } from './NotificationItem.js';
import { SearchField } from '../health/filters.js';
import { useNotifications } from './NotificationsContext.js';
import { eventKey, type NotificationDto } from './model.js';

const PAGE = 20;
const CATEGORIES = ['appointments', 'messages', 'records', 'access', 'operations', 'account', 'administration'] as const;
type Status = 'all' | 'unread' | 'archived';
interface Summary {
  total: number;
  unread: number;
  archived: number;
  byCategory: Record<string, { total: number; unread: number }>;
}

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
  const [query, setQuery] = useState('');

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

  const count = (key: Status) => (!summary ? '' : ` (${key === 'all' ? summary.total : key === 'unread' ? summary.unread : summary.archived})`);
  const hasUnread = status !== 'archived' && rows.some((r) => !r.read);

  // Search covers the rows that are loaded: the title and the sentence the person reads.
  const textOf = (n: NotificationDto) => {
    const words = (T.events as Record<string, { title: string; body: string }>)[eventKey(n)] ?? (T.events as Record<string, { title: string; body: string }>)[n.eventType];
    return `${words?.title ?? ''} ${words?.body ?? ''} ${(T.categories as Record<string, string>)[n.category] ?? ''}`.toLowerCase();
  };
  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter((n) => textOf(n).includes(needle)) : rows;

  return (
    <>
      <PageHead
        title={T.title}
        subtitle={summary ? fill(T.summary, { n: summary.unread, total: summary.total }) : undefined}
        actions={
          hasUnread ? (
            <Button onClick={() => void markAll()}>
              {T.markAllRead}
              {summary && summary.unread > 0 && <span className="hp-count">{summary.unread}</span>}
            </Button>
          ) : undefined
        }
      />

      <div className="na-nt-toolbar">
        <div className="na-chips" role="group" aria-label={T.filters.status}>
          {(['all', 'unread', 'archived'] as const).map((s) => (
            <button key={s} type="button" className="na-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {T.filters[s]}
              {count(s)}
            </button>
          ))}
        </div>
        <div className="na-nt-toolbar-end">
          <Select className="na-select na-nt-type" aria-label={T.filters.category} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{T.allTypes}</option>
            {CATEGORIES.filter((c) => !summary || (summary.byCategory[c]?.total ?? 0) > 0 || category === c).map((c) => (
              <option key={c} value={c}>
                {T.categories[c as keyof typeof T.categories]}
                {summary ? ` (${summary.byCategory[c]?.total ?? 0})` : ''}
              </option>
            ))}
          </Select>
          <SearchField id="nt-q" label={T.search} value={query} onChange={setQuery} />
        </div>
      </div>

      {phase === 'loading' ? (
        <Loading />
      ) : phase === 'error' && failure ? (
        <ErrorState error={failure} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState title={status === 'unread' ? T.emptyUnread : status === 'archived' ? T.emptyArchived : T.empty} />
      ) : (
        <>
          <p className="na-help" role="status">
            {needle ? fill(T.count, { n: visible.length }) : fill(T.count, { n: total })}
            {needle && rows.length < total ? ` · ${T.searchHint}` : ''}
          </p>
          {visible.length === 0 ? (
            <EmptyState title={T.noMatch} />
          ) : (
            <section className="na-card na-ntr-card" aria-label={T.title}>
              <ul className="na-ntr-list">
                {visible.map((n) => (
                  <NotificationItem key={n.id} n={n} variant="row" archived={status === 'archived'} role={role} navigate={navigate} onChanged={onChanged} onRemoved={onRemoved} />
                ))}
              </ul>
            </section>
          )}
          {rows.length < total && (
            <div className="na-ntr-more">
              <span className="na-muted">{fill(T.shown, { n: rows.length, total })}</span>
              <Button disabled={more} onClick={() => void loadMore()}>
                {T.loadMore}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
};
