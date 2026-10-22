import React, { useEffect, useRef } from 'react';
import { useLang } from '../context/LangContext.js';
import { AlertIcon, CheckIcon, LockIcon } from './LineIcon.js';
import { BRAID_BEADS, BRAID_BINS, BRAID_VIEWBOX } from './braid.js';

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
 * Hero illustration: one record connecting patients, clinicians and medical centers.
 * Drawn from HTML and SVG (no raster asset), so it follows the theme and the language.
 * All patient data shown is synthetic and labelled as such. Nothing here is a metric or a claim.
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
    <div ref={ref} className="scene" role="img" aria-label={L.sceneAlt}>
      <div className="scene-group scene-back" aria-hidden="true">
        <div className="scene-disc" />
        <svg className="scene-helix scene-in" style={{ ['--d' as string]: '0.1s' }} viewBox={BRAID_VIEWBOX} fill="none">
          <g fill="none" strokeLinecap="round">
            {BRAID_BINS.map((bin, b) => (
              <g key={b}>
                {bin.map((seg, n) => (
                  <path key={`e${n}`} className="scene-braid-edge" d={seg.d} strokeWidth={15} />
                ))}
                {bin.map((seg, n) => (
                  <path key={`f${n}`} className={`scene-braid-fill scene-braid-s${seg.strand}`} d={seg.d} strokeWidth={13} opacity={0.62 + seg.depth * 0.38} />
                ))}
              </g>
            ))}
          </g>
          {BRAID_BEADS.map((b) => (
            <g key={`${b.strand}-${b.y}`}>
              <circle className="scene-braid-bead-ring" cx={b.x} cy={b.y} r={13} />
              <circle className="scene-braid-bead" cx={b.x} cy={b.y} r={7.5} />
            </g>
          ))}
        </svg>
      </div>

      <div className="scene-group scene-mid" aria-hidden="true">
        <svg className="scene-links" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
          <path d="M13 22 L40 40" />
          <path d="M87 16 L62 34" />
          <path d="M84 80 L62 62" />
        </svg>

        <div className="scene-node" style={{ left: '13%', top: '22%' }}>
          <div className="scene-node-in scene-in scene-float" style={{ ['--d' as string]: '0.35s', ['--fd' as string]: '7s' }}>
            <span className="scene-node-disc"><NodeIcon kind="user" /></span>
            <span className="scene-node-label">{L.nodeYou}</span>
          </div>
        </div>
        <div className="scene-node" style={{ left: '87%', top: '16%' }}>
          <div className="scene-node-in scene-in scene-float" style={{ ['--d' as string]: '0.5s', ['--fd' as string]: '6s', ['--fdl' as string]: '-2s' }}>
            <span className="scene-node-disc"><NodeIcon kind="steth" /></span>
            <span className="scene-node-label">{L.nodeDoctor}</span>
          </div>
        </div>
        <div className="scene-node" style={{ left: '84%', top: '80%' }}>
          <div className="scene-node-in scene-in scene-float" style={{ ['--d' as string]: '0.65s', ['--fd' as string]: '8s', ['--fdl' as string]: '-4s' }}>
            <span className="scene-node-disc"><NodeIcon kind="building" /></span>
            <span className="scene-node-label">{L.nodeAnyCenter}</span>
          </div>
        </div>
      </div>

      <div className="scene-group scene-front" aria-hidden="true">
        <div className="scene-card scene-card--record scene-in scene-float" dir={dir} style={{ ['--d' as string]: '0.25s', ['--fd' as string]: '7.5s' }}>
          <div className="scene-card-label">{L.cardRecord}</div>
          <div className="scene-card-head">
            <span className="scene-avatar" />
            <span className="scene-card-id">
              <span className="scene-card-name" dir="auto">{isRtl ? 'محمد المنصور' : 'Mohammed Al-Mansoor'}</span>
              <span className="scene-card-meta">{L.cardOwner}</span>
            </span>
          </div>
          <span className="scene-bar" style={{ width: '88%' }} />
          <span className="scene-bar" style={{ width: '64%' }} />
          <span className="scene-badge scene-badge--warn">
            <AlertIcon size={14} />
            <span>{L.cardAllergy}</span>
          </span>
        </div>

        <div className="scene-card scene-card--lab scene-in scene-float" dir={dir} style={{ ['--d' as string]: '0.45s', ['--fd' as string]: '6.5s', ['--fdl' as string]: '-3s' }}>
          <svg className="scene-qr" viewBox="0 0 9 9" aria-hidden="true">
            <rect width="9" height="9" rx="1.2" className="scene-qr-paper" />
            <path className="scene-qr-ink" d="M1 1h3v3H1zM5 1h3v3H5zM1 5h3v3H1zM5.2 5.2h1v1h-1zM7 5.2h1v1H7zM6.1 6.1h1v1h-1zM5.2 7h1v1h-1zM7 7h1v1H7z" />
            <path className="scene-qr-hole" d="M2 2h1v1H2zM6 2h1v1H6zM2 6h1v1H2z" />
          </svg>
          <div className="scene-card-label">{L.cardShare}</div>
          <span className="scene-badge scene-badge--ok">
            <CheckIcon />
            <span>{L.cardShareOnly}</span>
          </span>
          <span className="scene-badge scene-badge--info">
            <LockIcon />
            <span>{L.cardShareExpires}</span>
          </span>
        </div>

        <span className="scene-chip scene-in scene-float" style={{ left: '60%', top: '6%', ['--d' as string]: '0.8s', ['--fd' as string]: '5s' }}>
          <LockIcon />
        </span>
        <span className="scene-chip scene-in scene-float" style={{ left: '4%', top: '54%', ['--d' as string]: '0.9s', ['--fd' as string]: '5.5s', ['--fdl' as string]: '-1.5s' }}>
          <CheckIcon />
        </span>

        <svg className="scene-ecg scene-in" style={{ ['--d' as string]: '1s' }} viewBox="0 0 600 120" preserveAspectRatio="none" fill="none">
          <path className="scene-ecg-base" d={ECG} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path className="scene-ecg-pulse" d={ECG} pathLength={1} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};
