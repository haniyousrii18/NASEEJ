// Geometry for the decorative double helix shared by the login backdrop and the landing hero.
// Pure data: colors and animation come from CSS so the shape follows the theme.

const H = 900;
const CX = 150;
const AMP = 92;
const STEPS = 150;
const TURNS = 3.2;

export const HELIX_VIEWBOX = `0 0 ${CX * 2} ${H}`;

const point = (i: number, sign: 1 | -1) => {
  const k = (i / STEPS) * TURNS * Math.PI * 2;
  return { x: CX + sign * AMP * Math.sin(k), y: (i / STEPS) * H, k };
};

const strand = (sign: 1 | -1) =>
  Array.from({ length: STEPS + 1 }, (_, i) => {
    const p = point(i, sign);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(' ');

export const STRAND_A = strand(1);
export const STRAND_B = strand(-1);

export const RUNGS = Array.from({ length: Math.floor(STEPS / 3) }, (_, n) => {
  const i = n * 3 + 1;
  const a = point(i, 1);
  const b = point(i, -1);
  return { ax: a.x, bx: b.x, y: a.y, depth: Math.abs(Math.cos(a.k)) };
});
