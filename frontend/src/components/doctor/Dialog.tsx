import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Backdrop, Presence } from '../motion.js';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Element id to focus on open (defaults to the title, so screen readers start at the heading). */
  initialFocusId?: string;
  maxWidth?: number;
  /** Disable Esc/backdrop close while a request is running. */
  locked?: boolean;
  children: React.ReactNode;
}

/** Modal dialog: focus trap, focus restore, Esc to close, aria-modal. Motion comes from the motion layer. */
export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, initialFocusId, maxWidth = 640, locked, children }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnRef.current = document.activeElement as HTMLElement | null;
    // The panel mounts through a portal and a presence animation, so retry for a few frames.
    let raf = 0;
    let tries = 0;
    const focusTarget = () => {
      const target = (initialFocusId && document.getElementById(initialFocusId)) || document.getElementById(titleId);
      if (target) (target as HTMLElement).focus();
      else if (tries++ < 10) raf = requestAnimationFrame(focusTarget);
    };
    raf = requestAnimationFrame(focusTarget);
    return () => {
      cancelAnimationFrame(raf);
      returnRef.current?.focus?.();
    };
  }, [open, initialFocusId, titleId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || active === panelRef.current || active.id === titleId)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, locked, onClose, titleId]);

  // Portalled to <body>: the page view wrapper uses a CSS transform, which would otherwise become the
  // containing block for `position: fixed` and misplace the overlay.
  return createPortal(
    <>
      <Backdrop
        show={open}
        className="modal-overlay"
        style={{ animation: 'none' }}
        onClick={() => !locked && onClose()}
      >
        {null}
      </Backdrop>
      <Presence
        show={open}
        kind="dialog"
        style={{ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, pointerEvents: 'none' }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="modal-content"
          style={{ animation: 'none', maxWidth, pointerEvents: 'auto' }}
        >
          <h2 id={titleId} tabIndex={-1} className="text-card-heading" style={{ fontSize: 22, margin: '0 0 12px', outline: 'none' }}>
            {title}
          </h2>
          {children}
        </div>
      </Presence>
    </>,
    document.body,
  );
};
