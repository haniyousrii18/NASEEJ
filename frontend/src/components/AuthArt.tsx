import React from 'react';

// Hero column of the login page. The picture tells the product in one glance: a phone holding the patient's own record
// (profile, a pulse line, entries the patient has ticked), a QR ticket with a draining timer for the temporary share, and
// two threads (Naseej means "weave") wrapped around the phone that carry the record out to a doctor, a clinic and a hospital.
// Drawn as SVG with no text, so nothing here claims more than the app does; colors follow the --auth-* tokens in auth.css and
// every loop stops under reduced motion.

const QR_ROWS = ['000101000', '000011000', '000110000', '101100101', '011011010', '100110111', '000101101', '000110101', '000100110'];
const QR_X = 153;
const QR_Y = 305;
const QR_M = 6.4;
const FINDERS: Array<[number, number]> = [
  [0, 0],
  [6, 0],
  [0, 6],
];
const inFinder = (c: number, r: number) => FINDERS.some(([fc, fr]) => c >= fc && c < fc + 3 && r >= fr && r < fr + 3);

const ROWS = [
  { y: 196, d: 0.9 },
  { y: 226, d: 1.05 },
  { y: 256, d: 1.2 },
];

const Orbit: React.FC<{ rotate: number; rx: number; ry: number; className: string; side: 'back' | 'front'; flow?: boolean }> = ({ rotate, rx, ry, className, side, flow }) => {
  const d = side === 'back' ? `M${-rx} 0 A${rx} ${ry} 0 0 1 ${rx} 0` : `M${rx} 0 A${rx} ${ry} 0 0 1 ${-rx} 0`;
  return (
    <g transform={`translate(210 178) rotate(${rotate})`}>
      <path className={className} d={d} />
      {flow && <path className="auth-orbit-flow" d={d} />}
    </g>
  );
};

const Chip: React.FC<{ x: number; y: number; n: number; children: React.ReactNode }> = ({ x, y, n, children }) => (
  <g className="auth-chip" transform={`translate(${x} ${y})`} style={{ animationDelay: `${1.4 + n * 0.15}s` }}>
    <g className="auth-chip-in" style={{ animationDelay: `${-n * 1.3}s` }}>
      <circle className="auth-chip-bg" r="23" />
      <g className="auth-chip-icon" transform="translate(-12 -12)">
        {children}
      </g>
    </g>
  </g>
);

