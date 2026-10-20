import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../context/LangContext.js';

/**
 * The one dropdown of the app. It replaces the native <select> so every menu looks and behaves the same:
 * a field-like trigger, and a list of large rows with a radio mark at the end (the selected row is outlined).
 * It is written as a drop-in: pass <option> children and an onChange that reads `e.target.value`.
 *
 * Behaviour: opens below the field (above when there is no room), is rendered outside the page flow so a dialog or
 * a side sheet never clips it, becomes a bottom sheet on phones, and is fully keyboard operable (Enter, Space or
 * the arrow keys open it; arrows, Home, End and typing move; Enter chooses; Escape or Tab closes). It follows the
 * ARIA combobox/listbox pattern, so a screen reader announces the label, the value and "n of m".
 */
interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}

export interface SelectProps {
  id?: string;
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  placeholder?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-required'?: boolean | 'true' | 'false';
}

const text = (node: React.ReactNode): string =>
  React.Children.toArray(node)
    .map((n) => (typeof n === 'string' || typeof n === 'number' ? String(n) : React.isValidElement(n) ? text((n.props as { children?: React.ReactNode }).children) : ''))
    .join('');

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

export const Select: React.FC<SelectProps> = ({ id, value, onChange, children, className, disabled, name, placeholder, ...aria }) => {
  const { isRtl } = useLang();
  const uid = useId();
  const triggerId = id ?? `sel-${uid}`;
  const listId = `${triggerId}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const sheet = useSheet();
  const typed = useRef({ text: '', at: 0 });

  const options: Opt[] = useMemo(
    () =>
      React.Children.toArray(children)
        .filter((c): c is React.ReactElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }> => React.isValidElement(c) && c.type === 'option')
        .map((c) => ({ value: String(c.props.value ?? text(c.props.children)), label: text(c.props.children), disabled: !!c.props.disabled })),
    [children],
  );
  const current = options.findIndex((o) => o.value === String(value));
  const shown = current >= 0 ? options[current].label : placeholder ?? options[0]?.label ?? '';

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el || sheet) return setPos(null);
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 240), vw - 16);
    let left = isRtl ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, vw - width - 8));
    const below = vh - r.bottom - 14;
    const above = r.top - 14;
    const want = Math.min(options.length * 60 + 16, 360);
    if (below >= want || below >= above) setPos({ top: r.bottom + 6, left, width, maxHeight: Math.min(360, Math.max(140, below)) });
    else setPos({ bottom: vh - r.top + 6, left, width, maxHeight: Math.min(360, Math.max(140, above)) });
  }, [isRtl, options.length, sheet]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  // Focus moves into the list while it is open, and the highlighted row is kept in view.
  useEffect(() => {
    if (open) list.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openMenu = (from?: number) => {
    if (disabled) return;
    setActive(Math.max(0, from ?? (current >= 0 ? current : 0)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    close();
    if (o.value !== String(value)) onChange({ target: { value: o.value } });
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= options.length; k++) {
      const i = (from + dir * k + options.length * 2) % options.length;
      if (!options[i].disabled) return i;
    }
    return from;
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => step(a, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => step(a, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(step(0, -1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        // Closes only the menu: a dialog or sheet around the field stays open.
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const now = Date.now();
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
          const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
          if (hit >= 0) setActive(hit);
        }
    }
  };

  const menu = open && (
    <>
      {sheet && <div className="sel-scrim" onMouseDown={() => close()} aria-hidden="true" />}
      {!sheet && <div className="sel-catch" onMouseDown={() => close()} aria-hidden="true" />}
      <ul
        ref={list}
        id={listId}
        role="listbox"
        tabIndex={-1}
        className={sheet ? 'sel-pop sel-sheet' : 'sel-pop'}
        aria-label={aria['aria-label']}
        aria-activedescendant={`${triggerId}-o${active}`}
        onKeyDown={onListKey}
        style={!sheet && pos ? { top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : undefined}
      >
        {options.map((o, i) => (
          <li
            key={`${o.value}-${i}`}
            id={`${triggerId}-o${i}`}
            data-i={i}
            role="option"
            aria-selected={i === current}
            aria-disabled={o.disabled || undefined}
            className="sel-opt"
            data-active={i === active}
            data-selected={i === current}
            onMouseMove={() => i !== active && !o.disabled && setActive(i)}
            onClick={() => choose(i)}
          >
            <span className="sel-opt-label" dir="auto">
              {o.label || '—'}
            </span>
            <span className="sel-radio" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        className={`na-select sel-trigger${className ? ` ${className}` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        data-open={open}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
        {...aria}
      >
        <span className="sel-value" data-empty={current < 0 && !!placeholder}>
          {shown}
        </span>
      </button>
      {name && <input type="hidden" name={name} value={String(value)} />}
      {menu && createPortal(menu, document.querySelector('.na-app') ?? document.body)}
    </>
  );
};
