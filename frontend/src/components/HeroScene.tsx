import React, { useEffect, useRef } from 'react';
import { useLang } from '../context/LangContext.js';
import { CheckIcon, LockIcon } from './LineIcon.js';

const ECG =
  'M0 60 H120 L136 60 L148 48 L160 60 H250 L262 60 L274 12 L288 108 L300 30 L310 72 L318 60 H430 L446 60 L458 46 L470 60 H600';

const NodeIcon: React.FC<{ kind: 'user' | 'steth' | 'building' }> = ({ kind }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === 'user' && (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
      </>
    )}
    {kind === 'steth' && (
      <>
        <path d="M6 3v6a4 4 0 0 0 8 0V3" />
        <path d="M10 13v2a4 4 0 0 0 8 0v-1" />
        <circle cx="18" cy="12" r="2" />
      </>
    )}
    {kind === 'building' && (
      <>
        <path d="M4 21V9l8-5 8 5v12" />
        <path d="M9 21v-6h6v6" />
        <path d="M12 8v3M10.5 9.5h3" />
      </>
    )}
  </svg>
);

/**
 * Hero illustration: one record in the middle of a circle of care. The patient sits on the circle with their doctor and any
 * clinic or hospital, and only the record joins them. Drawn from HTML and SVG (no raster asset), so it follows the theme
 * tokens and the language (the picture mirrors in RTL). All patient data shown is synthetic and labelled as such.
 * Nothing here is a metric or a claim.
 */
export const HeroScene: React.FC = () => {
  const { t, isRtl } = useLang();
  const L = t.landing;
  const ref = useRef<HTMLDivElement>(null);

  // Gentle pointer parallax. Skipped on touch screens.
  useEffect(() => {
    const el = ref.current;
    const host = el?.closest('.hero');
    if (!el || !host) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    let raf = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    const onMove = (e: Event) => {
      const p = e as PointerEvent;
      const r = host.getBoundingClientRect();
      set(((p.clientX - r.left) / r.width - 0.5) * 2, ((p.clientY - r.top) / r.height - 0.5) * 2);
    };
    const onLeave = () => set(0, 0);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const dir = isRtl ? 'rtl' : 'ltr';

  return (
    <div ref={ref} className="scene" role="img" aria-label={L.sceneAlt} dir={dir}>
      <div className="scene-group scene-back" aria-hidden="true">
        <div className="scene-disc" />
      </div>

      <div className="scene-group scene-mid" aria-hidden="true">
        <svg className="scene-links" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
          <path d="M27 50 L32 50" />
          <path d="M69 42 L74 29" />
          <path d="M69 58 L74 71" />
        </svg>

        <div className="scene-node" style={{ insetInlineStart: '21%', top: '50%' }}>
          <div className="scene-node-in scene-in scene-float" style={{ ['--d' as string]: '0.35s', ['--fd' as string]: '7s' }}>
            <span className="scene-node-disc"><NodeIcon kind="user" /></span>
            <span className="scene-node-label">{L.nodeYou}</span>
          </div>
        </div>
        <div className="scene-node" style={{ insetInlineStart: '80%', top: '22%' }}>
          <div className="scene-node-in scene-in scene-float" style={{ ['--d' as string]: '0.5s', ['--fd' as string]: '6s', ['--fdl' as string]: '-2s' }}>
            <span className="scene-node-disc"><NodeIcon kind="steth" /></span>
            <span className="scene-node-label">{L.nodeDoctor}</span>
          </div>
        </div>
        <div className="scene-node" style={{ insetInlineStart: '80%', top: '77%' }}>
          <div className="scene-node-in scene-in scene-float" style={{ ['--d' as string]: '0.65s', ['--fd' as string]: '8s', ['--fdl' as string]: '-4s' }}>
            <span className="scene-node-disc"><NodeIcon kind="building" /></span>
            <span className="scene-node-label">{L.nodeAnyCenter}</span>
          </div>
        </div>
      </div>

      <div className="scene-group scene-front" aria-hidden="true">
        <div className="scene-card scene-in scene-float" dir={dir} style={{ ['--d' as string]: '0.25s', ['--fd' as string]: '7.5s' }}>
          <div className="scene-card-label">{L.cardRecord}</div>
          <div className="scene-card-head">
            <span className="scene-avatar" />
            <span className="scene-card-id">
              <span className="scene-card-name" dir="auto">{isRtl ? 'محمد المنصور' : 'Mohammed Al-Mansoor'}</span>
              <span className="scene-card-meta">{L.cardOwner}</span>
            </span>
          </div>
          <span className="scene-badge">
            <CheckIcon />
            <span>{L.cardShareOnly}</span>
          </span>
          <span className="scene-badge scene-badge--soft">
            <LockIcon />
            <span>{L.cardShareExpires}</span>
          </span>
        </div>

        <svg className="scene-ecg scene-in" style={{ ['--d' as string]: '1s' }} viewBox="0 0 600 120" preserveAspectRatio="none" fill="none">
          <path className="scene-ecg-base" d={ECG} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path className="scene-ecg-pulse" d={ECG} pathLength={1} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};
