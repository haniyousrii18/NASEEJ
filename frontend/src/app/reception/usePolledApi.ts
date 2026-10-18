import { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest, type AsyncState } from '../api.js';
import { BOARD_POLL_MS } from './useDayBoard.js';

/**
 * Loads `path` (null = not yet) and keeps it fresh: refetches every `pollMs` while the tab is visible and as
 * soon as it becomes visible again. A failed refresh keeps the data on screen and raises `stale`.
 */
export function usePolledApi<T>(path: string | null, pollMs: number = BOARD_POLL_MS) {
  const request = useRequest();
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const seq = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    const res = await request<T>(path);
    if (mine !== seq.current) return;
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
  }, [path, request]);

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

  return { state, reload: load, stale, updatedAt };
}