const Mark: React.FC = () => (
  <svg className="auth-mark" viewBox="-8 14 436 432" fill="none" role="presentation">
    <defs>
      <linearGradient id="auth-thread-o" gradientUnits="userSpaceOnUse" x1="-200" y1="0" x2="200" y2="0">
        <stop offset="0" stopColor="#c2410c" />
        <stop offset="1" stopColor="#ea6a2a" />
      </linearGradient>
      <radialGradient id="auth-halo" cx="210" cy="230" r="230" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--auth-halo)" />
        <stop offset="1" stopColor="var(--auth-halo)" stopOpacity="0" />
      </radialGradient>
      <clipPath id="auth-screen-clip">
        <rect x="133" y="48" width="154" height="364" rx="22" />
      </clipPath>
      <clipPath id="auth-qr-clip">
        <rect x={QR_X} y={QR_Y} width={QR_M * 9} height={QR_M * 9} />
      </clipPath>
    </defs>

    <circle className="auth-mark-halo" cx="210" cy="230" r="230" fill="url(#auth-halo)" />

    {/* threads behind the phone */}
    <g className="auth-orbits auth-orbits--back">
      <g stroke="url(#auth-thread-o)">
        <Orbit rotate={-16} rx={196} ry={80} className="auth-orbit auth-orbit--accent" side="back" flow />
      </g>
      <Orbit rotate={14} rx={190} ry={70} className="auth-orbit auth-orbit--ivory" side="back" />
    </g>

    <g className="auth-phone">
      <g className="auth-phone-float">
        <rect className="auth-phone-body" x="125" y="40" width="170" height="380" rx="30" />
        <rect className="auth-screen" x="133" y="48" width="154" height="364" rx="22" />

        <g clipPath="url(#auth-screen-clip)">
          <rect className="auth-notch" x="186" y="55" width="48" height="8" rx="4" />

          {/* profile */}
          <g className="auth-row" style={{ animationDelay: '0.7s' }}>
            <circle className="auth-avatar" cx="158" cy="94" r="15" />
            <circle className="auth-avatar-glyph" cx="158" cy="90" r="4.5" />
            <path className="auth-avatar-glyph" d="M149 104c1-5 5-7 9-7s8 2 9 7z" />
            <rect className="auth-skel auth-skel--strong" x="180" y="84" width="74" height="7" rx="3.5" />
            <rect className="auth-skel" x="180" y="98" width="46" height="6" rx="3" />
          </g>

          {/* pulse card */}
          <g className="auth-row" style={{ animationDelay: '0.8s' }}>
            <rect className="auth-card-bg" x="145" y="122" width="130" height="58" rx="13" />
            <rect className="auth-skel" x="155" y="131" width="38" height="5" rx="2.5" />
            <path className="auth-pulse" pathLength={1} d="M155 162 H178 L184 154 L190 162 H200 L207 140 L215 174 L222 152 L227 162 H235 L240 157 L245 162 H265" />
          </g>

          {/* record entries the patient ticked */}
          {ROWS.map((r, i) => (
            <g key={r.y} className="auth-row" style={{ animationDelay: `${r.d}s` }}>
              <rect className="auth-card-bg" x="145" y={r.y} width="130" height="24" rx="10" />
              <circle className="auth-dot-soft" cx="159" cy={r.y + 12} r="5.5" />
              <rect className="auth-skel auth-skel--strong" x="172" y={r.y + 7} width={50 - i * 7} height="5" rx="2.5" />
              <rect className="auth-skel" x="172" y={r.y + 14.5} width={30 + i * 4} height="3.5" rx="1.75" />
              <circle className="auth-tick-bg" cx="260" cy={r.y + 12} r="7.5" />
              <path className="auth-tick" pathLength={1} d={`M256.2 ${r.y + 12.2} l2.7 2.7 l4.9 -5.4`} style={{ animationDelay: `${r.d + 0.7}s` }} />
            </g>
          ))}

          {/* the QR ticket with its draining timer */}
          <g className="auth-qrcard">
            <rect className="auth-qr-card" x="141" y="290" width="138" height="114" rx="17" />
            <rect className="auth-qr-paper" x={QR_X - 4} y={QR_Y - 4} width={QR_M * 9 + 8} height={QR_M * 9 + 8} rx="7" />
            {QR_ROWS.flatMap((row, r) =>
              row.split('').map((v, c) => (v === '1' && !inFinder(c, r) ? <rect key={`${c}-${r}`} className="auth-qr-ink" x={QR_X + c * QR_M} y={QR_Y + r * QR_M} width={QR_M + 0.3} height={QR_M + 0.3} rx="1" /> : null)),
            )}
            {FINDERS.map(([c, r]) => (
              <g key={`${c}${r}`}>
                <rect className="auth-qr-ink" x={QR_X + c * QR_M} y={QR_Y + r * QR_M} width={QR_M * 3} height={QR_M * 3} rx="2.4" />
                <rect className="auth-qr-paper" x={QR_X + c * QR_M + QR_M * 0.8} y={QR_Y + r * QR_M + QR_M * 0.8} width={QR_M * 1.4} height={QR_M * 1.4} rx="1" />
                <rect className="auth-qr-ink" x={QR_X + c * QR_M + QR_M * 1.15} y={QR_Y + r * QR_M + QR_M * 1.15} width={QR_M * 0.7} height={QR_M * 0.7} rx="0.6" />
              </g>
            ))}
            <g clipPath="url(#auth-qr-clip)">
              <rect className="auth-scan" x={QR_X} y={QR_Y} width={QR_M * 9} height="2.4" rx="1.2" />
            </g>

            <circle className="auth-ring-track" cx="248" cy="322" r="15" />
            <circle className="auth-ring-progress" cx="248" cy="322" r="15" pathLength={1} transform="rotate(-90 248 322)" />
            <path className="auth-clock" d="M248 314.5v7.5l5 3" />
            <rect className="auth-skel auth-skel--strong" x="228" y="347" width="40" height="5" rx="2.5" />
            <rect className="auth-skel" x="234" y="357" width="28" height="4" rx="2" />
            <rect className="auth-qr-btn" x="153" y="377" width="114" height="17" rx="8.5" />
            <rect className="auth-qr-btn-line" x="190" y="383.5" width="40" height="4" rx="2" />
          </g>
        </g>
      </g>
    </g>

    {/* threads in front of the phone */}
    <g className="auth-orbits auth-orbits--front">
      <g stroke="url(#auth-thread-o)">
        <Orbit rotate={-16} rx={196} ry={80} className="auth-orbit auth-orbit--accent" side="front" flow />
      </g>
      <Orbit rotate={14} rx={190} ry={70} className="auth-orbit auth-orbit--ivory" side="front" />
    </g>

    {/* the people and places the record can be shared with */}
    <Chip x={26} y={129} n={0}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </Chip>
    <Chip x={398} y={121} n={1}>
      <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />
    </Chip>
    <Chip x={22} y={229} n={2}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" />
    </Chip>
    <Chip x={394} y={221} n={3}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
    </Chip>
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
