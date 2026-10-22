import React from 'react';

// Hero column of the login page. The mark is a loom: a woven plate of threads (Naseej means "weave")
// with a heartbeat laced through it and three satellites for what the app does with a record
// (documents, a temporary QR share, and the patient's own choice about what leaves). Drawn as SVG so there is no
// raster asset to license, colors follow the --auth-* tokens in auth.css, and every loop stops under reduced motion.

const GRID = [100, 150, 200, 250, 300];
const EDGE_A = 70;
const EDGE_B = 330;
const STRAND_W = 18;
const GAP_W = 27;
const OVER_HALF = STRAND_W / 2 + 4;

const ECG = 'M36 200 H112 L124 187 L136 200 H168 L180 200 L192 128 L206 264 L218 166 L226 200 H262 L274 189 L286 200 H364';

// Which strand is on top at each crossing: warp (vertical) on even cells, weft (horizontal) on odd ones.
const weftOver = (i: number, j: number) => (i + j) % 2 === 1;

const Mark: React.FC = () => (
  <svg className="auth-mark" viewBox="-30 -30 460 460" fill="none" role="presentation">
    <defs>
      {/* warp threads are the accent orange, weft threads warm ivory (the site palette): the contrast makes the over/under read as cloth */}
      <linearGradient id="auth-warp" gradientUnits="userSpaceOnUse" x1="0" y1={EDGE_A} x2="0" y2={EDGE_B}>
        <stop offset="0" stopColor="#d9480f" />
        <stop offset="1" stopColor="#c2410c" />
      </linearGradient>
      <linearGradient id="auth-weft" gradientUnits="userSpaceOnUse" x1={EDGE_A} y1="0" x2={EDGE_B} y2="0">
        <stop offset="0" stopColor="#cdbfb4" />
        <stop offset="1" stopColor="#f3ebe3" />
      </linearGradient>
      <radialGradient id="auth-halo" cx="200" cy="200" r="230" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--auth-halo)" />
        <stop offset="1" stopColor="var(--auth-halo)" stopOpacity="0" />
      </radialGradient>
    </defs>

    <circle className="auth-mark-halo" cx="200" cy="200" r="230" fill="url(#auth-halo)" />
    <circle className="auth-mark-ring auth-mark-ring--dash" cx="200" cy="200" r="196" />
    <circle className="auth-mark-ring" cx="200" cy="200" r="172" />

    <g className="auth-mark-body">
      <rect className="auth-mark-plate" x="50" y="50" width="300" height="300" rx="62" />

      {/* threads: weft first, then warp on top; the crossings where the weft is on top are redrawn below */}
      <g className="auth-mark-threads" strokeWidth={STRAND_W} strokeLinecap="round">
        {GRID.map((y, j) => (
          <path key={`h${y}`} className="auth-thread" stroke="url(#auth-weft)" pathLength={1} d={`M${EDGE_A} ${y} H${EDGE_B}`} style={{ animationDelay: `${0.15 + j * 0.09}s` }} />
        ))}
        {GRID.map((x, i) => (
          <path key={`v${x}`} className="auth-thread" stroke="url(#auth-warp)" pathLength={1} d={`M${x} ${EDGE_A} V${EDGE_B}`} style={{ animationDelay: `${0.5 + i * 0.09}s` }} />
        ))}
      </g>
      <g className="auth-mark-over">
        {GRID.flatMap((x, i) =>
          GRID.filter((_, j) => weftOver(i, j)).map((y) => {
            const j = GRID.indexOf(y);
            return (
              <g key={`o${i}${j}`}>
                <path className="auth-mark-gap" d={`M${x - OVER_HALF} ${y} H${x + OVER_HALF}`} strokeWidth={GAP_W} />
                <path d={`M${x - OVER_HALF} ${y} H${x + OVER_HALF}`} strokeWidth={STRAND_W} stroke="url(#auth-weft)" />
              </g>
            );
          }),
        )}
      </g>

      {/* knots: a pulse that passes along the diagonal, one record entry at a time */}
      <g className="auth-mark-knots">
        {GRID.map((p, k) => (
          <g key={k} style={{ animationDelay: `${1.6 + k * 0.35}s` }} className="auth-knot">
            <circle className="auth-knot-ring" cx={p} cy={p} r="9" />
            <circle className="auth-knot-dot" cx={p} cy={p} r="5.5" />
          </g>
        ))}
      </g>

      <path className="auth-mark-ecg-under" d={ECG} pathLength={1} />
      <path className="auth-mark-ecg" d={ECG} pathLength={1} />
    </g>

    {/* satellites */}
    <g className="auth-chip auth-chip--a" transform="translate(352 64)">
      <g className="auth-chip-in">
        <circle className="auth-chip-bg" r="31" />
        <g className="auth-chip-icon" transform="translate(-14 -14) scale(1.1667)">
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v5h5" />
          <path d="M10 13h6M10 17h6" />
        </g>
      </g>
    </g>
    <g className="auth-chip auth-chip--b" transform="translate(44 330)">
      <g className="auth-chip-in">
        <circle className="auth-chip-bg" r="31" />
        <g className="auth-chip-icon" transform="translate(-14 -14) scale(1.1667)">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18h2" />
        </g>
      </g>
    </g>
    <g className="auth-chip auth-chip--c" transform="translate(372 318)">
      <g className="auth-chip-in">
        <circle className="auth-chip-bg" r="27" />
        <g className="auth-chip-icon" transform="translate(-12 -12) scale(1)">
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
          <path d="M9 12l2.2 2.2L15.5 10" />
        </g>
      </g>
    </g>

    <g className="auth-spark">
      <circle cx="26" cy="150" r="3.5" style={{ animationDelay: '0.2s' }} />
      <circle cx="386" cy="190" r="3" style={{ animationDelay: '1.1s' }} />
      <circle cx="120" cy="14" r="3" style={{ animationDelay: '2s' }} />
      <circle cx="300" cy="394" r="3.5" style={{ animationDelay: '0.7s' }} />
    </g>
  </svg>
);

export interface AuthArtProps {
  title: string;
  sub: string;
  points: string[];
  dir: 'rtl' | 'ltr';
}

export const AuthArt: React.FC<AuthArtProps> = ({ title, sub, points, dir }) => (
  <section className="auth-hero" dir={dir}>
    <div className="auth-hero-glow" aria-hidden="true" />
    <div className="auth-hero-mark" aria-hidden="true">
      <Mark />
    </div>
    <div className="auth-hero-copy">
      <h2 className="auth-hero-title">{title}</h2>
      <p className="auth-hero-sub">{sub}</p>
      <ul className="auth-hero-points">
        {points.map((p, i) => (
          <li key={p} style={{ animationDelay: `${0.9 + i * 0.12}s` }}>
            {p}
          </li>
        ))}
      </ul>
    </div>
  </section>
);
