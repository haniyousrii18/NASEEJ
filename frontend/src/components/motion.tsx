// Framer Motion layer for the doctor workspace. Feature code imports from here only.
// Rules: opacity/transform only, 120-400ms, ease-out in / ease-in out, nothing loops, and
// safety information (`urgent`) is never delayed. MotionRoot sets reducedMotion="user", so
// transforms are dropped when the OS asks for reduced motion.

import React from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;
const STAGGER_STEP = 0.05;
const STAGGER_CAP = 8;

export const MotionRoot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="user">
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  </MotionConfig>
);

interface BoxProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  'aria-live'?: 'polite' | 'assertive';
}

/** Fade + small rise. `urgent` appears immediately: no delay, no travel. */
export const Rise: React.FC<BoxProps & { urgent?: boolean; delay?: number }> = ({ urgent, delay = 0, children, ...rest }) => (
  <m.div
    {...rest}
    initial={urgent ? { opacity: 0 } : { opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={urgent ? { duration: 0.12 } : { duration: 0.28, delay, ease: EASE_OUT }}
  >
    {children}
  </m.div>
);

/** Staggered entrance of direct children. The 9th item onwards enters together with the 8th. */
export const Stagger: React.FC<BoxProps> = ({ children, ...rest }) => (
  <div {...rest}>
    {React.Children.toArray(children).map((child, i) => (
      <Rise key={(child as React.ReactElement).key ?? i} delay={Math.min(i, STAGGER_CAP) * STAGGER_STEP}>
        {child}
      </Rise>
    ))}
  </div>
);

/** Cross-fades a skeleton into the real content. Keep a min-height on the parent to avoid layout shift. */
export const LoadSwap: React.FC<{ ready: boolean; skeleton: React.ReactNode; children: React.ReactNode; swapKey?: string }> = ({
  ready, skeleton, children, swapKey,
}) => (
  <AnimatePresence mode="wait" initial={false}>
    <m.div
      key={ready ? `ready-${swapKey ?? ''}` : 'skeleton'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.24, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
    >
      {ready ? children : skeleton}
    </m.div>
  </AnimatePresence>
);

type PresenceKind = 'dialog' | 'popover' | 'panel';
const presence = (kind: PresenceKind, dir: 1 | -1) => {
  switch (kind) {
    case 'popover':
      return { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 }, enter: 0.16, leave: 0.12 };
    case 'panel':
      return { initial: { opacity: 0, x: 16 * dir }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 16 * dir }, enter: 0.28, leave: 0.18 };
    default:
      return { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, enter: 0.24, leave: 0.16 };
  }
};

/** Mount/unmount with an enter and a shorter exit. `dir` mirrors horizontal travel for RTL. */
export const Presence: React.FC<BoxProps & { show: boolean; kind?: PresenceKind; dir?: 1 | -1 }> = ({
  show, kind = 'dialog', dir = 1, children, ...rest
}) => {
  const p = presence(kind, dir);
  return (
    <AnimatePresence>
      {show && (
        <m.div
          {...rest}
          initial={p.initial}
          animate={{ ...p.animate, transition: { duration: p.enter, ease: EASE_OUT } }}
          exit={{ ...p.exit, transition: { duration: p.leave, ease: EASE_IN } }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
};

/** Dimmed backdrop that fades with its dialog. */
export const Backdrop: React.FC<BoxProps & { show: boolean; onClick?: () => void }> = ({ show, children, onClick, ...rest }) => (
  <AnimatePresence>
    {show && (
      <m.div
        {...rest}
        onClick={onClick}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.16, ease: EASE_OUT } }}
        exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
      >
        {children}
      </m.div>
    )}
  </AnimatePresence>
);

/** One-shot check mark draw (<= 400ms). Decorative: the surrounding text carries the meaning. */
export const AnimatedCheck: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <m.circle
      cx="24" cy="24" r="21" stroke="var(--color-recovery-green)" strokeWidth="3"
      initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3, ease: EASE_OUT }}
    />
    <m.path
      d="M14 25l7 7 13-15" stroke="var(--color-recovery-green)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.28, delay: 0.14, ease: EASE_OUT }}
    />
  </svg>
);

/**
 * Wraps newly arrived content with a brief tint (opacity only, <= 800ms). Always pair with a
 * visible "New" icon + word (see NewTag) so the state never depends on colour or motion.
 */
export const Highlight: React.FC<BoxProps & { active: boolean }> = ({ active, children, style, ...rest }) => (
  <div {...rest} style={{ position: 'relative', ...style }}>
    {active && (
      <m.span
        aria-hidden="true"
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
        style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'var(--color-selection)', pointerEvents: 'none' }}
      />
    )}
    {children}
  </div>
);
