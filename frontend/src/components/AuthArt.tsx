import React from 'react';
import { HELIX_VIEWBOX, RUNGS, STRAND_A, STRAND_B } from './helix.js';

// Decorative backdrop for the login page: a double helix and a heartbeat line, drawn as SVG so
// there is no raster asset to license and the colors follow the theme tokens in auth.css.

const ECG =
  'M0 70 H150 L168 70 L182 58 L196 70 H300 L312 70 L324 18 L340 122 L354 36 L366 82 L376 70 H520 L538 70 L552 56 L566 70 H800';

export const AuthArt: React.FC = () => (
  <div className="auth-art" aria-hidden="true">
    <div className="auth-art-glow" />
    <svg className="auth-dna" viewBox={HELIX_VIEWBOX} fill="none">
      <g className="auth-dna-rungs" strokeLinecap="round">
        {RUNGS.map((r) => (
          <g key={r.y} opacity={0.25 + r.depth * 0.6}>
            <line x1={r.ax} y1={r.y} x2={r.bx} y2={r.y} strokeWidth={2 + r.depth * 2} />
            <circle cx={r.ax} cy={r.y} r={2 + r.depth * 2.5} />
            <circle cx={r.bx} cy={r.y} r={2 + r.depth * 2.5} />
          </g>
        ))}
      </g>
      <path className="auth-dna-strand" d={STRAND_A} strokeWidth="5" strokeLinecap="round" />
      <path className="auth-dna-strand" d={STRAND_B} strokeWidth="5" strokeLinecap="round" opacity="0.8" />
    </svg>
    <svg className="auth-ecg" viewBox="0 0 800 140" fill="none" preserveAspectRatio="none">
      <path d={ECG} pathLength={1} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);
