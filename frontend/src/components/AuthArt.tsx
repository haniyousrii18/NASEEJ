import React from 'react';

// Hero column of the login page. The mark is a small loom: three warp and three weft threads woven over and under
// on a dark plate (Naseej means "weave"), with one pulsing knot at the center for the patient's own record.
// Drawn as SVG so there is no raster asset to license, colors follow the --auth-* tokens in auth.css, and the
// loops stop under reduced motion.

const GRID = [140, 200, 260];
const EDGE_A = 88;
const EDGE_B = 312;
const STRAND_W = 32;
const GAP_W = 42;
const OVER_HALF = STRAND_W / 2 + 5;

// Which strand is on top at each crossing: warp (vertical) on even cells, weft (horizontal) on odd ones.
const weftOver = (i: number, j: number) => (i + j) % 2 === 1;

const Mark: React.FC = () => (
  <svg className="auth-mark" viewBox="0 0 400 400" fill="none" role="presentation">
    <defs>
      {/* warp threads are the accent orange, weft threads warm ivory: the contrast makes the over/under read as cloth */}
      <linearGradient id="auth-warp" gradientUnits="userSpaceOnUse" x1="0" y1={EDGE_A} x2="0" y2={EDGE_B}>
        <stop offset="0" stopColor="#d9480f" />
        <stop offset="1" stopColor="#c2410c" />
      </linearGradient>
      <linearGradient id="auth-weft" gradientUnits="userSpaceOnUse" x1={EDGE_A} y1="0" x2={EDGE_B} y2="0">
        <stop offset="0" stopColor="#cdbfb4" />
        <stop offset="1" stopColor="#f3ebe3" />
      </linearGradient>
      <radialGradient id="auth-halo" cx="200" cy="200" r="210" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--auth-halo)" />
        <stop offset="1" stopColor="var(--auth-halo)" stopOpacity="0" />
      </radialGradient>
    </defs>

    <circle className="auth-mark-halo" cx="200" cy="200" r="210" fill="url(#auth-halo)" />

    <g className="auth-mark-body">
      <rect className="auth-mark-plate" x="50" y="50" width="300" height="300" rx="76" />

      {/* threads: weft first, then warp on top; the crossings where the weft is on top are redrawn below */}
      <g className="auth-mark-threads" strokeWidth={STRAND_W} strokeLinecap="round">
        {GRID.map((y, j) => (
          <path key={`h${y}`} className="auth-thread" stroke="url(#auth-weft)" pathLength={1} d={`M${EDGE_A} ${y} H${EDGE_B}`} style={{ animationDelay: `${0.15 + j * 0.12}s` }} />
        ))}
        {GRID.map((x, i) => (
          <path key={`v${x}`} className="auth-thread" stroke="url(#auth-warp)" pathLength={1} d={`M${x} ${EDGE_A} V${EDGE_B}`} style={{ animationDelay: `${0.5 + i * 0.12}s` }} />
        ))}
      </g>
      <g className="auth-mark-over">
        {GRID.flatMap((x, i) =>
          GRID.map((y, j) =>
            weftOver(i, j) ? (
              <g key={`o${i}${j}`}>
                <path className="auth-mark-gap" d={`M${x - OVER_HALF} ${y} H${x + OVER_HALF}`} strokeWidth={GAP_W} />
                <path d={`M${x - OVER_HALF} ${y} H${x + OVER_HALF}`} strokeWidth={STRAND_W} stroke="url(#auth-weft)" />
              </g>
            ) : null,
          ),
        )}
      </g>

      <g className="auth-knot">
        <circle className="auth-knot-ring" cx="200" cy="200" r="15" />
        <circle className="auth-knot-dot" cx="200" cy="200" r="9" />
      </g>
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
