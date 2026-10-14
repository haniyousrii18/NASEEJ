import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../../context/LangContext.js';
import { checkInteractions, parseVisit, type ParsedItem, type ParsedKind } from '../../lib/ai.js';
import { fmt } from '../../lib/format.js';
import type { Allergy } from '../../lib/types.js';
import { Highlight, Rise } from '../motion.js';
import { AiTag, Icon, NewTag } from './bits.js';
import { Dialog } from './Dialog.js';

export interface VisitDraftFields {
  chief_complaint: string;
  blood_pressure: string;
  pulse: string;
  temperature: string;
  spo2: string;
  examination_notes: string;
  diagnosis: string;
  treatment_plan: string;
}

const DEFAULT_VITALS = { blood_pressure: '120/80', pulse: '72', temperature: '37.0', spo2: '99' };
const DEBOUNCE_MS = 250;
const LIST_KINDS: ParsedKind[] = ['medicine', 'test', 'followup'];

interface Props {
  allergies: Allergy[];
  currentMedicines: string[];
  /** Creates the draft with the existing request. Must throw on failure. */
  onSubmit: (fields: VisitDraftFields) => Promise<void>;
  onCancel: () => void;
}

export const VisitComposer: React.FC<Props> = ({ allergies, currentMedicines, onSubmit, onCancel }) => {
  const { t } = useLang();
  const C = t.doctor.composer;

  const [dictation, setDictation] = useState('');
  const [debounced, setDebounced] = useState('');
  const [vitals, setVitals] = useState(DEFAULT_VITALS);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState('');
  const [errors, setErrors] = useState<{ complaint?: boolean; diagnosis?: boolean; save?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const knownIds = useRef<Set<string>>(new Set());
  const complaintRef = useRef<HTMLInputElement>(null);
  const diagnosisRef = useRef<HTMLInputElement>(null);

  // Debounced parsing: structure appears while typing, within ~250ms of the last keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(dictation), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [dictation]);

  const typing = dictation !== debounced;
  const parsed = useMemo(() => parseVisit(debounced), [debounced]);

  // Mark items that appeared in this parse so they enter with a highlight and a "New" tag.
  useEffect(() => {
    const newIds = parsed.map((p) => p.id).filter((id) => !knownIds.current.has(id));
    parsed.forEach((p) => knownIds.current.add(p.id));
    if (newIds.length === 0) return;
    setFresh(new Set(newIds));
    const id = window.setTimeout(() => setFresh(new Set()), 2200);
    return () => window.clearTimeout(id);
  }, [parsed]);

  const visible = parsed.filter((p) => !removed.has(p.id));
  const textOf = (p: ParsedItem) => overrides[p.id] ?? p.text;
  const single = (kind: 'complaint' | 'diagnosis') => overrides[kind] ?? parsed.find((p) => p.id === kind)?.text ?? '';
  const complaint = single('complaint');
  const diagnosis = single('diagnosis');
  const listItems = (kind: ParsedKind) => visible.filter((p) => p.kind === kind);

  const medicines = listItems('medicine').map(textOf);
  const interactions = useMemo(
    () => checkInteractions([...medicines, ...currentMedicines], allergies),
    [medicines.join('|'), currentMedicines.join('|'), allergies], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // One polite announcement per settled parse, never per keystroke.
  useEffect(() => {
    if (typing) return;
    if (visible.length > 0) setAnnounce(fmt(C.structureReady, { n: visible.length }));
  }, [typing, visible.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    dictation.trim() !== '' || Object.keys(overrides).length > 0 || JSON.stringify(vitals) !== JSON.stringify(DEFAULT_VITALS);

  const removeItem = (id: string) => {
    setRemoved((r) => new Set(r).add(id));
    setAnnounce(C.removed);
  };

  const buildPlan = () =>
    LIST_KINDS.flatMap((kind) => {
      const lines = listItems(kind).map(textOf).filter(Boolean);
      return lines.length ? [`${C.kind[kind]}: ${lines.join('، ')}`] : [];
    }).join('\n');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next = { complaint: !complaint.trim(), diagnosis: !diagnosis.trim() };
    if (next.complaint || next.diagnosis) {
      setErrors(next);
      (next.complaint ? complaintRef : diagnosisRef).current?.focus();
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit({
        chief_complaint: complaint.trim(),
        ...vitals,
        examination_notes: dictation.trim(),
        diagnosis: diagnosis.trim(),
        treatment_plan: buildPlan(),
      });
    } catch {
      setErrors({ save: true });
      setSaving(false);
    }
  };

  const tryCancel = () => (dirty ? setAskDiscard(true) : onCancel());

  const status = typing ? C.structureTyping : visible.length === 0 ? (dictation.trim() ? C.structureNone : C.structureEmpty) : null;

  const itemRow = (p: ParsedItem) => (
    <Highlight key={p.id} active={fresh.has(p.id)} style={{ borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="form-input"
          aria-label={`${C.editItem}: ${C.kind[p.kind]}`}
          value={textOf(p)}
          dir="auto"
          onChange={(e) => setOverrides((o) => ({ ...o, [p.id]: e.target.value }))}
        />
        {fresh.has(p.id) && <NewTag />}
        <button type="button" className="btn-pill btn-pill-ghost" style={{ minWidth: 44, minHeight: 44, padding: 0 }} aria-label={`${C.remove}: ${textOf(p)}`} onClick={() => removeItem(p.id)}>
          {Icon.cross}
        </button>
      </div>
    </Highlight>
  );

  return (
    <form onSubmit={submit} noValidate aria-labelledby="doctor-composer-title" className="cloud-feature-card" style={{ padding: 28, background: 'var(--color-paper-white)', border: '1.5px solid var(--color-charcoal)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h3 id="doctor-composer-title" className="text-card-heading" style={{ fontSize: 20, margin: 0 }}>
            {C.title}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--color-body-gray)', marginTop: 4 }}>{C.reminder}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24, alignItems: 'start' }}>
        {/* Start side: dictation + vitals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="doctor-dictation">{C.dictationLabel}</label>
            <textarea
              id="doctor-dictation"
              className="form-textarea"
              style={{ minHeight: 260 }}
              dir="auto"
              value={dictation}
              placeholder={C.dictationPlaceholder}
              aria-describedby="doctor-dictation-hint"
              onChange={(e) => setDictation(e.target.value)}
            />
            <span id="doctor-dictation-hint" style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{C.dictationHint}</span>
          </div>

          <fieldset style={{ border: 'none' }}>
            <legend className="form-label" style={{ marginBottom: 8 }}>{C.vitals}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: 10 }}>
              {([['blood_pressure', C.bp, 'text'], ['pulse', C.pulse, 'number'], ['temperature', C.temp, 'text'], ['spo2', C.spo2, 'number']] as const).map(([k, label, type]) => (
                <div className="form-group" style={{ margin: 0 }} key={k}>
                  <label className="form-label" htmlFor={`doctor-vital-${k}`}>{label}</label>
                  <input id={`doctor-vital-${k}`} className="form-input num" type={type} inputMode={type === 'number' ? 'numeric' : 'decimal'} value={vitals[k]} onChange={(e) => setVitals((v) => ({ ...v, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        {/* End side: live structure */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 18, background: 'var(--color-cloud-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{C.structureTitle}</h4>
            <AiTag withNote />
          </div>

          <div role="status" aria-live="polite" style={{ fontSize: 13, color: 'var(--color-body-gray)', minHeight: 20 }}>
            {status ?? announce}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="doctor-complaint">{C.kind.complaint} *</label>
            <input
              id="doctor-complaint" ref={complaintRef} className="form-input" dir="auto" value={complaint}
              aria-invalid={!!errors.complaint} aria-describedby={errors.complaint ? 'doctor-complaint-err' : undefined}
              onChange={(e) => setOverrides((o) => ({ ...o, complaint: e.target.value }))}
            />
            {errors.complaint && <span id="doctor-complaint-err" role="alert" style={{ fontSize: 12, color: 'var(--color-status-danger-text)' }}>{C.complaintRequired}</span>}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="doctor-diagnosis">{C.kind.diagnosis} *</label>
            <input
              id="doctor-diagnosis" ref={diagnosisRef} className="form-input" dir="auto" value={diagnosis}
              aria-invalid={!!errors.diagnosis} aria-describedby={errors.diagnosis ? 'doctor-diagnosis-err' : undefined}
              onChange={(e) => setOverrides((o) => ({ ...o, diagnosis: e.target.value }))}
            />
            {errors.diagnosis && <span id="doctor-diagnosis-err" role="alert" style={{ fontSize: 12, color: 'var(--color-status-danger-text)' }}>{C.diagnosisRequired}</span>}
          </div>

          {LIST_KINDS.map((kind) => {
            const rows = listItems(kind);
            if (rows.length === 0) return null;
            return (
              <div key={kind}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-body-gray)', marginBottom: 6 }}>{C.kind[kind]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{rows.map(itemRow)}</div>
              </div>
            );
          })}

          {interactions.length > 0 && (
            <Rise urgent role="alert">
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', fontSize: 13 }}>
                {interactions.map((x) => (
                  <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--color-status-danger-text)', marginTop: 2 }}>{Icon.octagon}</span>
                    <span dir="auto">{fmt(C.interactionInline, { a: x.a, b: x.b })}</span>
                  </div>
                ))}
              </div>
            </Rise>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 14 }}>{C.localNote}</p>

      {errors.save && (
        <div role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', fontSize: 14 }}>
          {C.saveFailed}
        </div>
      )}

      {/* Always reachable: the action bar sticks to the bottom of the viewport while the form is long. */}
      <div style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, padding: '12px 0', background: 'var(--color-paper-white)' }}>
        <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={tryCancel} disabled={saving}>
          {C.cancel}
        </button>
        <button type="submit" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} disabled={saving} aria-busy={saving}>
          {saving ? C.saving : C.saveDraft}
        </button>
      </div>

      <Dialog open={askDiscard} onClose={() => setAskDiscard(false)} title={C.discardTitle} maxWidth={440} initialFocusId="doctor-discard-keep">
        <p style={{ fontSize: 14, color: 'var(--color-body-gray)', marginBottom: 20 }}>{C.discardBody}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={onCancel}>
            {C.discardConfirm}
          </button>
          <button id="doctor-discard-keep" type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} onClick={() => setAskDiscard(false)}>
            {C.discardKeep}
          </button>
        </div>
      </Dialog>
    </form>
  );
};
