import React, { useEffect, useRef } from 'react';

/**
 * The woven network: the logo's knotted mark rendered as a luminous 3D element (glowing nodes joined by thin threads of
 * light). One canvas, three readings of the same material:
 *   sculpture  a slowly turning knot of glass ribbons with glowing nodes (landing hero)
 *   field      a sparse constellation of nodes and threads drifting in depth (backgrounds, empty space)
 *   waves      silk strands that ripple across a band (hero cards, the assistant header)
 * Decorative only (aria-hidden). Colours come from the theme tokens --weave-node / --weave-thread, or white on a hero
 * gradient (`tone="light"`). It pauses off screen and in a hidden tab, and draws a single still frame when the person
 * asks the system to reduce motion.
 */
type Variant = 'sculpture' | 'field' | 'waves';
interface Props {
  variant: Variant;
  tone?: 'theme' | 'light';
  className?: string;
  /** 0..1 overall intensity. */
  intensity?: number;
  /** Follows the pointer with a gentle parallax (sculpture and field). */
  interactive?: boolean;
  /** false draws one still frame (redrawn on resize and theme change) and never runs a frame loop. */
  animate?: boolean;
}

type V3 = [number, number, number];

const TAU = Math.PI * 2;

function rotate([x, y, z]: V3, yaw: number, pitch: number, roll = 0): V3 {
  // yaw (around y)
  let cx = Math.cos(yaw), sx = Math.sin(yaw);
  let x1 = x * cx + z * sx;
  let z1 = -x * sx + z * cx;
  // pitch (around x)
  cx = Math.cos(pitch);
  sx = Math.sin(pitch);
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  // roll (around z)
  cx = Math.cos(roll);
  sx = Math.sin(roll);
  const x2 = x1 * cx - y1 * sx;
  const y2 = x1 * sx + y1 * cx;
  x1 = x2;
  return [x1, y2, z2];
}

