import { useEffect, useRef } from 'react';

interface Handlers {
  enabled: boolean;
  onSearch: () => void;
  onHelp: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDashboard: () => void;
  onFocusMode: () => void;
}

const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable;
};

/**
 * Doctor shortcuts. Single keys are matched on `event.code` (physical key), so they work on Arabic
 * and Latin layouts alike, and never fire while typing in a field or while a dialog is open.
 * Ctrl/Cmd+K is the only chord that works while typing, to open patient search.
 */
export function useDoctorShortcuts(h: Handlers) {
  const ref = useRef(h);
  ref.current = h;
  const gPending = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = ref.current;
      if (!c.enabled) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        c.onSearch();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      if (e.code === 'Slash' && e.shiftKey) { e.preventDefault(); c.onHelp(); return; }
      if (e.code === 'Slash') { e.preventDefault(); c.onSearch(); return; }
      if (e.code === 'BracketLeft') { c.onPrev(); return; }
      if (e.code === 'BracketRight') { c.onNext(); return; }
      if (e.code === 'KeyF') { c.onFocusMode(); return; }

      if (e.code === 'KeyG') {
        if (gPending.current) window.clearTimeout(gPending.current);
        gPending.current = window.setTimeout(() => { gPending.current = null; }, 1200);
        return;
      }
      if (e.code === 'KeyD' && gPending.current) {
        window.clearTimeout(gPending.current);
        gPending.current = null;
        c.onDashboard();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
