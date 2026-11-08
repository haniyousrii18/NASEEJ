import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../AppIcons.js';
import { fill, formatDate } from '../format.js';
import { useA } from '../useA.js';
import { highlightRanges, splitByRanges } from './highlight.js';
import { type SearchHit } from './session.js';
import { useSearch } from './useSearch.js';

/** Text with the matched words in <mark>. Built from React nodes, so record text is never read as HTML. */
export const Marked: React.FC<{ text: string; query: string }> = ({ text, query }) => (
  <>
    {splitByRanges(text, highlightRanges(text, query)).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>))}
  </>
);

interface Props {
  onSelect: (hit: SearchHit) => void;
  types?: string[];
  limit?: number;
  label: string;
  placeholder: string;
  autoFocus?: boolean;
}

/**
 * Search-as-you-type for the whole record (WAI-ARIA combobox with a listbox popup).
 * Keys: ArrowDown/ArrowUp move (wrapping), Home/End jump, Enter opens the active suggestion (or searches now), Esc closes, then clears.
 * Suggestions are grouped by kind of record; each shows the ORIGINAL stored text with the matched words marked.
 */
export const SearchCombobox: React.FC<Props> = ({ onSelect, types, limit = 12, label, placeholder, autoFocus }) => {
  const A = useA();
  const T = A.health.assistant.search;
  const { state, setQuery, flush, reset } = useSearch({ types, limit });
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const uid = useId();
  const listId = `${uid}-list`;
  const wrap = useRef<HTMLDivElement>(null);

  const kindOf = (type: string) => (type.startsWith('clinician_') ? 'clinician' : type);
  const typeLabel = (type: string) => (T.types as Record<string, string>)[kindOf(type)] ?? type;
  const groups = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, Array<{ hit: SearchHit; index: number }>>();
    state.hits.forEach((hit, index) => {
      const k = kindOf(hit.type);
      if (!by.has(k)) {
        by.set(k, []);
        order.push(k);
      }
      by.get(k)!.push({ hit, index });
    });
    return order.map((type) => ({ type, items: by.get(type)! }));
  }, [state.hits]);
  // Keyboard order follows what is on screen (grouped), not the score order.
  const flat = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.hit)), [groups]);

  useEffect(() => setActive(-1), [state.hits]);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const typed = text.trim().length >= 2;
  const showPanel = open && typed && state.status !== 'idle';
  const optionId = (i: number) => `${uid}-o${i}`;

  const choose = (hit: SearchHit) => {
    setOpen(false);
    onSelect(hit);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = flat.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === 'Home' && showPanel && active >= 0) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && showPanel && active >= 0) {
      e.preventDefault();
      setActive(n - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showPanel && active >= 0 && flat[active]) choose(flat[active]);
      else {
        setOpen(true);
        flush(text);
      }
    } else if (e.key === 'Escape') {
      if (showPanel) {
        e.preventDefault();
        setOpen(false);
      } else if (text) {
        e.preventDefault();
        setText('');
        reset();
      }
    }
  };

  const status = !typed ? '' : state.status === 'loading' ? T.loading : state.status === 'error' ? T.error : state.hits.length === 0 ? fill(T.noneFor, { q: state.query }) : fill(T.count, { n: state.hits.length });

  return (
    <div className="hp-sc" ref={wrap}>
      <div className="hp-lib-search hp-sc-field">
        <AppIcon name="search" size={19} className="hp-lib-search-icon" />
        <input
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          aria-label={label}
          aria-describedby={`${uid}-keys`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          dir="auto"
          value={text}
          placeholder={placeholder}
          maxLength={100}
          autoFocus={autoFocus}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setQuery(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {state.status === 'loading' && typed && <span className="hp-sc-spin" aria-hidden="true" />}
        {text && (
          <button
            type="button"
            className="hp-lib-clear"
            aria-label={T.clear}
            onClick={() => {
              setText('');
              reset();
            }}
          >
            <AppIcon name="close" size={16} />
          </button>
        )}
      </div>
      <p id={`${uid}-keys`} className="hp-visually-hidden">
        {T.keys}
      </p>
      <p className="hp-visually-hidden" role="status" aria-live="polite">
        {status}
      </p>

      {showPanel && (
        <div className="hp-sc-panel">
          {state.status === 'error' ? (
            <div className="hp-sc-note" data-tone="danger">
              <span>{T.error}</span>
              <button type="button" className="hp-lib-reset" onClick={() => flush(text)}>
                {T.retry}
              </button>
            </div>
          ) : state.hits.length === 0 ? (
            <div className="hp-sc-note" aria-hidden={state.status === 'loading'}>
              {state.status === 'loading' ? T.loading : fill(T.noneFor, { q: state.query })}
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label={T.suggestions} className="hp-sc-list" data-stale={state.status === 'loading' || undefined}>
              {groups.map((g) => (
                <li key={g.type} role="presentation" className="hp-sc-group">
                  <ul role="group" aria-label={typeLabel(g.type)}>
                    <li role="presentation" className="hp-sc-head" aria-hidden="true">
                      {typeLabel(g.type)}
                    </li>
                    {g.items.map(({ hit }) => {
                      const i = flat.indexOf(hit);
                      const via = hit.matched.via !== 'original' ? (T.via as Record<string, string>)[hit.matched.via] : '';
                      return (
                        <li
                          key={hit.ref}
                          id={optionId(i)}
                          role="option"
                          aria-selected={i === active}
                          className="hp-sc-opt"
                          data-active={i === active || undefined}
                          onMouseMove={() => active !== i && setActive(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => choose(hit)}
                        >
                          <span className="hp-sc-main">
                            <strong dir="auto">
                              <Marked text={hit.title} query={state.query} />
                            </strong>
                            {hit.summary && (
                              <span className="hp-sc-sum" dir="auto">
                                <Marked text={hit.summary} query={state.query} />
                              </span>
                            )}
                            {via && <span className="hp-sc-via">{via}</span>}
                          </span>
                          {hit.date && <span className="hp-sc-date">{formatDate(A.lang, hit.date)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <p className="hp-sc-keys" aria-hidden="true">
            {T.keys}
          </p>
        </div>
      )}
    </div>
  );
};
