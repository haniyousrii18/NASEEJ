import React, { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../AppIcons.js';
import { fill } from '../format.js';
import type { AppRole } from '../nav.js';
import { ROLE_BASE } from '../nav.js';
import { EmptyState, Loading } from '../ui.js';
import { useA } from '../useA.js';
import { NotificationItem } from './NotificationItem.js';
import { useNotifications } from './NotificationsContext.js';

/** Bell with an unread count, and a compact panel of the newest notifications with a link to the full inbox. */
export const NotificationBell: React.FC<{ role: AppRole; navigate: (route: string) => void }> = ({ role, navigate }) => {
  const A = useA();
  const T = A.notifications;
  const { unread, items, loading, error, refresh, apply, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = (restore = true) => {
    setOpen(false);
    if (restore) btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = unread > 0 ? `${T.bell}, ${fill(T.unreadLabel, { n: unread })}` : T.bell;

  return (
    <div className="na-nt-wrap" ref={wrap}>
      <button
        type="button"
        className="na-icon-btn na-nt-bell"
        ref={btn}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={T.bell}
        onClick={() => setOpen((o) => !o)}
      >
        <AppIcon name="bell" />
        {unread > 0 && (
          <span className="na-nt-count" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="na-nt-panel" role="dialog" aria-label={T.title} tabIndex={-1} ref={panel}>
          <div className="na-nt-panel-h">
            <h2 className="na-nt-panel-title">{T.title}</h2>
            {unread > 0 && <span className="na-nt-panel-count">{fill(T.unreadLabel, { n: unread })}</span>}
          </div>
          {loading ? (
            <Loading />
          ) : error ? (
            <EmptyState title={T.loadError} />
          ) : items.length === 0 ? (
            <p className="na-muted na-nt-empty">{T.empty}</p>
          ) : (
            <ul className="na-nt-list">
              {items.map((n) => (
                <NotificationItem key={n.id} n={n} role={role} navigate={navigate} onChanged={apply} onRemoved={remove} onNavigated={() => close(false)} />
              ))}
            </ul>
          )}
          <button
            type="button"
            className="na-nt-all"
            onClick={() => {
              close(false);
              navigate(`${ROLE_BASE[role]}/notifications`);
            }}
          >
            {T.viewAll}
          </button>
        </div>
      )}
    </div>
  );
};
