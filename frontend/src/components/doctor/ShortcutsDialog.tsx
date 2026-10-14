import React from 'react';
import { useLang } from '../../context/LangContext.js';
import { Dialog } from './Dialog.js';

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd dir="ltr" className="doctor-kbd">
    {children}
  </kbd>
);

export const ShortcutsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useLang();
  const S = t.doctor.shortcuts;
  const rows: Array<[React.ReactNode, string]> = [
    [<><Kbd>/</Kbd> / <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd></>, S.search],
    [<><Kbd>[</Kbd> <Kbd>]</Kbd></>, S.prevNext],
    [<><Kbd>G</Kbd> {S.then} <Kbd>D</Kbd></>, S.dashboard],
    [<><Kbd>F</Kbd></>, S.focus],
    [<><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd></>, S.approve],
    [<Kbd>Esc</Kbd>, S.escape],
    [<Kbd>?</Kbd>, S.help],
  ];
  return (
    <Dialog open={open} onClose={onClose} title={S.title} maxWidth={520} initialFocusId="doctor-shortcuts-close">
      <table className="data-table" style={{ marginBottom: 12 }}>
        <tbody>
          {rows.map(([keys, label], i) => (
            <tr key={i}>
              <th scope="row" style={{ textAlign: 'start', whiteSpace: 'nowrap', fontWeight: 400 }}>{keys}</th>
              <td>{label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{S.note}</p>
      <p style={{ fontSize: 12, color: 'var(--color-body-gray)', marginBottom: 16 }}>{S.optional}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button id="doctor-shortcuts-close" type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} onClick={onClose}>
          {S.close}
        </button>
      </div>
    </Dialog>
  );
};
