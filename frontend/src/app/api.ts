import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

/**
 * API access for the authenticated application.
 * Unlike the shared apiFetch, a failure keeps its HTTP status and server error code, so a screen can tell
 * "loading", "empty", "forbidden", "not found", "stale" and "server error" apart.
 * Responses are held in component memory only: no clinical data goes to localStorage or any cache.
 */
export interface ApiFailure {
  status: number; // 0 = the server could not be reached
  code: string;
  message: string;
  details?: any;
}

export type ApiResult<T> = { ok: true; data: T; meta?: any } | { ok: false; error: ApiFailure };

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; meta?: any }
  | { status: 'error'; error: ApiFailure };

export const UNAUTHORIZED_EVENT = 'naseej:unauthorized';

export function useRequest() {
  const { token, currentOrgId } = useAuth();

  return useCallback(
    async <T = any>(path: string, init: { method?: string; body?: unknown; orgId?: string | null } = {}): Promise<ApiResult<T>> => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      // `orgId: null` sends no center header: a platform administrator reads across centers.
      const org = init.orgId === undefined ? currentOrgId : init.orgId;
      if (org) headers['X-Organization-Id'] = org;

      let res: Response;
      try {
        res = await fetch(path, { method: init.method || 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
      } catch {
        return { ok: false, error: { status: 0, code: 'NETWORK', message: 'Network error' } };
      }

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        /* a gateway error or an empty body */
      }
      if (res.ok && json?.success !== false) return { ok: true, data: json?.data as T, meta: json?.meta };

      if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      return {
        ok: false,
        error: {
          status: res.status,
          code: json?.error?.code || 'ERROR',
          message: json?.error?.message || res.statusText,
          details: json?.error?.details,
        },
      };
    },
    [token, currentOrgId],
  );
}

/** Loads `path` (null = do not load yet) and exposes loading / ready / error plus a reload. */
export function useApiData<T = any>(path: string | null) {
  const request = useRequest();
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    const res = await request<T>(path);
    if (mine !== seq.current) return; // a newer request owns the screen
    setState(res.ok ? { status: 'ready', data: res.data, meta: res.meta } : { status: 'error', error: res.error });
  }, [path, request]);

  useEffect(() => {
    setState({ status: 'loading' });
    void load();
    return () => {
      seq.current += 1;
    };
  }, [load]);

  return { state, reload: load };
}

/** Sends a change and reports a pending flag, so buttons can disable themselves while it runs. */
export function useMutation() {
  const request = useRequest();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T = any>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> => {
      setPending(true);
      try {
        return await request<T>(path, { method, body });
      } finally {
        setPending(false);
      }
    },
    [request],
  );
  return { run, pending };
}

/**
 * Downloads a protected file. The route needs the bearer token, so a plain link cannot be used;
 * the bytes are read into memory, offered to the browser as a download, and released.
 */
export function useDownload() {
  const { token, currentOrgId } = useAuth();
  return useCallback(
    async (id: string, fileName: string): Promise<ApiFailure | null> => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (currentOrgId) headers['X-Organization-Id'] = currentOrgId;
      let res: Response;
      try {
        res = await fetch(`/api/documents/${id}/download`, { headers });
      } catch {
        return { status: 0, code: 'NETWORK', message: 'Network error' };
      }
      if (!res.ok) {
        let json: any = null;
        try {
          json = await res.json();
        } catch {
          /* no body */
        }
        return { status: res.status, code: json?.error?.code || 'ERROR', message: json?.error?.message || res.statusText };
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return null;
    },
    [token, currentOrgId],
  );
}