/** Deterministic pseudo-random numbers so every visit draws the same constellation. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const WovenField: React.FC<Props> = ({ variant, tone = 'theme', className, intensity = 1, interactive = false, animate = true }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let running = false;
    let start = performance.now();
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    let node = '19, 124, 114';
    let thread = '42, 166, 151';
    const readColors = () => {
      if (tone === 'light') {
        node = '255, 255, 255';
        thread = '220, 255, 248';
        return;
      }
      const cs = getComputedStyle(canvas);
      node = cs.getPropertyValue('--weave-node').trim() || node;
      thread = cs.getPropertyValue('--weave-thread').trim() || thread;
    };
    const isDark = () => document.documentElement.dataset.theme === 'dark';

    // ---------------------------------------------------------------- geometry, built once
    const rand = rng(variant === 'field' ? 7 : 3);
    const KNOT_SAMPLES = 180;
    const knots: V3[][] = [];
    if (variant === 'sculpture') {
      // Three broad loops, each tilted a third of a turn from the next, pass over and under one another: the mark's
      // three woven strands. A small ripple along each loop gives the over-under of a weave.
      for (let k = 0; k < 3; k++) {
        const pts: V3[] = [];
        for (let i = 0; i <= KNOT_SAMPLES; i++) {
          const phi = (i / KNOT_SAMPLES) * TAU;
          const p: V3 = [Math.cos(phi) * 1.12, Math.sin(phi) * 1.12, Math.sin(phi * 3 + k) * 0.16];
          pts.push(rotate(p, (k * TAU) / 3, 1.02, 0.25));
        }
        knots.push(pts);
      }
    }
    // Sculpture nodes sit on the outer peaks of the knot; field nodes fill a slab of space.
    const nodes: Array<{ p: V3; r: number; phase: number }> = [];
    if (variant === 'sculpture') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        const el = (i % 2 ? 0.55 : -0.45) + (rand() - 0.5) * 0.3;
        nodes.push({ p: [Math.cos(a) * 1.55 * Math.cos(el), Math.sin(el) * 1.45, Math.sin(a) * 1.55 * Math.cos(el)], r: 1, phase: rand() * TAU });
      }
      nodes.push({ p: [0, -1.62, 0.2], r: 1.1, phase: 0 });
    } else if (variant === 'field') {
      for (let i = 0; i < 64; i++) nodes.push({ p: [(rand() - 0.5) * 3.6, (rand() - 0.5) * 2.2, (rand() - 0.5) * 2], r: 0.4 + rand() * 0.9, phase: rand() * TAU });
    }
    const dust: V3[] = [];
    const dustCount = variant === 'sculpture' ? 90 : variant === 'field' ? 40 : 0;
    for (let i = 0; i < dustCount; i++) dust.push([(rand() - 0.5) * 4.4, (rand() - 0.5) * 3.2, (rand() - 0.5) * 3]);

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      // Soft, glowing lines gain nothing past 1.5x, and every extra pixel is cleared and redrawn each frame.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.max(1, box.width);
      h = Math.max(1, box.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) draw(performance.now());
    };

    // ---------------------------------------------------------------- drawing
    const glowDot = (x: number, y: number, r: number, a: number, core = true) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.2);
      g.addColorStop(0, `rgba(${node}, ${0.55 * a})`);
      g.addColorStop(0.35, `rgba(${thread}, ${0.18 * a})`);
      g.addColorStop(1, `rgba(${thread}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 4.2, 0, TAU);
      ctx.fill();
      if (!core) return;
      // a glassy sphere: rim-lit body with a soft highlight up and to the side
      const s = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      s.addColorStop(0, `rgba(255, 255, 255, ${0.85 * a})`);
      s.addColorStop(0.35, `rgba(${thread}, ${0.75 * a})`);
      s.addColorStop(1, `rgba(${node}, ${0.35 * a})`);
      ctx.fillStyle = s;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };

    const drawSculpture = (t: number) => {
      const scale = Math.min(w, h) * 0.3;
      const cx = w / 2;
      const cy = h / 2;
      const yaw = t * 0.16 + pointer.x * 0.45;
      const pitch = 0.32 + Math.sin(t * 0.21) * 0.12 + pointer.y * 0.3;
      const roll = Math.sin(t * 0.13) * 0.08;
      const persp = 4.2;
      const project = (v: V3) => {
        const [x, y, z] = rotate(v, yaw, pitch, roll);
        const k = persp / (persp - z);
        return { x: cx + x * scale * k, y: cy + y * scale * k, z, k };
      };
      const dark = isDark() || tone === 'light';

      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';

      // ribbons: each loop is a band of parallel strands, brighter where it comes toward the viewer
      const STRANDS = 9;
      const CHUNK = 9;
      for (const pts of knots) {
        const proj = pts.map(project);
        // the ribbon's body: a broad, faint glass band under the strands
        ctx.lineCap = 'round';
        for (let i = 0; i < proj.length - 1; i += CHUNK) {
          const a = proj[i];
          const b = proj[Math.min(i + CHUNK, proj.length - 1)];
          const depth = (a.z + 1.8) / 3.6;
          ctx.strokeStyle = `rgba(${node}, ${(dark ? 0.11 : 0.09) * (0.35 + depth) * intensity})`;
          ctx.lineWidth = 0.3 * scale * a.k;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        for (let s = 0; s < STRANDS; s++) {
          const off = (s / (STRANDS - 1) - 0.5) * 0.28 * scale;
          const edge = s === 0 || s === STRANDS - 1;
          for (let i = 0; i < proj.length - 1; i += CHUNK) {
            const a = proj[i];
            const end = Math.min(i + CHUNK, proj.length - 1);
            const depth = (a.z + 1.8) / 3.6; // 0 far .. 1 near
            const alpha = (edge ? 0.85 : 0.2) * (0.3 + depth * 0.95) * intensity * (dark ? 1 : 1.3);
            ctx.strokeStyle = `rgba(${edge ? thread : node}, ${alpha})`;
            ctx.lineWidth = edge ? 1.1 : 0.9;
            ctx.beginPath();
            for (let j = i; j <= end; j++) {
              const p = proj[j];
              const q = proj[Math.min(j + 1, proj.length - 1)];
              // offset across the band, perpendicular to the strand on screen
              const dx = q.x - p.x;
              const dy = q.y - p.y;
              const len = Math.hypot(dx, dy) || 1;
              const ox = (-dy / len) * off * p.k;
              const oy = (dx / len) * off * p.k;
              if (j === i) ctx.moveTo(p.x + ox, p.y + oy);
              else ctx.lineTo(p.x + ox, p.y + oy);
            }
            ctx.stroke();
          }
        }
        // a travelling spark along the loop: light running through the weave
        const spark = proj[Math.floor(((t * 0.06) % 1) * (proj.length - 1))];
        if (spark) glowDot(spark.x, spark.y, 2.2 * spark.k, 0.9 * intensity, false);
      }

      // threads of light between the nodes, then the nodes themselves, far to near
      const pn = nodes.map((n) => ({ ...project(n.p), n }));
      ctx.lineWidth = 0.8;
      for (let i = 0; i < pn.length; i++) {
        for (let j = i + 1; j < pn.length; j++) {
          const a = pn[i];
          const b = pn[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > scale * 1.9) continue;
          ctx.strokeStyle = `rgba(${thread}, ${0.22 * (1 - d / (scale * 1.9)) * intensity})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      pn.sort((a, b) => a.z - b.z);
      for (const p of pn) {
        const pulse = 1 + Math.sin(t * 1.3 + p.n.phase) * 0.06;
        glowDot(p.x, p.y, scale * 0.12 * p.k * p.n.r * pulse, (0.6 + ((p.z + 1.8) / 3.6) * 0.5) * intensity);
      }

      for (const d of dust) {
        const p = project([d[0], d[1] + Math.sin(t * 0.3 + d[0]) * 0.05, d[2]]);
        ctx.fillStyle = `rgba(${thread}, ${0.35 * ((p.z + 2) / 4) * intensity})`;
        ctx.fillRect(p.x, p.y, 1.3, 1.3);
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const drawField = (t: number) => {
      const scale = Math.max(w, h) * 0.32;
      const cx = w / 2;
      const cy = h / 2;
      const yaw = t * 0.035 + pointer.x * 0.25;
      const pitch = Math.sin(t * 0.05) * 0.12 + pointer.y * 0.15;
      const persp = 4;
      const pn = nodes.map((n) => {
        const [x, y, z] = rotate(n.p, yaw, pitch);
        const k = persp / (persp - z);
        return { x: cx + x * scale * k, y: cy + y * scale * k, z, k, n };
      });
      const dark = isDark() || tone === 'light';
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const reach = scale * 0.55;
      ctx.lineWidth = 0.7;
      for (let i = 0; i < pn.length; i++) {
        for (let j = i + 1; j < pn.length; j++) {
          const a = pn[i];
          const b = pn[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > reach) continue;
          ctx.strokeStyle = `rgba(${thread}, ${0.16 * (1 - d / reach) * intensity})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (const p of pn) {
        const tw = 0.7 + Math.sin(t * 0.9 + p.n.phase) * 0.3;
        glowDot(p.x, p.y, 1.6 * p.k * p.n.r, 0.55 * tw * intensity, p.n.r > 1);
      }
      for (const d of dust) {
        const [x, y, z] = rotate(d, yaw * 1.4, pitch);
        const k = persp / (persp - z);
        ctx.fillStyle = `rgba(${thread}, ${0.25 * intensity})`;
        ctx.fillRect(cx + x * scale * k, cy + y * scale * k, 1.1, 1.1);
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const drawWaves = (t: number) => {
      const dark = isDark() || tone === 'light';
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const STRANDS = 18;
      const step = Math.max(10, w / 60);
      for (let s = 0; s < STRANDS; s++) {
        const f = s / (STRANDS - 1);
        const band = s % 2 ? 1 : -1; // two interlaced ribbons that cross like warp and weft
        const amp = h * (0.2 + f * 0.08);
        const phase = t * 0.35 * band + f * 0.9;
        ctx.strokeStyle = `rgba(${s % 3 ? thread : node}, ${(0.08 + Math.sin(f * Math.PI) * 0.14) * intensity})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let x = -step; x <= w + step; x += step) {
          const u = x / w;
          const y = h * 0.55 + Math.sin(u * TAU * 0.9 + phase) * amp * band * Math.sin(u * Math.PI * 1.1 + 0.2) + (f - 0.5) * h * 0.18;
          if (x === -step) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    function draw(now: number) {
      const t = (now - start) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      ctx!.clearRect(0, 0, w, h);
      if (variant === 'sculpture') drawSculpture(t + 4);
      else if (variant === 'field') drawField(t + 10);
      else drawWaves(t + 2);
    }

    // The background field drifts so slowly that 20 frames a second look the same as 60, and every frame it skips is
    // a frame the frosted surfaces above it do not have to re-blur.
    const frameGap = variant === 'field' ? 1000 / 20 : variant === 'waves' ? 1000 / 30 : 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= frameGap) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (running || !animate || reduce.matches || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => {
      if (!animate || reduce.matches || !visible || document.hidden) {
        pause();
        draw(performance.now());
      } else play();
    };

    readColors();
    resize();
    // The first frame draws the knot part-way through its turn, so a still frame (reduced motion) is still a composed one.
    start = performance.now();
    sync();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(canvas);
    const mo = new MutationObserver(() => {
      readColors();
      if (!running) draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (interactive) window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener('change', sync);

    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', sync);
      reduce.removeEventListener('change', sync);
    };
  }, [variant, tone, intensity, interactive, animate]);

  return <canvas ref={ref} className={`weave weave--${variant}${className ? ` ${className}` : ''}`} aria-hidden="true" />;
};
