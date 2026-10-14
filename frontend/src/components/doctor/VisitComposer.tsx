import React, { useRef, useState } from 'react';
import { useLang } from '../../context/LangContext.js';
import { Icon } from './bits.js';
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

const DEFAULTS: VisitDraftFields = {
  chief_complaint: '',
  blood_pressure: '120/80',
  pulse: '72',
  temperature: '37.0',
  spo2: '99',
  examination_notes: '',
  diagnosis: '',
  treatment_plan: '',
};

interface Props {
  /** Creates the draft with the existing request. Must throw on failure. */
  onSubmit: (fields: VisitDraftFields) => Promise<void>;
  onCancel: () => void;
}

const errStyle: React.CSSProperties = { fontSize: 13, color: 'var(--color-status-danger-text)', display: 'inline-flex', gap: 6, alignItems: 'center' };

/**
 * Visit draft form. The fields and the create request are the ones the product already had.
 * Unsaved text lives only in this component's memory, and a failed save never clears it.
 */
export const VisitComposer: React.FC<Props> = ({ onSubmit, onCancel }) => {
  const { t } = useLang();
  const C = t.doctor.composer;
  const [f, setF] = useState<VisitDraftFields>(DEFAULTS);
  const [invalid, setInvalid] = useState<{ complaint?: boolean; diagnosis?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const inFlight = useRef(false);
  const complaintRef = useRef<HTMLTextAreaElement>(null);
  const diagnosisRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof VisitDraftFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));
  const dirty = JSON.stringify(f) !== JSON.stringify(DEFAULTS);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return; // blocks a second submit while the first is running
    const next = { complaint: !f.chief_complaint.trim(), diagnosis: !f.diagnosis.trim() };
    if (next.complaint || next.diagnosis) {
      setInvalid(next);
      (next.complaint ? complaintRef : diagnosisRef).current?.focus();
      return;
    }
    setInvalid({});
    setFailed(false);
    inFlight.current = true;
    setSaving(true);
    try {
      await onSubmit({ ...f, chief_complaint: f.chief_complaint.trim(), diagnosis: f.diagnosis.trim() });
    } catch {
      setFailed(true); // keep everything the doctor typed so a retry loses nothing
      inFlight.current = false;
      setSaving(false);
    }
  };

  const tryCancel = () => (dirty ? setAskDiscard(true) : onCancel());
  const filled = [
    f.chief_complaint && [C.complaint, f.chief_complaint],
    f.diagnosis && [C.diagnosis, f.diagnosis],
    f.treatment_plan && [C.plan, f.treatment_plan],
  ].filter(Boolean) as Array<[string, string]>;

  return (
    <form onSubmit={submit} noValidate aria-labelledby="doctor-composer-title" className="cloud-feature-card" style={{ padding: 24, background: 'var(--color-paper-white)', border: '1.5px solid var(--color-charcoal)' }}>
      <h3 id="doctor-composer-title" className="text-card-heading" style={{ fontSize: 20, margin: 0 }}>{C.title}</h3>
      <p style={{ fontSize: 13, color: 'var(--color-body-gray)', margin: '4px 0 2px', display: 'flex', gap: 6, alignItems: 'center' }}>
        {Icon.lock}
        {C.lead}
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-body-gray)', marginBottom: 16 }}>{C.required}</p>

      {(invalid.complaint || invalid.diagnosis) && (
        <div role="alert" style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', fontSize: 14 }}>
          {C.errorsTitle}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 22, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="visit-complaint">{C.complaint} *</label>
            <textarea
              id="visit-complaint" ref={complaintRef} className="form-textarea" dir="auto" style={{ minHeight: 84 }}
              placeholder={C.complaintPlaceholder} value={f.chief_complaint} onChange={set('chief_complaint')}
              aria-required="true" aria-invalid={!!invalid.complaint} aria-describedby={invalid.complaint ? 'visit-complaint-err' : undefined}
            />
            {invalid.complaint && <span id="visit-complaint-err" style={errStyle}>{Icon.octagon}{C.complaintRequired}</span>}
          </div>

          <fieldset style={{ border: 'none' }}>
            <legend className="form-label" style={{ marginBottom: 8 }}>{C.vitals}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 96px), 1fr))', gap: 10 }}>
              {([['blood_pressure', C.bp, 'text'], ['pulse', C.pulse, 'number'], ['temperature', C.temp, 'text'], ['spo2', C.spo2, 'number']] as const).map(([k, label, type]) => (
                <div className="form-group" style={{ margin: 0 }} key={k}>
                  <label className="form-label" htmlFor={`visit-${k}`}>{label}</label>
                  <input id={`visit-${k}`} className="form-input num" type={type} inputMode={type === 'number' ? 'numeric' : 'decimal'} value={f[k]} onChange={set(k)} />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="visit-exam">{C.examination}</label>
            <textarea id="visit-exam" className="form-textarea" dir="auto" value={f.examination_notes} onChange={set('examination_notes')} />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="visit-diagnosis">{C.diagnosis} *</label>
            <input
              id="visit-diagnosis" ref={diagnosisRef} className="form-input" dir="auto" type="text"
              placeholder={C.diagnosisPlaceholder} value={f.diagnosis} onChange={set('diagnosis')}
              aria-required="true" aria-invalid={!!invalid.diagnosis} aria-describedby={invalid.diagnosis ? 'visit-diagnosis-err' : undefined}
            />
            {invalid.diagnosis && <span id="visit-diagnosis-err" style={errStyle}>{Icon.octagon}{C.diagnosisRequired}</span>}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="visit-plan">{C.plan}</label>
            <textarea id="visit-plan" className="form-textarea" dir="auto" placeholder={C.planPlaceholder} value={f.treatment_plan} onChange={set('treatment_plan')} />
          </div>
        </div>

        {/* What will be saved: a plain echo of what was typed, nothing is inferred */}
        <aside aria-labelledby="visit-summary-title" style={{ padding: 16, borderRadius: 16, background: 'var(--color-cloud-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h4 id="visit-summary-title" style={{ fontSize: 15, fontWeight: 560, margin: 0 }}>{C.summaryTitle}</h4>
          {filled.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{C.summaryEmpty}</p>
          ) : (
            filled.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12, fontWeight: 520, color: 'var(--color-body-gray)' }}>{k}</div>
                <div style={{ fontSize: 14, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }} dir="auto">{v}</div>
              </div>
            ))
          )}
          <p style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 4 }}>{C.unsavedNote}</p>
        </aside>
      </div>

      {failed && (
        <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', fontSize: 14 }}>
          {C.saveFailed}
        </div>
      )}

      <div style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18, padding: '12px 0', background: 'var(--color-paper-white)' }}>
        <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={tryCancel} disabled={saving}>
          {C.cancel}
        </button>
        <button type="submit" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} disabled={saving} aria-busy={saving}>
          {saving ? C.saving : failed ? C.retrySave : C.saveDraft}
        </button>
      </div>

      <Dialog open={askDiscard} onClose={() => setAskDiscard(false)} title={C.discardTitle} maxWidth={440} initialFocusId="visit-discard-keep">
        <p style={{ fontSize: 14, color: 'var(--color-body-gray)', marginBottom: 20 }}>{C.discardBody}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={onCancel}>
            {C.discardConfirm}
          </button>
          <button id="visit-discard-keep" type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} onClick={() => setAskDiscard(false)}>
            {C.discardKeep}
          </button>
        </div>
      </Dialog>
    </form>
  );
};
