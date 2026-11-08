import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSearch } from '../src/app/search/normalize';
import { highlightRanges, splitByRanges } from '../src/app/search/highlight';
import { SearchSession, type SearchFetch, type SearchHit, type SearchState } from '../src/app/search/session';

const hit = (id: string): SearchHit => ({ ref: `entry:${id}`, type: 'allergy', id, title: id, summary: '', date: null, origin: 'patient', score: 1, matched: { field: 'title', via: 'original', text: id } });

describe('search normalization (same rules as the server)', () => {
  it('folds Arabic variants and keeps distinct letters apart', () => {
    expect(normalizeSearch('أَمْلُودِيبِين')).toBe(normalizeSearch('املوديبين'));
    expect(normalizeSearch('مستشفى')).toBe(normalizeSearch('مستشفي'));
    expect(normalizeSearch('صداع')).not.toBe(normalizeSearch('سداع'));
    expect(normalizeSearch('Penicillin-V')).toBe('penicillin v');
  });
});

describe('highlight', () => {
  it('marks the matched word in the ORIGINAL text, whatever the spelling or diacritics', () => {
    const text = 'ارتفاع ضَغْط الدم';
    const [r] = highlightRanges(text, 'ضغط');
    expect(text.slice(r.start, r.end)).toBe('ضَغْط');
  });

  it('marks several words and merges overlaps', () => {
    const text = 'Penicillin V tablets';
    const parts = splitByRanges(text, highlightRanges(text, 'penic tablets'));
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['Penic', 'tablets']);
    expect(parts.map((p) => p.text).join('')).toBe(text); // nothing lost or changed
  });

  it('does not light up the middle of words for one or two letters', () => {
    const text = 'Cardiology';
    expect(highlightRanges(text, 'di')).toEqual([]);
    expect(highlightRanges(text, 'ca')).toHaveLength(1);
  });

  it('returns plain text pieces, so markup in a record is never interpreted', () => {
    const text = '<img src=x onerror=alert(1)> aspirin';
    const parts = splitByRanges(text, highlightRanges(text, 'aspirin'));
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.find((p) => p.hit)?.text).toBe('aspirin');
  });
});

describe('SearchSession (debounce, cancel, stale answers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (fetcher: SearchFetch) => {
    const states: SearchState[] = [];
    const s = new SearchSession(fetcher, (x) => states.push(x));
    return { s, states, last: () => states[states.length - 1] };
  };

  it('waits for the pause in typing and asks once for the final text', async () => {
    const fetcher = vi.fn<SearchFetch>(async (q) => ({ ok: true, data: [hit(q)] }));
    const { s, last } = make(fetcher);
    for (const t of ['pe', 'pen', 'peni']) {
      s.setQuery(t);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('peni');
    expect(last().status).toBe('ready');
  });

  it('does not ask below two letters, and clears when the text is cleared', async () => {
    const fetcher = vi.fn<SearchFetch>(async () => ({ ok: true, data: [hit('a')] }));
    const { s, last } = make(fetcher);
    s.setQuery('p');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(last().status).toBe('idle');
    s.setQuery('pen');
    await vi.advanceTimersByTimeAsync(300);
    s.setQuery('');
    expect(last()).toMatchObject({ status: 'idle', hits: [] });
  });

  it('ignores a slow answer that arrives after a newer query, and aborts the old request', async () => {
    const signals: AbortSignal[] = [];
    let release!: (v: { ok: true; data: SearchHit[] }) => void;
    const fetcher: SearchFetch = (q, signal) => {
      signals.push(signal);
      if (q === 'slow') return new Promise((res) => (release = res as typeof release));
      return Promise.resolve({ ok: true, data: [hit('fast')] });
    };
    const { s, last } = make(fetcher);
    s.setQuery('slow');
    await vi.advanceTimersByTimeAsync(300);
    s.setQuery('fast');
    await vi.advanceTimersByTimeAsync(300);
    expect(signals[0].aborted).toBe(true);
    release({ ok: true, data: [hit('slow')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(last().hits.map((h) => h.id)).toEqual(['fast']);
  });

  it('reports an error, and a reset cancels a pending answer', async () => {
    const { s, last } = make(async () => ({ ok: false }));
    s.setQuery('pen');
    await vi.advanceTimersByTimeAsync(300);
    expect(last().status).toBe('error');

    let release!: (v: { ok: true; data: SearchHit[] }) => void;
    const slow = make(() => new Promise((res) => (release = res as typeof release)));
    slow.s.setQuery('pen');
    await vi.advanceTimersByTimeAsync(300);
    slow.s.reset(); // sign-out or leaving the page
    release({ ok: true, data: [hit('late')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(slow.last()).toMatchObject({ status: 'idle', hits: [] });
  });

  it('flush searches at once (Enter) without waiting for the debounce', async () => {
    const fetcher = vi.fn<SearchFetch>(async () => ({ ok: true, data: [] }));
    const { s, last } = make(fetcher);
    s.flush('insulin');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ status: 'ready', total: 0 });
  });
});
