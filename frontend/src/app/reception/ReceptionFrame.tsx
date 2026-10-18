import React, { useEffect, useState } from 'react';
import { AppIcon } from '../AppIcons.js';
import { useA } from '../useA.js';
import { QuickFind } from './QuickFind.js';

/** True while the key goes to something the user is typing into. */
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Wraps every reception page with the patient quick-find: a button above the page and the "/" shortcut.
 * The shortcut stays out of the way while typing and while a drawer or dialog is already open.
 */
export const ReceptionFrame: React.FC<{ navigate: (r: string) => void; children: React.ReactNode }> = ({ navigate, children }) => {
  const A = useA();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="na-qf-bar">
        <button type="button" className="na-qf-btn" onClick={() => setOpen(true)} aria-keyshortcuts="/">
          <AppIcon name="search" size={16} />
          <span>{A.reception.find.button}</span>
          <kbd aria-hidden="true">/</kbd>
        </button>
      </div>
      {children}
      {open && <QuickFind navigate={navigate} onClose={() => setOpen(false)} />}
    </>
  );
};
