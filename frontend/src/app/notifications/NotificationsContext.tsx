import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRequest } from '../api.js';
import type { AppRole } from '../nav.js';
import type { NotificationDto } from './model.js';

/**
 * Holds the unread count and the newest notifications for the bell. Updates are PERIODIC, not real time: one fetch when
 * the shell mounts, one every 60 seconds while the page is visible, one when the tab becomes visible again, and one
 * when the panel opens. Nothing polls while the tab is hidden or after sign-out (the shell unmounts). Responses live
 * in memory only.
 */
const POLL_MS = 60_000;
const PANEL_SIZE = 8;

interface Ctx {
  unread: number;
  items: NotificationDto[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  /** Replaces one item (after read / dismiss / refresh) and keeps the count honest. */
  apply: (n: NotificationDto, wasRead?: boolean) => void;
  remove: (id: string, wasUnread: boolean) => void;
  clearUnread: () => void;
}

const NotificationsContext = createContext<Ctx | null>(null);

export const NotificationsProvider: React.FC<{ role: AppRole; children: React.ReactNode }> = ({ role, children }) => {
  const request = useRequest();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return; // no duplicate requests
    inflight.current = true;
    try {
      const res = await request<NotificationDto[]>(`/api/notifications?role=${role}&limit=${PANEL_SIZE}&status=unread`);
      if (res.ok) {
        setItems(res.data);
        setUnread(res.meta?.unreadCount ?? 0);
        setError(false);
      } else {
        setError(true);
      }
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [request, role]);

  useEffect(() => {
    void refresh();
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  const apply = useCallback((n: NotificationDto, wasRead?: boolean) => {
    if (n.read) {
      setItems((list) => list.filter((x) => x.id !== n.id));
    } else {
      setItems((list) => list.map((x) => (x.id === n.id ? n : x)));
    }
    if (wasRead === false && n.read) setUnread((c) => Math.max(0, c - 1));
  }, []);
  const remove = useCallback((id: string, wasUnread: boolean) => {
    setItems((list) => list.filter((x) => x.id !== id));
    if (wasUnread) setUnread((c) => Math.max(0, c - 1));
  }, []);
  const clearUnread = useCallback(() => {
    setUnread(0);
    setItems([]);
  }, []);

  const value = useMemo(() => ({ unread, items, loading, error, refresh, apply, remove, clearUnread }), [unread, items, loading, error, refresh, apply, remove, clearUnread]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}

/** The unread count for chrome outside the provider's children (the sidebar). 0 when there is no provider. */
export function useUnreadCount(): number {
  return useContext(NotificationsContext)?.unread ?? 0;
}
