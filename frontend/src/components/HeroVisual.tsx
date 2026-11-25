import React, { useEffect, useRef } from 'react';
import { useLang } from '../context/LangContext.js';

const RowIcon: React.FC<{ k: number }> = ({ k }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {k === 0 && (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    )}
    {k === 1 && <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9" />}
    {k === 2 && (
      <>
        <rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-40 12 12)" />
        <path d="M9.6 8.4l6 6" />
      </>
    )}
    {k === 3 && (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M8 3v4M16 3v4M9 14h.01M12 14h.01M15 14h.01" />
      </>
    )}
  </svg>
);

/**
 * The record illustration, split into layers so parts of it move on their own: the QR tile floats over the open book,
 * the five organ bubbles breathe on the ring, a spark runs along the front of the ring, light flows down from the QR
 * into the book. Layers are WebP images set as CSS backgrounds per theme (public/hero, made from one source picture),
 * so only the active theme's files download. Every motion is a transform or opacity change: no canvas, no script loop.
 * Boxes are percent of the square canvas (public/hero/layers.json).
 */
/* `a`: where the bubble sits on the ring, in degrees clockwise from its right end (the spark's start). The spark
   reaches it at a / 360 of a lap, and the bubble lights up then. */
const BUBBLES = [
  { k: 'heart', left: 6.619, top: 43.86, size: 11.802, a: 213 },
  { k: 'joint', left: 81.579, top: 44.338, size: 11.802, a: 328 },
  { k: 'brain', left: 8.373, top: 66.268, size: 13.716, a: 145.4 },
  { k: 'kidney', left: 77.751, top: 66.268, size: 13.716, a: 34.7 },
  { k: 'lungs', left: 42.344, top: 74.482, size: 14.992, a: 90.4 },
] as const;

const RecordArt: React.FC = () => (
  <div className="hero-art">
    <div className="hero-art-layer hero-art-base" />
    <div className="hero-art-flow">
      <i />
      <i />
    </div>
    <div className="hero-art-orbit">
      {/* the spark and two fading trail beads */}
      {[0, 1, 2].map((n) => (
        <div key={n} className="hero-art-orbit-turn" style={{ '--n': n } as React.CSSProperties}>
          <i />
        </div>
      ))}
    </div>
    {BUBBLES.map((b, i) => (
      <div
        key={b.k}
        className={`hero-art-layer hero-art-bubble hero-art-${b.k}`}
        style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.size}%`, height: `${b.size}%`, '--i': i, '--a': b.a } as React.CSSProperties}
      />
    ))}
    <div className="hero-art-layer hero-art-qr" />
    <div className="hero-art-motes">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <i key={i} style={{ '--i': i } as React.CSSProperties} />
      ))}
    </div>
  </div>
);

/**
 * Visual side of the hero: the record illustration standing on a glass floor, with a frosted glass preview of a record
 * in front of it. The card is decorative and synthetic; its states still read as word + glyph, as in the app.
 * The card tilts toward the pointer on devices that hover.
 */
export const HeroVisual: React.FC = () => {
  const { t } = useLang();
  const L = t.landing;
  const card = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  // Every loop in the scene pauses while the hero is off screen, so scrolling the rest of the page costs nothing.
  // All of them pause and resume together, so the spark and the bubbles it lights stay on the same clock.
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.removeAttribute('data-idle');
      else el.setAttribute('data-idle', '');
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The card leans toward the pointer, but only while the pointer is over the scene: anywhere else on the page a
  // pointer move does no work at all. The lean is written straight to the card's transform (one element, no custom
  // properties), at most once a frame, and eases back when the pointer leaves.
  useEffect(() => {
    const el = card.current;
    const area = stage.current;
    if (!el || !area || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let inside = false;
    let box: DOMRect | null = null;
    // scrolling or resizing only marks the box stale; it is measured again on the next pointer move
    const remeasure = () => {
      box = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!box) box = area.getBoundingClientRect();
      const over = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
      if (!over) {
        if (inside) {
          inside = false;
          cancelAnimationFrame(raf);
          el.style.transform = '';
        }
        return;
      }
      inside = true;
      cancelAnimationFrame(raf);
      const b = box;
      raf = requestAnimationFrame(() => {
        const x = (e.clientX - b.left) / b.width - 0.5;
        const y = (e.clientY - b.top) / b.height - 0.5;
        const rtl = document.documentElement.dir === 'rtl';
        el.style.transform = `rotateX(${(16 - y * 8).toFixed(2)}deg) rotateY(${((rtl ? 13 : -13) + x * 10).toFixed(2)}deg) rotateZ(${rtl ? 1.5 : -1.5}deg)`;
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', remeasure, { passive: true });
    window.addEventListener('resize', remeasure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', remeasure);
      window.removeEventListener('resize', remeasure);
    };
  }, []);

  return (
    <div className="hero-visual">
      <div className="hero-stage" aria-hidden="true" ref={stage}>
        <RecordArt />
        <div className="hero-card" ref={card}>
          <div className="hero-card-glass">
            <p className="hero-card-title">{L.heroCardTitle}</p>
            <ul className="hero-card-rows">
              {L.heroCardRows.map((label, k) => (
                <li key={label} style={{ '--i': k } as React.CSSProperties}>
                  <span className="hero-card-icon">
                    <RowIcon k={k} />
                  </span>
                  <span className="hero-card-label">{label}</span>
                  <span className="hero-card-bar" />
                  <span className="hero-card-state" data-state={k === 0 ? 'review' : k === 1 ? 'ok' : 'none'} title={k === 0 ? L.heroCardReview : k === 1 ? L.heroCardConfirmed : undefined}>
                    {k === 0 ? '◌' : k === 1 ? '✓' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
