// Geometry for the woven braid in the landing hero: three threads wound around one axis, so each one passes in front of the
// others in turn (Naseej means "weave"; the record is what the threads carry).
// Pure data: colors come from the --sc-braid-* tokens in landing.css so the braid follows the theme.

const H = 900;
const CX = 150;
const AMP = 82;
const STEPS = 240;
const TURNS = 3.4;
const BINS = 10;
const PHASES = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

export const BRAID_VIEWBOX = `0 0 ${CX * 2} ${H}`;

const kAt = (i: number) => (i / STEPS) * TURNS * Math.PI * 2;
const pointAt = (i: number, phase: number) => ({ x: CX + AMP * Math.sin(kAt(i) + phase), y: (i / STEPS) * H });

export interface BraidSegment {
  d: string;
  strand: 0 | 1 | 2;
  /** 0 (far behind) to 1 (in front of the others). */
  depth: number;
}

/**
 * Segments grouped into depth bins, back to front. Inside a bin all outlines are drawn before all fills, so the outline of a
 * piece never cuts into the fill of its own neighbour; across bins the nearer thread covers the farther one.
 */
export const BRAID_BINS: BraidSegment[][] = (() => {
  const bins: BraidSegment[][] = Array.from({ length: BINS }, () => []);
  PHASES.forEach((phase, strand) => {
    for (let i = 0; i < STEPS; i++) {
      const a = pointAt(i, phase);
      const b = pointAt(i + 1, phase);
      const depth = (Math.cos(kAt(i + 0.5) + phase) + 1) / 2;
      bins[Math.min(BINS - 1, Math.floor(depth * BINS))].push({
        d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        strand: strand as 0 | 1 | 2,
        depth,
      });
    }
  });
  return bins;
})();

/** Where a thread is closest to the viewer it sits on the axis: one record entry is pinned there. */
export const BRAID_BEADS: Array<{ x: number; y: number; strand: number }> = (() => {
  const out: Array<{ x: number; y: number; strand: number }> = [];
  PHASES.forEach((phase, strand) => {
    for (let m = 0; m <= TURNS + 1; m++) {
      const k = m * Math.PI * 2 - phase;
      const y = (k / (TURNS * Math.PI * 2)) * H;
      if (y > 70 && y < H - 70) out.push({ x: CX, y, strand });
    }
  });
  return out.sort((a, b) => a.y - b.y);
})();
