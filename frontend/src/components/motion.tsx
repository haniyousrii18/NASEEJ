// Naseej motion system (Framer Motion). One vocabulary used everywhere, shared with the CSS layer in theme.css:
//   enter    240-600ms, exponential ease-out, 14-28px travel; sections reveal on scroll
//   stagger  50ms between siblings, capped at 8 so long lists never feel slow
//   press    scale 0.98 on tap, plus a small lift on hover for interactive surfaces
//   overlays fade in; side panels slide from their edge (flipped for RTL)
//   urgent   alerts render immediately: <Rise urgent> skips delay and travel
// <MotionRoot> (public site) ignores the OS reduce-motion setting; <WorkspaceMotion> (signed-in app) honours it.
// Only opacity and transform are animated, and nothing loops.

import React from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';

export { AnimatePresence };
export const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;
export const SPRING = { type: 'spring', stiffness: 520, damping: 38 } as const;
export const SPRING_SOFT = { type: 'spring', stiffness: 320, damping: 30 } as const;

const STAGGER_STEP = 0.05;
const STAGGER_CAP = 8;

type Tag = keyof React.JSX.IntrinsicElements;
interface BoxProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  as?: Tag;
  children?: React.ReactNode;
}

// `m` is a proxy keyed by tag name; the index access is the one place that needs a loose type.
const tagOf = (as: Tag) => (m as unknown as Record<string, React.ElementType>)[as];

// The public site's motion always plays, by product decision. The signed-in workspace wraps itself in
// <WorkspaceMotion>, which goes back to honouring the system "reduce motion" setting.
export const MotionRoot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="never">
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  </MotionConfig>
);

export const WorkspaceMotion: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="user">{children}</MotionConfig>
);

/** Whole-page enter, keyed by view in the shell. There is no exit, so navigation never feels slow. */
export const PageTransition: React.FC<BoxProps> = ({ children, as = 'div', ...rest }) => {
  const Tag = tagOf(as);
  return (
    <Tag {...rest} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE }}>
      {children}
    </Tag>
  );
};

const riseVariants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, STAGGER_CAP) * STAGGER_STEP, duration: 0.4, ease: EASE } }),
  now: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/** Staggered rise-in for cards, rows and list items: <Rise as="li" i={index}>. `urgent` shows at once (safety information is never delayed). */
export const Rise: React.FC<BoxProps & { i?: number; urgent?: boolean }> = ({ as = 'div', i = 0, urgent = false, children, ...rest }) => {
  const Tag = tagOf(as);
  return (
    <Tag {...rest} variants={riseVariants} initial={urgent ? 'now' : 'hidden'} animate={urgent ? 'now' : 'show'} custom={i}>
      {children}
    </Tag>
  );
};

/** Staggered entrance of direct children (30ms apart, capped at 6). */
export const Stagger: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...rest }) => (
  <div {...rest}>
    {React.Children.toArray(children).map((child, i) => (
      <Rise key={(child as React.ReactElement).key ?? i} i={i}>
        {child}
      </Rise>
    ))}
  </div>
);

/** Scroll reveal: animates once when the block enters the viewport. */
export const Reveal: React.FC<BoxProps & { i?: number; y?: number }> = ({ as = 'div', i = 0, y = 28, children, ...rest }) => {
  const Tag = tagOf(as);
  return (
    <Tag
      {...rest}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ delay: Math.min(i, 4) * 0.08, duration: 0.6, ease: EASE }}
    >
      {children}
    </Tag>
  );
};

/** Interactive surface feedback: presses on tap. Surfaces stay flat, so there is no hover lift. */
export const Pressable: React.FC<BoxProps> = ({ as = 'div', children, ...rest }) => {
  const Tag = tagOf(as);
  return (
    <Tag {...rest} whileTap={{ scale: 0.98 }} transition={{ duration: 0.16, ease: EASE }}>
      {children}
    </Tag>
  );
};

