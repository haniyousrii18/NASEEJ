import React, { useCallback, useEffect, useState } from 'react';
import { useRequest } from '../api.js';
import type { AppRole } from '../nav.js';
import { Button, EmptyState, ErrorState, Loading, PageHead } from '../ui.js';
import { useA } from '../useA.js';
import type { ApiFailure } from '../api.js';
import { NotificationItem } from './NotificationItem.js';
import { useNotifications } from './NotificationsContext.js';
import type { NotificationDto } from './model.js';

const PAGE = 20;
const CATEGORIES = ['appointments', 'messages', 'records', 'access', 'operations', 'account', 'administration'] as const;

/** The full inbox: filter by category and unread, page through older items, mark everything seen. */
export const NotificationsPage: React.FC<{ role: AppRole; navigate: (route: string) => void }> = ({ role, navigate }) => {
  const A = useA();
  const T = A.notifications;
  const request = useRequest();
  const shared = useNotifications();
  const [category, setCategory] = useState<string>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [rows, setRows] = useState<NotificationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [more, setMore] = useState(false);

  const path = useCallback(
    (offset: number) => `/api/notifications?role=${role}&limit=${PAGE}&offset=${offset}${category ? `&category=${category}` : ''}${unreadOnly ? '&status=unread' : ''}`,
    [role, category, unreadOnly],
  );

  const load = useCallback(async () => {
    setStatus('loading');
    const res = await request<NotificationDto[]>(path(0));
    if (res.ok) {
      setRows(res.data);
      setTotal(res.meta?.total ?? res.data.length);
      setStatus('ready');
    } else {
      setFailure(res.error);
      setStatus('error');
    }
  }, [request, path]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    setMore(true);
    const res = await request<NotificationDto[]>(path(rows.length));
    setMore(false);
    if (res.ok) setRows((r) => [...r, ...res.data]);
  };

  const onChanged = (n: NotificationDto, wasRead: boolean) => {
    setRows((r) => r.map((x) => (x.id === n.id ? n : x)));
    shared.apply(n, wasRead);
  };
  const onRemoved = (id: string, wasUnread: boolean) => {
    setRows((r) => r.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    shared.remove(id, wasUnread);
  };

  const markAll = async () => {
    const res = await request('/api/notifications/read-all', { method: 'POST', body: { role, ...(category ? { category } : {}) } });
    if (res.ok) {
      setRows((r) => r.map((x) => ({ ...x, read: true })));
      void shared.refresh();
    }
  };

  const hasUnread = rows.some((r) => !r.read);

  return (
    <>
      <PageHead title={T.title} actions={hasUnread ? <Button small onClick={() => void markAll()}>{T.markAllRead}</Button> : undefined} />
      <div className="na-nt-filters" role="group" aria-label={T.filters.category}>
        {['', ...CATEGORIES].map((c) => (
          <button key={c || 'all'} type="button" className="na-nt-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {category === c ? '✓ ' : ''}
            {c ? T.categories[c as keyof typeof T.categories] : T.filters.all}
          </button>
        ))}
        <button type="button" className="na-nt-chip" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((u) => !u)}>
          {unreadOnly ? '✓ ' : ''}
          {T.filters.unread}
        </button>
      </div>
      {status === 'loading' ? (
        <Loading />
      ) : status === 'error' && failure ? (
        <ErrorState error={failure} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState title={unreadOnly ? T.emptyUnread : T.empty} />
      ) : (
        <>
          <ul className="na-nt-list na-nt-list--page">
            {rows.map((n) => (
              <NotificationItem key={n.id} n={n} role={role} navigate={navigate} onChanged={onChanged} onRemoved={onRemoved} />
            ))}
          </ul>
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
