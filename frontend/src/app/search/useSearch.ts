import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useRequest } from '../api.js';
import { useA } from '../useA.js';
import { IDLE, SearchSession, type SearchFetch, type SearchState } from './session.js';

/**
 * Debounced, cancellable search of the signed-in patient's own record (GET /api/search).
 * `types` narrows to some kinds of record; `limit` is how many hits are wanted.
 * Changing user, interface language or the type list starts a clean session, so old answers are never shown for a new context.
 */
export function useSearch(opts: { types?: string[]; limit?: number } = {}) {
  const request = useRequest();
  const { token } = useAuth();
  const A = useA();
  const [state, setState] = useState<SearchState>(IDLE);
  const typesKey = (opts.types ?? []).join(',');
  const limit = opts.limit ?? 8;
  const requestRef = useRef(request);
  requestRef.current = request;

  const session = useMemo(() => {
    const fetcher: SearchFetch = async (q, signal) => {
      const url = `/api/search?q=${encodeURIComponent(q)}&limit=${limit}&lang=${A.lang}${typesKey ? `&types=${typesKey}` : ''}`;
      const res = await requestRef.current<any[]>(url, { signal });
      if (res.ok) return { ok: true, data: res.data, meta: res.meta };
      return { ok: false, aborted: res.error.code === 'ABORTED' };
    };
    return new SearchSession(fetcher, setState);
    // A new token (another user, or signed out), language or type list is a different search.
  }, [token, A.lang, typesKey, limit]);

  useEffect(() => {
    setState(IDLE);
    return () => session.dispose();
  }, [session]);

  const setQuery = useCallback((q: string) => session.setQuery(q), [session]);
  const flush = useCallback((q: string) => session.flush(q), [session]);
  const reset = useCallback(() => session.reset(), [session]);
  return { state, setQuery, flush, reset };
}
