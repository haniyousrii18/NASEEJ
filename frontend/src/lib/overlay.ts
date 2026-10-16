import { useEffect, useState } from 'react';

/** Live result of a CSS media query. Used to tell a phone drawer from a desktop sidebar and hover from touch. */
export const useMediaQuery = (query: string): boolean => {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

/**
 * Stops the page behind an overlay from scrolling without moving it: the scroll position is kept (nothing is
 * repositioned) and the scrollbar's width stays reserved, so centred content does not shift sideways when the
 * scrollbar would otherwise disappear.
 */
export const lockScroll = (): (() => void) => {
  const root = document.documentElement;
  const previous = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
  root.style.scrollbarGutter = 'stable';
  root.style.overflow = 'hidden';
  return () => {
    root.style.overflow = previous.overflow;
    root.style.scrollbarGutter = previous.gutter;
  };
};

const FOCUSABLE = 'a[href],button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside `container` while a modal drawer is open. */
export const trapTab = (e: KeyboardEvent, container: HTMLElement | null): void => {
  if (e.key !== 'Tab' || !container) return;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !container.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !container.contains(active))) {
    e.preventDefault();
    first.focus();
  }
};
