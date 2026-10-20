import React, { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useA } from './useA.js';
import { AppIcon } from './AppIcons.js';
import { formatDate, localeOf, todayIso } from './format.js';

/**
 * The one calendar of the app. It replaces <input type="date"> so every date field looks and behaves the same:
 * a field-like trigger, and a calendar with a month header, a grid of days (days outside min/max are struck through),
 * a month/year switcher, and Clear / Today at the foot. It is a drop-in: value is `yyyy-mm-dd` or '', and onChange
 * reads `e.target.value`.
 *
 * Behaviour: opens below the field (above when there is no room), is rendered outside the page flow so a modal never
 * clips it, becomes a bottom sheet on phones, and is keyboard operable (arrows move by day or week, PageUp/PageDown
 * by month, Home/End to the week edges, Enter or Space chooses, Escape closes only the calendar, Tab stays inside).
 */
export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-required'?: boolean | 'true' | 'false';
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => {
  const t = new Date(y, m, d);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};

const AR_DAYS = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

const useSheet = () => {
  const [sheet, setSheet] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setSheet(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return sheet;
};

const Chevron: React.FC<{ dir: 'prev' | 'next' | 'down' }> = ({ dir }) => (
  <svg className={`dp-chev dp-chev--${dir}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'down' ? <path d="M6 9l6 6 6-6" /> : dir === 'prev' ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
  </svg>
);

export const DatePicker: React.FC<DatePickerProps> = ({ id, value, onChange, min, max, className, disabled, autoFocus, placeholder, ...aria }) => {
  const A = useA();
  const C = A.health.common;
  const { lang, isRtl } = A;
  const locale = localeOf(lang);
  const uid = useId();
  const triggerId = id ?? `dp-${uid}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const sheet = useSheet();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months'>('days');
  const [cursor, setCursor] = useState(() => parse(value) ?? parse(todayIso())!); // the focused day
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const [focusDay, setFocusDay] = useState(false);

  const today = todayIso();
  const out = (v: string) => (!!min && v < min) || (!!max && v > max);
  const nf = new Intl.NumberFormat(locale, { useGrouping: false });
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  const dayLong = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const weekdays = Array.from({ length: 7 }, (_, i) => (lang === 'ar' ? AR_DAYS[i] : weekdayShort.format(new Date(2023, 0, 1 + i))));

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el || sheet) return setPos(null);
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(352, vw - 16);
    let left = isRtl ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, vw - width - 8));
    const want = pop.current?.scrollHeight || 420;
    const below = vh - r.bottom - 14;
    const above = r.top - 14;
    const maxHeight = vh - 16;
    // beside the field when it fits below or above; otherwise centred in the window so nothing needs to scroll
    if (below >= want) setPos({ top: r.bottom + 6, left, width, maxHeight });
    else if (above >= want) setPos({ bottom: vh - r.top + 6, left, width, maxHeight });
    else setPos({ top: Math.max(8, (vh - Math.min(want, maxHeight)) / 2), left, width, maxHeight });
  }, [isRtl, sheet]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // Focus goes to the highlighted day when the calendar opens and whenever the keyboard moves it.
  useEffect(() => {
    if (!open || view !== 'days') return;
    if (!focusDay) return;
    pop.current?.querySelector<HTMLElement>(`[data-date="${iso(cursor.y, cursor.m, cursor.d)}"]`)?.focus({ preventScroll: true });
  }, [open, view, cursor, focusDay]);

  useEffect(() => {
    if (autoFocus) trigger.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const openCal = () => {
    if (disabled) return;
    const base = parse(value) ?? parse(max && max < today ? max : min && min > today ? min : today)!;
    setCursor(base);
    setView('days');
    setFocusDay(true);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (v: string) => {
    if (out(v)) return;
    close();
    if (v !== value) onChange({ target: { value: v } } as React.ChangeEvent<HTMLInputElement>);
  };

  const moveTo = (y: number, m: number, d: number, focus = true) => {
    const t = new Date(y, m, d);
    setCursor({ y: t.getFullYear(), m: t.getMonth(), d: t.getDate() });
    setFocusDay(focus);
  };
  const shiftMonth = (by: number, focus = true) => {
    const last = new Date(cursor.y, cursor.m + by + 1, 0).getDate();
    moveTo(cursor.y, cursor.m + by, Math.min(cursor.d, last), focus);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (view === 'months') setView('days');
      else close();
      return;
    }
    if (e.key === 'Tab') {
      const items = Array.from(pop.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? []);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (view !== 'days' || !(e.target as HTMLElement).closest('[data-date]')) return;
    const { y, m, d } = cursor;
    const step = (dx: number) => {
      e.preventDefault();
      moveTo(y, m, d + dx);
    };
    switch (e.key) {
      case 'ArrowLeft':
        return step(isRtl ? 1 : -1);
      case 'ArrowRight':
        return step(isRtl ? -1 : 1);
      case 'ArrowUp':
        return step(-7);
      case 'ArrowDown':
        return step(7);
      case 'Home':
        return step(-new Date(y, m, d).getDay());
      case 'End':
        return step(6 - new Date(y, m, d).getDay());
      case 'PageUp':
        e.preventDefault();
        return shiftMonth(e.shiftKey ? -12 : -1);
      case 'PageDown':
        e.preventDefault();
        return shiftMonth(e.shiftKey ? 12 : 1);
    }
  };

  // 6 weeks, starting on Sunday, so the grid never changes height between months.
  const first = new Date(cursor.y, cursor.m, 1);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const t = new Date(cursor.y, cursor.m, 1 - first.getDay() + i);
    return { v: iso(t.getFullYear(), t.getMonth(), t.getDate()), day: t.getDate(), inMonth: t.getMonth() === cursor.m, date: t };
  });

  const panel = open && (
    <>
      {sheet ? <div className="sel-scrim" onMouseDown={() => close()} aria-hidden="true" /> : <div className="sel-catch" onMouseDown={() => close()} aria-hidden="true" />}
      <div
        ref={pop}
        role="dialog"
        aria-modal="true"
        aria-label={aria['aria-label'] ?? C.pickDate}
        tabIndex={-1}
        className={sheet ? 'dp-pop dp-sheet' : 'dp-pop'}
        onKeyDown={onKey}
        style={!sheet && pos ? { top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : undefined}
      >
        <div className="dp-head">
          <button type="button" className="dp-nav" aria-label={view === 'days' ? C.prevMonth : C.prevYear} onClick={() => (view === 'days' ? shiftMonth(-1, false) : moveTo(cursor.y - 1, cursor.m, 1, false))}>
            <Chevron dir="prev" />
          </button>
          <button type="button" className="dp-title" aria-live="polite" aria-expanded={view === 'months'} aria-label={C.chooseMonth} onClick={() => setView((v) => (v === 'days' ? 'months' : 'days'))}>
            <span>{view === 'days' ? monthTitle.format(new Date(cursor.y, cursor.m, 1)) : nf.format(cursor.y)}</span>
            <Chevron dir="down" />
          </button>
          <button type="button" className="dp-nav" aria-label={view === 'days' ? C.nextMonth : C.nextYear} onClick={() => (view === 'days' ? shiftMonth(1, false) : moveTo(cursor.y + 1, cursor.m, 1, false))}>
            <Chevron dir="next" />
          </button>
        </div>

        {view === 'days' ? (
          <table className="dp-grid" role="grid" aria-label={monthTitle.format(new Date(cursor.y, cursor.m, 1))}>
            <thead>
              <tr>
                {weekdays.map((w, i) => (
                  <th key={i} scope="col" className="dp-wd">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, r) => (
                <tr key={r}>
                  {cells.slice(r * 7, r * 7 + 7).map((c) => {
                    const disabledDay = out(c.v);
                    const focused = c.v === iso(cursor.y, cursor.m, cursor.d);
                    return (
                      <td key={c.v} role="gridcell" aria-selected={c.v === value}>
                        <button
                          type="button"
                          className="dp-day"
                          data-date={c.v}
                          data-outside={!c.inMonth || undefined}
                          data-today={c.v === today || undefined}
                          data-selected={c.v === value || undefined}
                          data-out={disabledDay || undefined}
                          aria-disabled={disabledDay || undefined}
                          aria-current={c.v === today ? 'date' : undefined}
                          aria-label={dayLong.format(c.date)}
                          tabIndex={focused ? 0 : -1}
                          onClick={() => choose(c.v)}
                        >
                          {nf.format(c.day)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="dp-months" role="group" aria-label={C.chooseMonth}>
            {Array.from({ length: 12 }, (_, m) => {
              const lo = iso(cursor.y, m, 1);
              const hi = iso(cursor.y, m + 1, 0);
              const none = (!!min && hi < min) || (!!max && lo > max);
              const sel = parse(value);
              return (
                <button
                  key={m}
                  type="button"
                  className="dp-month"
                  data-selected={(sel && sel.y === cursor.y && sel.m === m) || undefined}
                  data-out={none || undefined}
                  aria-disabled={none || undefined}
                  onClick={() => {
                    if (none) return;
                    moveTo(cursor.y, m, 1);
                    setView('days');
                  }}
                >
                  {monthName.format(new Date(cursor.y, m, 1))}
                </button>
              );
            })}
          </div>
        )}

        <div className="dp-foot">
          <button type="button" className="dp-link dp-link--muted" disabled={!value} onClick={() => { close(); onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>); }}>
            {C.clearDate}
          </button>
          <button type="button" className="dp-link" disabled={out(today)} onClick={() => choose(today)}>
            {C.today}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        className={`na-input sel-trigger dp-trigger${className ? ` ${className}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        data-open={open}
        onClick={() => (open ? close() : openCal())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            openCal();
          }
        }}
        {...aria}
      >
        <span className="sel-value" data-empty={!value}>
          {value ? formatDate(lang, value) : placeholder ?? C.pickDate}
        </span>
        <AppIcon name="calendar" size={18} className="dp-trigger-icon" />
      </button>
      {panel && createPortal(panel, document.querySelector('.na-app') ?? document.body)}
    </>
  );
};
