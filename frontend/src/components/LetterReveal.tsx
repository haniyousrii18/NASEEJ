import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Writes a word in letter by letter. Arabic letters join, so each letter cannot sit in its own box: that would break
 * the word into isolated forms. Instead the word is laid out once, each letter's slice of it is measured, and one copy
 * of the whole word per letter is clipped to that slice and animated on its own. Every letter keeps its joined shape.
 * After the last letter lands, a band of light runs across the word once.
 * Screen readers read the plain word. Without measurements (or with reduced motion) the plain word shows as is.
 */
type Slice = { l: number; r: number };

const graphemes = (text: string): { start: number; end: number }[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ index: number; segment: string }> } }).Segmenter;
  if (Seg) {
    return [...new Seg(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => ({ start: s.index, end: s.index + s.segment.length }));
  }
  return [...text].reduce<{ start: number; end: number }[]>((acc, ch) => {
    const start = acc.length ? acc[acc.length - 1].end : 0;
    acc.push({ start, end: start + ch.length });
    return acc;
  }, []);
};

export const LetterReveal: React.FC<{ text: string; className?: string; delay?: number }> = ({ text, className, delay = 0 }) => {
  const base = useRef<HTMLSpanElement>(null);
  const [slices, setSlices] = useState<Slice[] | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = base.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    const measure = () => {
      const node = el.firstChild;
      if (!alive || !node || node.nodeType !== Node.TEXT_NODE) return;
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      const parts = graphemes(text)
        .filter(({ start, end }) => text.slice(start, end).trim() !== '')
        .map(({ start, end }) => {
          range.setStart(node, start);
          range.setEnd(node, end);
          const r = range.getBoundingClientRect();
          return { l: r.left - box.left, r: r.right - box.left };
        });
      if (parts.length && parts.every((p) => p.r > p.l)) {
        setWidth(box.width);
        setSlices(parts);
      }
    };
    measure();
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [text]);

  const ready = slices !== null;
  const last = ready ? slices.length - 1 : 0;

  return (
    <span className={`lr${ready ? ' lr--ready' : ''}${className ? ` ${className}` : ''}`} aria-label={text} role="text" style={{ '--lr-delay': `${delay}s`, '--lr-count': last + 1 } as React.CSSProperties}>
      <span className="lr-word">
        <span ref={base} className="lr-base" aria-hidden="true">
          {text}
        </span>
        {ready &&
          slices.map((s, i) => (
            <span
              key={i}
              className="lr-piece"
              aria-hidden="true"
              style={
                {
                  '--i': i,
                  // half a pixel of overlap on each side hides seams where joined letters meet
                  clipPath: `inset(-40% ${Math.max(0, width - s.r - 0.5)}px -40% ${Math.max(0, s.l - 0.5)}px)`,
                } as React.CSSProperties
              }
            >
              {text}
            </span>
          ))}
        {ready && (
          <span className="lr-shine" aria-hidden="true">
            {text}
          </span>
        )}
      </span>
    </span>
  );
};
