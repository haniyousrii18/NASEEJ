import { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest, type ApiFailure, type AsyncState } from '../api.js';
import type { AppointmentRow } from '../pages/AppointmentList.js';

/** How often the board asks the server again while the tab is visible. */
export const BOARD_POLL_MS = 30_000;

/**
 * One shared view of a day's appointments for the front desk.
 * - Refetches every `pollMs` while the tab is visible, and immediately when it becomes visible again.
 * - A status change is applied at once and rolled back if the server refuses it; polls that finish while a
 *   change is in flight are dropped, so a stale answer cannot undo the change on screen.
 * - A failed refresh keeps the data already shown and raises `stale` instead of replacing the board with an error.
 */
export function useDayBoard(date: string, pollMs: number = BOARD_POLL_MS) {
  const request = useRequest();
  const [state, setState] = useState<AsyncState<AppointmentRow[]>>({ status: 'loading' });
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const seq = useRef(0);
  const inFlight = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const res = await request<AppointmentRow[]>(`/api/appointments?date=${date}`);
    if (mine !== seq.current || inFlight.current > 0) return;
    if (res.ok) {
      hasData.current = true;
      setState({ status: 'ready', data: res.data });
      setUpdatedAt(Date.now());
      setStale(false);
    } else if (hasData.current) {
      setStale(true);
    } else {
      setState({ status: 'error', error: res.error });
    }
  }, [date, request]);

  useEffect(() => {
    hasData.current = false;
    setState({ status: 'loading' });
    setStale(false);
    void load();
    return () => {
      seq.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const id = window.setInterval(tick, pollMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load, pollMs]);

  const replace = useCallback((row: AppointmentRow) => {
    setState((s) => (s.status === 'ready' ? { ...s, data: s.data.map((r) => (r.id === row.id ? row : r)) } : s));
  }, []);

  /** Moves an appointment to `target`. Resolves to the failure when the server refuses it, otherwise null. */
  const change = useCallback(
    async (row: AppointmentRow, target: string): Promise<ApiFailure | null> => {
      inFlight.current += 1;
      setBusy((prev) => new Set(prev).add(row.id));
      replace({ ...row, status: target, check_in_time: target === 'checked_in' ? new Date().toISOString() : row.check_in_time });
      const res = await request(`/api/appointments/${row.id}/status`, { method: 'PATCH', body: { status: target } });
      inFlight.current -= 1;
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      if (!res.ok) {
        replace(row);
        return res.error;
      }
      void load();
      return null;
    },
    [load, replace, request],
  );

  return { state, reload: load, change, busy, updatedAt, stale };
}
