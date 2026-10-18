import React, { useEffect, useRef, useState } from 'react';

// Animated vector backdrop for the landing sections. The idea is the product's name: نسيج is a weave.
// Warp and weft threads cross, care nodes (patients, clinicians, centers) sit on them and link to their
// neighbours, and small pulses travel along the threads. Pure SVG, colored by CSS tokens, no assets.

const W = 1440;
const H = 900;

// Deterministic jitter so the layout is identical on every render and every device.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Warp: long, gently waving threads across the page.
const WARP = Array.from({ length: 7 }, (_, i) => {
  const y = 70 + i * 128;
  const a = 38 + (i % 3) * 14;
  const d = i % 2 ? 1 : -1;
  return `M -60 ${y} C 280 ${y - a * d}, 560 ${y + a * d}, 860 ${y} S 1260 ${y - a * d}, 1500 ${y + 14 * d}`;
});

// Weft: threads that cross the warp from top to bottom.
const WEFT = Array.from({ length: 8 }, (_, j) => {
  const x = -20 + j * 190;
  const a = 46 + (j % 3) * 16;
  const d = j % 2 ? 1 : -1;
  return `M ${x} -60 C ${x + a * d} 220, ${x - a * d} 470, ${x + 10} 720 S ${x + a * d} 900, ${x - 8} 980`;
});

interface Node {
  x: number;
  y: number;
  r: number;
  delay: number;
  big: boolean;
}

const NODES: Node[] = (() => {
  const rand = rng(2026);
  const cols = 7;
  const rows = 5;
  const out: Node[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        x: ((c + 0.5 + (rand() - 0.5) * 0.7) / cols) * W,
        y: ((r + 0.5 + (rand() - 0.5) * 0.7) / rows) * H,
        r: 2.6 + rand() * 2.4,
        delay: -rand() * 8,
        big: rand() > 0.82,
      });
    }
  }
  return out;
})();

// Each node links to its two nearest neighbours (deduplicated).
const LINKS: Array<[number, number]> = (() => {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  NODES.forEach((n, i) => {
    NODES.map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push([i, j]);
        }
      });
  });
  return out;
})();

const PULSES = [
  { path: 0, dur: 22, begin: -2 },
  { path: 2, dur: 26, begin: -11 },
  { path: 3, dur: 20, begin: -6 },
  { path: 5, dur: 28, begin: -16 },
  { path: 6, dur: 24, begin: -9 },
];

export const LandingBackdrop: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [reduce] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Slow parallax: the threads drift a little against the scroll, so the weave feels deeper than the page.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => el.style.setProperty('--lb-scroll', String(window.scrollY)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduce]);

  return (
    <div ref={ref} className="lb" aria-hidden="true">
      <div className="lb-blob lb-blob--a" />
      <div className="lb-blob lb-blob--b" />
      <svg className="lb-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          {WARP.map((d, i) => (
            <path key={i} id={`lb-w${i}`} d={d} />
          ))}
        </defs>

        <g className="lb-layer lb-layer--back">
          <g className="lb-warp-group">
            {WARP.map((d, i) => (
              <path key={`w${i}`} className="lb-warp" d={d} />
            ))}
            {!reduce &&
              PULSES.map((p, i) => (
                <g key={`p${i}`} className="lb-pulse">
                  <circle r="11" className="lb-pulse-halo" />
                  <circle r="3.4" className="lb-pulse-core" />
                  <animateMotion dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#lb-w${p.path}`} />
                  </animateMotion>
                </g>
              ))}
          </g>
          {WEFT.map((d, j) => (
            <path key={`f${j}`} className="lb-weft" d={d} style={{ animationDelay: `${-j * 1.7}s` }} />
          ))}
        </g>

        <g className="lb-layer lb-layer--front">
          {LINKS.map(([a, b], i) => (
            <line
              key={`l${i}`}
              className={i % 2 ? 'lb-link lb-link--flow' : 'lb-link'}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
            />
          ))}
          {NODES.map((n, i) => (
            <g key={`n${i}`} className="lb-node" style={{ animationDelay: `${n.delay}s` }}>
              {n.big && <circle className="lb-ring" cx={n.x} cy={n.y} r={n.r + 5} style={{ animationDelay: `${n.delay}s` }} />}
              <circle className="lb-dot" cx={n.x} cy={n.y} r={n.big ? n.r + 1.4 : n.r} />
            </g>
          ))}

        </g>
      </svg>
    </div>
  );
};
