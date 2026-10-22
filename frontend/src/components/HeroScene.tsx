import React from 'react';
import { useLang } from '../context/LangContext.js';
import { CheckIcon, LockIcon } from './LineIcon.js';

/*
 * Hero illustration: the record as cloth. Naseej means weave, and a patient's history is a fabric of many threads.
 * The patient pulls out only the threads they choose; each one leaves the cloth, carries a QR token and ends with a reader
 * (their doctor, or any clinic or hospital). The other threads stay woven in.
 * Drawn from SVG with the labels and icons in HTML, so text stays crisp, the picture mirrors in RTL without flipping any
 * glyph, and the final state is the default when motion is reduced. The patient data is synthetic and labelled as such.
 */

const COLS = 14;
const ROWS = 13;
const CELL = 26;
const X0 = 30;
const Y0 = 60;
const X1 = X0 + COLS * CELL;
const Y1 = Y0 + ROWS * CELL;
const HALF = 13;
const THREAD = 15;
const GAP = 22;

const colX = (i: number) => X0 + CELL / 2 + i * CELL;
const rowY = (j: number) => Y0 + CELL / 2 + j * CELL;

/** Weft colors by row. The two `chosen` rows are the threads the patient pulls out. */
const WEFT: Array<'sand' | 'orange' | 'amber' | 'chosen'> = ['sand', 'sand', 'orange', 'sand', 'chosen', 'sand', 'amber', 'sand', 'sand', 'chosen', 'sand', 'orange', 'sand'];
const CHOSEN = [4, 9];

const weftOver = (i: number, j: number) => (i + j) % 2 === 0;

// the two threads leave the cloth on the end side and bend toward their reader
const EXIT = [
  { d: `M${X1 - 6} ${rowY(4)} C${X1 + 72} ${rowY(4)} ${X1 + 56} 104 512 104`, token: { x: 72.6, y: 27 } },
  { d: `M${X1 - 6} ${rowY(9)} C${X1 + 72} ${rowY(9)} ${X1 + 56} 400 512 400`, token: { x: 72.6, y: 68 } },
];

const Glyph: React.FC<{ kind: 'user' | 'steth' | 'building' }> = ({ kind }) => (
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

const QrToken: React.FC = () => (
  <svg viewBox="0 0 9 9" aria-hidden="true" focusable="false">
    <path d="M1 1h3v3H1zM5 1h3v3H5zM1 5h3v3H1zM5.2 5.2h1v1h-1zM7 5.2h1v1H7zM6.1 6.1h1v1h-1zM5.2 7h1v1h-1zM7 7h1v1H7z" />
    <path className="scene-token-hole" d="M2 2h1v1H2zM6 2h1v1H6zM2 6h1v1H2z" />
  </svg>
);

export const HeroScene: React.FC = () => {
  const { t, isRtl } = useLang();
  const L = t.landing;
  const dir = isRtl ? 'rtl' : 'ltr';

  return (
    <div className="scene" role="img" aria-label={L.sceneAlt} dir={dir}>
      <div className="scene-top" aria-hidden="true">
        <span className="scene-avatar">
          <Glyph kind="user" />
        </span>
        <span className="scene-id">
          <span className="scene-name" dir="auto">
            {isRtl ? 'محمد المنصور' : 'Mohammed Al-Mansoor'}
          </span>
          <span className="scene-sub">{L.cardRecord}</span>
        </span>
      </div>

      <div className="scene-art" aria-hidden="true">
        <svg className="scene-svg" viewBox="0 0 620 520" fill="none">
          <defs>
            <clipPath id="scene-cloth-clip">
              <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} rx="20" />
            </clipPath>
          </defs>

          <rect className="scene-plate" x={X0 - 8} y={Y0 - 8} width={X1 - X0 + 16} height={Y1 - Y0 + 16} rx="26" />

          <g clipPath="url(#scene-cloth-clip)" strokeLinecap="butt">
            <g strokeWidth={THREAD}>
              {WEFT.map((kind, j) => (
                <path key={`h${j}`} className={`scene-weft scene-weft--${kind}`} pathLength={1} d={`M${X0 - 4} ${rowY(j)} H${X1 + 4}`} style={{ animationDelay: `${0.45 + j * 0.05}s` }} />
              ))}
              {Array.from({ length: COLS }, (_, i) => (
                <path key={`v${i}`} className="scene-warp" pathLength={1} d={`M${colX(i)} ${Y0 - 4} V${Y1 + 4}`} style={{ animationDelay: `${i * 0.035}s` }} />
              ))}
            </g>
            <g className="scene-over">
              {Array.from({ length: COLS }, (_, i) =>
                WEFT.map((kind, j) =>
                  weftOver(i, j) ? (
                    <g key={`o${i}-${j}`}>
                      <path className="scene-gap" d={`M${colX(i) - HALF} ${rowY(j)} H${colX(i) + HALF}`} strokeWidth={GAP} />
                      <path className={`scene-weft-piece scene-weft--${kind}`} d={`M${colX(i) - HALF} ${rowY(j)} H${colX(i) + HALF}`} strokeWidth={THREAD} />
                    </g>
                  ) : null,
                ),
              )}
            </g>
          </g>

          {/* loose ends along the edge: the rest of the history stays woven in */}
          <g className="scene-fray" strokeLinecap="round" strokeWidth="5">
            {WEFT.map((kind, j) =>
              CHOSEN.includes(j) ? null : (
                <path key={`f${j}`} className={`scene-weft--${kind}`} d={`M${X1 - 2} ${rowY(j)} c${8 + (j % 3) * 4} 0 ${14 + (j % 4) * 3} ${3 + (j % 2) * 4} ${18 + (j % 3) * 5} ${7 + (j % 3) * 3}`} />
              ),
            )}
          </g>

          {/* the chosen threads leave the cloth */}
          <g className="scene-exit" strokeLinecap="round">
            {EXIT.map((e, n) => (
              <g key={n}>
                <path className="scene-exit-line" pathLength={1} d={e.d} strokeWidth={THREAD - 4} style={{ animationDelay: `${2.1 + n * 0.3}s` }} />
                <path className="scene-exit-glint" pathLength={1} d={e.d} strokeWidth={4} style={{ animationDelay: `${4.6 + n * 0.5}s` }} />
              </g>
            ))}
          </g>
        </svg>

        {EXIT.map((e, n) => (
          <span key={`t${n}`} className="scene-token" style={{ insetInlineStart: `${e.token.x}%`, top: `${e.token.y}%`, animationDelay: `${3 + n * 0.3}s` }}>
            <QrToken />
          </span>
        ))}

        <div className="scene-reader" style={{ top: '20%', animationDelay: '3.3s' }}>
          <span className="scene-reader-disc">
            <Glyph kind="steth" />
          </span>
          <span className="scene-reader-label">{L.nodeDoctor}</span>
        </div>
        <div className="scene-reader" style={{ top: '76.9%', animationDelay: '3.6s' }}>
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
        <span className="scene-chip">
          <LockIcon />
          {L.cardShareExpires}
        </span>
      </div>
    </div>
  );
};
