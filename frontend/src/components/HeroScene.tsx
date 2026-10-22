import React from 'react';
import { useLang } from '../context/LangContext.js';
import { CheckIcon } from './LineIcon.js';

/*
 * Hero illustration, kept deliberately small: the record is one panel of lines, the patient chooses two of them, and those
 * two lines leave the panel and reach a doctor and any clinic or hospital. Nothing else is drawn.
 * SVG for the shapes, HTML for the labels and icons (crisp text, no flipped glyphs in RTL); the SVG mirrors in RTL and the
 * final state is the default when motion is reduced. The patient data is synthetic and labelled as such.
 */

const BARS = [
  { y: 78, w: 190, chosen: false },
  { y: 134, w: 244, chosen: true },
  { y: 190, w: 150, chosen: false },
  { y: 246, w: 244, chosen: true },
  { y: 302, w: 210, chosen: false },
];
const BAR_X = 48;
const BAR_H = 22;

// the chosen lines bend from the end of their bar to their reader
const EXIT = [
  { d: 'M292 145 C400 145 396 100 502 100', y: 23.8 },
  { d: 'M292 257 C400 257 396 300 502 300', y: 71.4 },
];

const Glyph: React.FC<{ kind: 'steth' | 'building' }> = ({ kind }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === 'steth' ? (
      <>
        <path d="M6 3v6a4 4 0 0 0 8 0V3" />
        <path d="M10 13v2a4 4 0 0 0 8 0v-1" />
        <circle cx="18" cy="12" r="2" />
      </>
    ) : (
      <>
        <path d="M4 21V9l8-5 8 5v12" />
        <path d="M9 21v-6h6v6" />
        <path d="M12 8v3M10.5 9.5h3" />
      </>
    )}
  </svg>
);

export const HeroScene: React.FC = () => {
  const { t, isRtl } = useLang();
  const L = t.landing;

  return (
    <div className="scene" role="img" aria-label={L.sceneAlt} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="scene-art" aria-hidden="true">
        <svg className="scene-svg" viewBox="0 0 600 420" fill="none">
          <rect className="scene-panel" x="20" y="40" width="300" height="340" rx="30" />
          {BARS.map((b, n) => (
            <rect key={n} className={`scene-bar${b.chosen ? ' is-chosen' : ''}`} x={BAR_X} y={b.y} width={b.w} height={BAR_H} rx={BAR_H / 2} style={{ animationDelay: `${0.2 + n * 0.12}s` }} />
          ))}
          {EXIT.map((e, n) => (
            <path key={n} className="scene-line" pathLength={1} d={e.d} style={{ animationDelay: `${1.3 + n * 0.25}s` }} />
          ))}
        </svg>

        <div className="scene-label">{L.cardRecord}</div>

        <div className="scene-reader" style={{ top: `${EXIT[0].y}%`, animationDelay: '1.9s' }}>
          <span className="scene-reader-disc">
            <Glyph kind="steth" />
          </span>
          <span className="scene-reader-label">{L.nodeDoctor}</span>
        </div>
        <div className="scene-reader" style={{ top: `${EXIT[1].y}%`, animationDelay: '2.1s' }}>
          <span className="scene-reader-disc">
            <Glyph kind="building" />
          </span>
          <span className="scene-reader-label">{L.nodeAnyCenter}</span>
        </div>
      </div>

      <div className="scene-foot" aria-hidden="true">
        <span className="scene-chip">
          <CheckIcon />
          {L.cardShareOnly}
        </span>
      </div>
    </div>
  );
};
