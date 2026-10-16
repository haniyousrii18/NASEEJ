import React from 'react';

/**
 * Quiet weave behind the signed-in application. It carries the idea of the public pages' backdrop (warp and weft
 * threads, care nodes on them, a slow drift of brand tint) in a much lighter form: fewer threads, no pulses or rings,
 * transform-only animation. It is decorative: aria-hidden, no pointer events, behind everything in `.na-app`.
 * Strength per role and theme is set in app.css (`--nab-strength`); reduced motion stops the animation there too.
 */

const W = 1440;
const H = 900;

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const WARP = Array.from({ length: 5 }, (_, i) => {
  const y = 90 + i * 190;
  const a = 34 + (i % 3) * 12;
  const d = i % 2 ? 1 : -1;
  return `M -60 ${y} C 300 ${y - a * d}, 580 ${y + a * d}, 860 ${y} S 1260 ${y - a * d}, 1500 ${y + 12 * d}`;
});

const WEFT = Array.from({ length: 6 }, (_, j) => {
  const x = 40 + j * 260;
  const a = 40 + (j % 3) * 14;
  const d = j % 2 ? 1 : -1;
  return `M ${x} -60 C ${x + a * d} 240, ${x - a * d} 500, ${x + 8} 740 S ${x + a * d} 900, ${x - 6} 980`;
});

const NODES = (() => {
  const rand = rng(77);
  const cols = 5;
  const rows = 4;
  const out: Array<{ x: number; y: number; r: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        x: ((c + 0.5 + (rand() - 0.5) * 0.6) / cols) * W,
        y: ((r + 0.5 + (rand() - 0.5) * 0.6) / rows) * H,
        r: 2.4 + rand() * 1.8,
      });
    }
  }
  return out;
})();

// Each node links to its nearest neighbour (deduplicated).
const LINKS = (() => {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  NODES.forEach((n, i) => {
    let best = -1;
    let bestD = Infinity;
    NODES.forEach((m, j) => {
      if (j === i) return;
      const d = (m.x - n.x) ** 2 + (m.y - n.y) ** 2;
      if (d < bestD) [best, bestD] = [j, d];
    });
    const key = i < best ? `${i}-${best}` : `${best}-${i}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push([i, best]);
    }
  });
  return out;
})();

export const AppBackdrop: React.FC = React.memo(() => (
  <div className="na-backdrop" aria-hidden="true">
    <span className="na-backdrop-blob na-backdrop-blob--a" />
    <span className="na-backdrop-blob na-backdrop-blob--b" />
    <svg className="na-backdrop-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
      <g className="na-backdrop-warp">
        {WARP.map((d, i) => (
          <path key={i} d={d} fill="none" />
        ))}
      </g>
      <g className="na-backdrop-weft">
        {WEFT.map((d, i) => (
          <path key={i} d={d} fill="none" />
        ))}
      </g>
      <g className="na-backdrop-links">
        {LINKS.map(([a, b], i) => (
          <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
        ))}
      </g>
      <g className="na-backdrop-nodes">
        {NODES.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={n.r} />
        ))}
      </g>
    </svg>
  </div>
));
AppBackdrop.displayName = 'AppBackdrop';
