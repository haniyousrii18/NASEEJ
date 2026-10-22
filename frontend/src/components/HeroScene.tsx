import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../context/LangContext.js';
import { AlertIcon, CheckIcon, LockIcon } from './LineIcon.js';

/*
 * Hero illustration: the record is the source of truth and the patient decides what leaves it.
 * One record panel, three entries with a visible switch each, and two places that can read what was switched on.
 * Every state is a word plus an icon plus a switch position, so nothing depends on color or motion.
 * Drawn from HTML and SVG (no raster asset), laid out with container queries, and shown in its final state when motion is
 * reduced. The patient data is synthetic and labelled as such; nothing here is a metric or a claim.
 */

const Glyph: React.FC<{ kind: 'user' | 'steth' | 'building' | 'pill' | 'pulse' }> = ({ kind }) => (
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
    {kind === 'pill' && (
      <>
        <rect x="3.5" y="9" width="17" height="6.5" rx="3.25" transform="rotate(-35 12 12.25)" />
        <path d="M9.2 7.6l5.6 7.8" />
      </>
    )}
    {kind === 'pulse' && <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />}
  </svg>
);

/** The size of an element, kept current. The link drawings use it as their own coordinate space. */
const useSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
};

interface Entry {
  key: string;
  icon: 'alert' | 'pill' | 'pulse';
  label: string;
  shared: boolean;
}

export const HeroScene: React.FC = () => {
  const { t, isRtl } = useLang();
  const L = t.landing;
  const dir = isRtl ? 'rtl' : 'ltr';
  const [sideRef, side] = useSize();
  const [downRef, down] = useSize();
  const r = (f: number) => (side.h * f).toFixed(1);
  const curve = (from: number, to: number) => `M0 ${r(from)} C${(side.w / 2).toFixed(1)} ${r(from)} ${(side.w / 2).toFixed(1)} ${r(to)} ${side.w.toFixed(1)} ${r(to)}`;

  const entries: Entry[] = [
    { key: 'allergy', icon: 'alert', label: L.cardAllergy, shared: true },
    { key: 'meds', icon: 'pill', label: L.sceneMeds, shared: true },
    { key: 'symptoms', icon: 'pulse', label: L.sceneSymptoms, shared: false },
  ];

  return (
    <div className="scene" role="img" aria-label={L.sceneAlt} dir={dir}>
      <div className="scene-board" aria-hidden="true">
        {/* 1. the record */}
        <div className="scene-record" />
        <div className="scene-head">
          <span className="scene-avatar">
            <Glyph kind="user" />
          </span>
          <span className="scene-id">
            <span className="scene-name">
              <span dir="auto">{isRtl ? 'محمد المنصور' : 'Mohammed Al-Mansoor'}</span>
              <span className="scene-you">{L.nodeYou}</span>
            </span>
            <span className="scene-sub">{L.cardRecord}</span>
          </span>
        </div>

        {entries.map((e, i) => (
          <div key={e.key} className={`scene-entry scene-entry--${i + 1}${e.shared ? ' is-shared' : ''}`}>
            <span className="scene-entry-icon">{e.icon === 'alert' ? <AlertIcon size={18} /> : <Glyph kind={e.icon} />}</span>
            <span className="scene-entry-main">
              <span className="scene-entry-label">{e.label}</span>
              <span className="scene-state">
                {e.shared ? <CheckIcon /> : <LockIcon />}
                {e.shared ? L.sceneShared : L.sceneNotShared}
              </span>
            </span>
            <span className="scene-switch">
              <span className="scene-knob" />
            </span>
          </div>
        ))}

        {/* 2. the secure links: only the switched-on entries reach a reader */}
        <div className="scene-gap scene-gap--side" ref={sideRef}>
          {side.w > 0 && (
            <svg viewBox={`0 0 ${side.w} ${side.h}`} fill="none">
              <path className="scene-link scene-link--a" pathLength={1} d={curve(0.167, 0.25)} />
              <path className="scene-link scene-link--b" pathLength={1} d={curve(0.5, 0.25)} />
              <path className="scene-link scene-link--c" pathLength={1} d={curve(0.167, 0.75)} />
              <path className="scene-pulse scene-link--a" pathLength={1} d={curve(0.167, 0.25)} />
              <path className="scene-pulse scene-link--b" pathLength={1} d={curve(0.5, 0.25)} />
              <path className="scene-pulse scene-link--c" pathLength={1} d={curve(0.167, 0.75)} />
              <path className="scene-stub" d={`M0 ${r(0.833)} H${(side.w * 0.34).toFixed(1)}`} />
            </svg>
          )}
          <span className="scene-port" style={{ top: '16.7%' }} />
          <span className="scene-port" style={{ top: '50%' }} />
          <span className="scene-port scene-port--off" style={{ top: '83.3%' }} />
          <span className="scene-stop" style={{ top: '83.3%' }} />
          <span className="scene-port scene-port--end" style={{ top: '25%' }} />
          <span className="scene-port scene-port--end" style={{ top: '75%' }} />
        </div>
        <div className="scene-gap scene-gap--down" ref={downRef}>
          {down.w > 0 && (
            <svg viewBox={`0 0 ${down.w} ${down.h}`} fill="none">
              <path className="scene-link scene-link--a" pathLength={1} d={`M${down.w / 2} 0 V${down.h * 0.45} M${down.w / 2} ${down.h * 0.45} H${down.w * 0.25} V${down.h} M${down.w / 2} ${down.h * 0.45} H${down.w * 0.75} V${down.h}`} />
            </svg>
          )}
        </div>

        {/* 3. the readers */}
        <div className="scene-dest scene-dest--doctor">
          <span className="scene-dest-icon">
            <Glyph kind="steth" />
          </span>
          <span className="scene-dest-text">
            <span className="scene-dest-name">{L.nodeDoctor}</span>
            <span className="scene-dest-sub">{L.sceneReadOnly}</span>
          </span>
        </div>
        <div className="scene-dest scene-dest--center">
          <span className="scene-dest-icon">
            <Glyph kind="building" />
          </span>
          <span className="scene-dest-text">
            <span className="scene-dest-name">{L.nodeAnyCenter}</span>
            <span className="scene-dest-sub">{L.sceneReadOnly}</span>
          </span>
        </div>

        <div className="scene-foot">
          <span className="scene-chip">
            <CheckIcon />
            {L.cardShareOnly}
          </span>
          <span className="scene-chip">
            <LockIcon />
            {L.cardShareExpires}
          </span>
        </div>
      </div>
    </div>
  );
};
