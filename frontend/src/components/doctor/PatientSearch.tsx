import React, { useEffect, useMemo, useState } from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import type { Patient } from '../../lib/types.js';
import { Icon } from './bits.js';
import { Dialog } from './Dialog.js';

interface Props {
  open: boolean;
  patients: Patient[];
  waitingIds: Set<string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Command-palette style patient search over the already-loaded list. */
export const PatientSearch: React.FC<Props> = ({ open, patients, waitingIds, onSelect, onClose }) => {
  const { t, isRtl } = useLang();
  const S = t.doctor.search;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? patients.filter((p) => [p.full_name_ar, p.full_name_en, p.mrn, p.national_id ?? ''].some((v) => v.toLowerCase().includes(needle)))
      : patients;
    // Patients who are checked in come first.
    return [...list].sort((a, b) => Number(waitingIds.has(b.id)) - Number(waitingIds.has(a.id))).slice(0, 8);
  }, [q, patients, waitingIds]);

  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active].id); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={S.label} maxWidth={520} initialFocusId="doctor-search-input">
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <span style={{ position: 'absolute', insetInlineStart: 14, top: 14, color: 'var(--color-body-gray)' }}>{Icon.search}</span>
        <input
          id="doctor-search-input"
          className="form-input"
          style={{ paddingInlineStart: 40, minHeight: 44 }}
          role="combobox"
          aria-expanded="true"
          aria-controls="doctor-search-list"
          aria-activedescendant={results[active] ? `doctor-search-${results[active].id}` : undefined}
          aria-label={S.label}
          placeholder={S.placeholder}
          value={q}
          dir="auto"
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onKey}
        />
      </div>
      <div role="status" aria-live="polite" style={{ fontSize: 12, color: 'var(--color-body-gray)', minHeight: 18 }}>
        {results.length === 0 ? S.empty : fmt(S.results, { n: results.length })}
      </div>
      <ul id="doctor-search-list" role="listbox" aria-label={S.label} style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0 12px' }}>
        {results.map((p, i) => (
          <li
            key={p.id}
            id={`doctor-search-${p.id}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(p.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 14px',
              borderRadius: 12, cursor: 'pointer',
              background: i === active ? 'var(--color-cloud-card-hover)' : 'transparent',
              border: `1.5px solid ${i === active ? 'var(--color-charcoal)' : 'var(--color-border-subtle)'}`,
            }}
          >
            <span style={{ fontWeight: 600 }} dir="auto">{isRtl ? p.full_name_ar : p.full_name_en}</span>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              {waitingIds.has(p.id) && <span className="status-badge badge-approved" style={{ fontSize: 11 }}>{Icon.check}<span>{t.doctor.queue.title}</span></span>}
              <bdi className="num" style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{p.mrn}</bdi>
            </span>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{S.hint}</p>
    </Dialog>
  );
};