/** Height-animated reveal for accordions and expanding rows. */
export const Collapse: React.FC<{ open: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>> = ({ open, children, ...rest }) => (
  <AnimatePresence initial={false}>
    {open ? (
      <m.div
        key="c"
        {...(rest as object)}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        style={{ overflow: 'hidden' }}
      >
        {children}
      </m.div>
    ) : null}
  </AnimatePresence>
);

/**
 * Swaps a skeleton for the real content. The skeleton goes away immediately (content never waits on an
 * exit animation) and the content fades in over 240ms. Keep a min-height on the parent to avoid layout shift.
 */
export const LoadSwap: React.FC<{ ready: boolean; skeleton: React.ReactNode; children: React.ReactNode; swapKey?: string }> = ({
  ready, skeleton, children, swapKey,
}) =>
  ready ? (
    <m.div key={`ready-${swapKey ?? ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.24, ease: EASE }}>
      {children}
    </m.div>
  ) : (
    <div key="skeleton">{skeleton}</div>
  );

type PresenceKind = 'dialog' | 'popover' | 'panel';
const presence = (kind: PresenceKind, dir: 1 | -1) => {
  switch (kind) {
    case 'popover':
      return { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 }, enter: 0.16, leave: 0.12 };
    case 'panel':
      return { initial: { opacity: 0, x: 8 * dir }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 8 * dir }, enter: 0.24, leave: 0.16 };
    default:
      return { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, enter: 0.24, leave: 0.14 };
  }
};

/** Mount/unmount with an enter and a shorter exit. `slide` mirrors horizontal travel for RTL (-1). */
export const Presence: React.FC<React.HTMLAttributes<HTMLDivElement> & { show: boolean; kind?: PresenceKind; slide?: 1 | -1 }> = ({
  show, kind = 'dialog', slide = 1, children, ...rest
}) => {
  const p = presence(kind, slide);
  return (
    <AnimatePresence>
      {show && (
        <m.div
          {...(rest as object)}
          initial={p.initial}
          animate={{ ...p.animate, transition: { duration: p.enter, ease: EASE } }}
          exit={{ ...p.exit, transition: { duration: p.leave, ease: EASE_IN } }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
};

/** Dimmed backdrop that fades with its dialog. */
export const Backdrop: React.FC<React.HTMLAttributes<HTMLDivElement> & { show: boolean }> = ({ show, children, onClick, ...rest }) => (
  <AnimatePresence>
    {show && (
      <m.div
        {...(rest as object)}
        onClick={onClick}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.16, ease: EASE } }}
        exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
      >
        {children}
      </m.div>
    )}
  </AnimatePresence>
);

/** Key figures count up to their value (~0.9s). With reduced motion, or for non-numeric values, they show at once. */
export const CountUp: React.FC<{ value: React.ReactNode }> = ({ value }) => {
  const target = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const [shown, setShown] = React.useState<number | null>(target === null ? null : 0);

  React.useEffect(() => {
    if (target === null) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) {
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return <span className="num" aria-label={target === null ? undefined : String(target)}>{target === null ? value : shown}</span>;
};

/** A bar that fills to `value` (0..1). Used for progress and completion. */
export const GrowBar: React.FC<{ value: number; className?: string; style?: React.CSSProperties }> = ({ value, className, style }) => (
  <div
    className={className}
    style={{ height: 8, overflow: 'hidden', borderRadius: 999, background: 'var(--color-cloud-card-hover)', ...style }}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}
  >
    <m.div
      style={{ height: '100%', width: '100%', borderRadius: 999, background: 'var(--color-recovery-green)', transformOrigin: 'left center' }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: Math.max(0, Math.min(1, value)) }}
      transition={{ duration: 0.45, ease: EASE }}
    />
  </div>
);

/** A check mark that draws itself, for "approved" and success moments. Decorative: the text beside it carries the meaning. */
export const AnimatedCheck: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <m.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-recovery-green)"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    initial={{ scale: 0.6, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: 'spring', stiffness: 380, damping: 18 }}
  >
    <m.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.45, ease: EASE }} />
  </m.svg>
);
