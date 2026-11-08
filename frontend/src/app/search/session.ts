import { cleanQuery, normalizeSearch } from './normalize.js';

export interface SearchHit {
  ref: string;
  type: string;
  id: string;
  title: string;
  summary: string;
  date: string | null;
  origin: any;
  documentId?: string;
  score: number;
  matched: { field: string; via: 'original' | 'translation' | 'glossary' | 'label'; text: string };
}

export interface SearchState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** The query the hits belong to (not the one being typed). */
  query: string;
  hits: SearchHit[];
  total: number;
}

export type SearchFetch = (query: string, signal: AbortSignal) => Promise<{ ok: true; data: SearchHit[]; meta?: { total?: number } } | { ok: false; aborted?: boolean }>;

export const MIN_QUERY = 2;
export const DEBOUNCE_MS = 250;

export const IDLE: SearchState = { status: 'idle', query: '', hits: [], total: 0 };

/**
 * The timing rules of search-as-you-type, kept free of React so they can be tested:
 *  - nothing is requested below MIN_QUERY letters (after normalization), and typing resets the DEBOUNCE_MS wait;
 *  - a new request aborts the one in flight, and an answer is used only if it is still the latest one asked for;
 *  - while a newer query loads, the previous hits stay visible (no flashing) but the status says "loading";
 *  - reset() / dispose() cancel everything, so a sign-out or a page change cannot paint old results later.
 */
export class SearchSession {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ctrl: AbortController | null = null;
  private seq = 0;
  private state: SearchState = IDLE;

  constructor(
    private fetcher: SearchFetch,
    private onChange: (s: SearchState) => void,
    private opts: { debounce?: number; min?: number } = {},
  ) {}

  private set(s: SearchState) {
    this.state = s;
    this.onChange(s);
  }

  setQuery(raw: string) {
    const q = cleanQuery(raw);
    this.cancel();
    if (normalizeSearch(q).length < (this.opts.min ?? MIN_QUERY)) return this.set(IDLE);
    this.set({ ...this.state, status: 'loading' });
    this.timer = setTimeout(() => void this.run(q), this.opts.debounce ?? DEBOUNCE_MS);
  }

  /** Runs now, skipping the wait (the Enter key). */
  flush(raw: string) {
    const q = cleanQuery(raw);
    this.cancel();
    if (normalizeSearch(q).length < (this.opts.min ?? MIN_QUERY)) return this.set(IDLE);
    this.set({ ...this.state, status: 'loading' });
    void this.run(q);
  }

  private async run(q: string) {
    const mine = ++this.seq;
    this.ctrl = new AbortController();
    let res;
    try {
      res = await this.fetcher(q, this.ctrl.signal);
    } catch {
      res = { ok: false as const };
    }
    if (mine !== this.seq) return; // a newer query owns the list
    if (!res.ok) {
      if (res.aborted) return;
      return this.set({ status: 'error', query: q, hits: [], total: 0 });
    }
    this.set({ status: 'ready', query: q, hits: res.data, total: res.meta?.total ?? res.data.length });
  }

  private cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ctrl?.abort();
    this.ctrl = null;
    this.seq += 1;
  }

  reset() {
    this.cancel();
    this.set(IDLE);
  }

  dispose() {
    this.cancel();
  }
}
