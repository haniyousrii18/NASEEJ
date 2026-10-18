import React, { useState } from 'react';
import { useRequest } from '../api.js';
import { fill, formatDate } from '../format.js';
import type { AppRole } from '../nav.js';
import { Button } from '../ui.js';
import { useA } from '../useA.js';
import { destinationRoute, eventKey, type ActionId, type NotificationDto } from './model.js';

interface Props {
  n: NotificationDto;
  role: AppRole;
  navigate: (route: string) => void;
  onChanged: (n: NotificationDto, wasRead: boolean) => void;
  onRemoved: (id: string, wasUnread: boolean) => void;
  /** Called after the person leaves for the destination (the panel closes itself). */
  onNavigated?: () => void;
}

/**
 * One notification. The body is one button that opens the destination (and marks it seen). Quick actions are separate
 * buttons: each stops its click from reaching the body, does only its own job, and a consequential one asks first.
 * "Read" is shown apart from "handled": reading never completes the task the notification is about.
 */
export const NotificationItem: React.FC<Props> = ({ n, role, navigate, onChanged, onRemoved, onNavigated }) => {
  const A = useA();
  const T = A.notifications;
  const request = useRequest();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const key = eventKey(n);
  const words = (T.events as Record<string, { title: string; body: string }>)[key] ?? (T.events as Record<string, { title: string; body: string }>)[n.eventType];
  const d = (v?: string) => (v ? formatDate(A.lang, v) : '');
  const body = words ? fill(words.body, { date: d(n.params.date), time: n.params.time ?? '', oldDate: d(n.params.oldDate), oldTime: n.params.oldTime ?? '' }) : '';
  const route = destinationRoute(n, role);

  const markRead = async (): Promise<NotificationDto> => {
    if (n.read) return n;
    const res = await request<NotificationDto>(`/api/notifications/${n.id}/read`, { method: 'POST' });
    if (res.ok) {
      onChanged(res.data, false);
      return res.data;
    }
    return n;
  };

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markRead();
      if (!route) {
        setMessage({ tone: 'danger', text: T.destinationMissing });
        return;
      }
      onNavigated?.();
      navigate(route);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    const res = await request<NotificationDto>(`/api/notifications/${n.id}/refresh`, { method: 'POST' });
    if (res.ok) onChanged(res.data, n.read);
    return res;
  };

  const confirmAppointment = async () => {
    if (busy || !n.relatedId) return;
    setBusy(true);
    setMessage(null);
    try {
      // The existing, authorized appointment endpoint does the work, scoped to this notification's center.
      const res = await request(`/api/appointments/${n.relatedId}/status`, { method: 'PATCH', body: { status: 'confirmed' }, orgId: n.organizationId });
      if (res.ok) {
        await refresh();
        setMessage({ tone: 'ok', text: T.actions.confirmed });
      } else if (res.error.status === 409 || res.error.status === 404) {
        await refresh();
        setMessage({ tone: 'danger', text: T.actions.stale });
      } else {
        setMessage({ tone: 'danger', text: T.actions.failed });
      }
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  const dismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await request(`/api/notifications/${n.id}/dismiss`, { method: 'POST' });
      if (res.ok) onRemoved(n.id, !n.read);
    } finally {
      setBusy(false);
    }
  };

  const runAction = (id: ActionId) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === 'open') void open();
    else if (id === 'confirm_appointment') setAsking(true);
  };

  const unread = !n.read;
  return (
    <li className="na-nt" data-unread={unread} data-state={n.state}>
      <button type="button" className="na-nt-main" onClick={() => void open()} aria-describedby={`nt-${n.id}-meta`}>
        <span className="na-nt-mark" aria-hidden="true">{unread ? '●' : '○'}</span>
        <span className="na-nt-text">
          <span className="na-nt-title">{words?.title ?? n.eventType}</span>
          {body && <span className="na-nt-body">{body}</span>}
          <span className="na-nt-meta" id={`nt-${n.id}-meta`}>
            <span>{(T.categories as Record<string, string>)[n.category] ?? n.category}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={n.createdAt}>{formatDate(A.lang, n.createdAt, true)}</time>
            <span aria-hidden="true">·</span>
            <span>{unread ? T.status.unread : T.status.read}</span>
            {n.state === 'handled' && <span className="na-nt-flag">✓ {T.status.handled}</span>}
            {n.state === 'unavailable' && <span className="na-nt-flag">! {T.status.unavailable}</span>}
          </span>
        </span>
      </button>

      {(
        <div className="na-nt-actions">
          {asking ? (
            <>
              <span className="na-nt-ask" role="alert">{T.actions.confirmAsk}</span>
              <Button small variant="primary" disabled={busy} onClick={(e) => { e.stopPropagation(); void confirmAppointment(); }}>
                {T.actions.confirmYes}
              </Button>
              <Button small variant="quiet" disabled={busy} onClick={(e) => { e.stopPropagation(); setAsking(false); }}>
                {T.actions.cancel}
              </Button>
            </>
          ) : (
            <>
              {n.actions.filter((a) => a.id !== 'open' || route).map((a) => (
                <Button key={a.id} small variant={a.kind === 'api' ? 'primary' : undefined} disabled={busy} onClick={runAction(a.id)}>
                  {a.id === 'open' ? T.actions.open : T.actions[a.id]}
                </Button>
              ))}
              <Button small variant="quiet" disabled={busy} onClick={dismiss}>
                {T.actions.dismiss}
              </Button>
            </>
          )}
        </div>
      )}
      {message && (
        <p className="na-nt-msg" data-tone={message.tone} role={message.tone === 'danger' ? 'alert' : 'status'}>
          {message.tone === 'danger' ? '! ' : '✓ '}
          {message.text}
        </p>
      )}
    </li>
  );
};
