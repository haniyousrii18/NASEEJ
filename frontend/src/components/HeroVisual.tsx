import React, { useEffect, useRef } from 'react';
import { useLang } from '../context/LangContext.js';
import { WovenField } from './WovenField.js';

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
 * Visual side of the hero: the woven-network sculpture (a live canvas, the logo's mark in light) above a frosted glass
 * preview of a record. The card is decorative and synthetic; its states still read as word + glyph, as in the app.
 * The card tilts toward the pointer on devices that hover.
 */
export const HeroVisual: React.FC = () => {
  const { t } = useLang();
  const L = t.landing;
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = card.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        el.style.setProperty('--tilt-x', `${(-y * 8).toFixed(2)}deg`);
        el.style.setProperty('--tilt-y', `${(x * 10).toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div className="hero-visual">
      <div className="hero-stage" aria-hidden="true">
        <WovenField variant="sculpture" interactive className="hero-sculpture" />
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
      <p className="hero-visual-note">{L.heroSyntheticNote}</p>
    </div>
  );
};
