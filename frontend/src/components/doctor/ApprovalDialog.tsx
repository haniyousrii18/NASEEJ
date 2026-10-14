import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../../context/LangContext.js';
import { checkInteractions } from '../../lib/ai.js';
import type { Allergy, LabOrder, Prescription, Visit } from '../../lib/types.js';
import { AnimatedCheck, Rise } from '../motion.js';
import { AiTag, Icon } from './bits.js';
import { Dialog } from './Dialog.js';

interface Props {
  open: boolean;
  visit: Visit | null;
  linkedRx: Prescription[];
  linkedLabs: LabOrder[];
  allergies: Allergy[];
  /** Other medicines the patient is already on, so interactions across visits are caught too. */
  otherMedicines: string[];
  /** Calls the existing approve endpoint. Must throw on failure. */
  onApprove: (visitId: string) => Promise<void>;
  onClose: () => void;
  /** Offered after approval when another patient is waiting. */
  onNextPatient?: () => void;
}

const box: React.CSSProperties = { padding: 16, borderRadius: 16, background: 'var(--color-cloud-card)', display: 'flex', flexDirection: 'column', gap: 10 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-body-gray)' };

export const ApprovalDialog: React.FC<Props> = ({ open, visit, linkedRx, linkedLabs, allergies, otherMedicines, onApprove, onClose, onNextPatient }) => {
  const { t, isRtl } = useLang();
  const A = t.doctor.approval;
  const [stage, setStage] = useState<'review' | 'done'>('review');
  const [acked, setAcked] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const snapshot = useRef<Visit | null>(null);

  // Fresh state every time the dialog opens for a visit.
  useEffect(() => {
    if (open) {
      setStage('review');
      setAcked(false);
      setWorking(false);
      setFailed(false);
      inFlight.current = false;
      snapshot.current = visit;
    }
  }, [open, visit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const meds = useMemo(() => linkedRx.flatMap((p) => p.items), [linkedRx]);
  const high = useMemo(
    () => checkInteractions([...meds.map((m) => m.medication_name), ...otherMedicines], allergies).filter((x) => x.severity === 'high'),
    [meds, otherMedicines, allergies],
  );

  const checks = [
    { key: 'complaint' as const, ok: !!visit?.chief_complaint?.trim() },
    { key: 'diagnosis' as const, ok: !!visit?.diagnosis?.trim() },
    ...(high.length > 0 ? [{ key: 'interaction' as const, ok: acked }] : []),
  ];
  const ready = checks.every((c) => c.ok);

  const approve = async () => {
    if (!visit || !ready || inFlight.current) return; // double-submit guard
    inFlight.current = true;
    setWorking(true);
    setFailed(false);
    try {
      await onApprove(visit.id);
      setStage('done');
    } catch {
      setFailed(true);
      inFlight.current = false;
    } finally {
      setWorking(false);
    }
  };

  // After approval, move focus to the confirmation heading.
  useEffect(() => {
    if (stage === 'done') requestAnimationFrame(() => document.getElementById('doctor-approval-done-title')?.focus());
  }, [stage]);

  // Ctrl+Enter approves, but only while this dialog is open and every readiness check passes.
  useEffect(() => {
    if (!open || stage !== 'review') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void approve();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // re-bound each render so it always sees the latest readiness

  const shown = stage === 'done' ? snapshot.current ?? visit : visit;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stage === 'done' ? A.doneTitle : A.title}
      maxWidth={760}
      locked={working}
      initialFocusId={stage === 'review' ? 'doctor-approval-confirm' : undefined}
    >
      {stage === 'review' ? (
        <>
          <p style={{ fontSize: 14, color: 'var(--color-body-gray)', marginBottom: 16 }}>{A.lead}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
            {/* What the patient will receive */}
            <div style={box}>
              <div style={label}>{A.patientGets}</div>
              <div>
                <div style={label}>{A.diagnosis}</div>
                <div style={{ fontSize: 15, fontWeight: 600 }} dir="auto">{shown?.diagnosis || A.none}</div>
              </div>
              <div>
                <div style={label}>{A.plan}</div>
                <div style={{ fontSize: 14, whiteSpace: 'pre-line' }} dir="auto">{shown?.treatment_plan || A.none}</div>
              </div>
              <div>
                <div style={label}>{A.meds}</div>
                {meds.length === 0 ? (
                  <div style={{ fontSize: 14 }}>{A.none}</div>
                ) : (
                  <ul style={{ listStyle: 'none', fontSize: 14 }}>
                    {meds.map((m) => (
                      <li key={m.id}><bdi className="latin" style={{ fontWeight: 600 }}>{m.medication_name}</bdi> · <bdi className="num">{m.dosage}</bdi></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div style={label}>{A.labs}</div>
                <div style={{ fontSize: 14 }} dir="auto">{linkedLabs.length ? linkedLabs.map((l) => (isRtl ? l.test_name_ar : l.test_name_en)).join('، ') : A.none}</div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{A.stillDraft}</p>
            </div>

            {/* Readiness */}
            <div style={box}>
              <div style={label}>{A.readiness}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checks.map((c) => (
                  <li key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <span style={{ color: c.ok ? 'var(--color-status-approved-text)' : 'var(--color-status-draft-text)' }}>{c.ok ? Icon.check : Icon.cross}</span>
                    <span>{A.item[c.key]}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>({c.ok ? A.okItem : A.missingItem})</span>
                  </li>
                ))}
              </ul>

              {high.length > 0 && (
                <Rise urgent role="alert">
                  <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ color: 'var(--color-status-danger-text)' }}>{Icon.octagon}</span>
                      <strong style={{ fontSize: 14 }}>{t.doctor.brief.interactionTitle}</strong>
                      <AiTag />
                    </div>
                    {high.map((x) => (
                      <div key={x.id} style={{ fontSize: 13 }} dir="auto">
                        {x.a} + {x.b}: {isRtl ? x.message_ar : x.message_en}
                      </div>
                    ))}
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, fontSize: 14, minHeight: 44, cursor: 'pointer' }}>
                      <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--color-charcoal)' }} />
                      <span>{A.ackInteraction}</span>
                    </label>
                  </div>
                </Rise>
              )}

              {!ready && <p style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{A.blockedHint}</p>}
            </div>
          </div>

          {failed && (
            <div role="alert" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', fontSize: 14 }}>
              {A.error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{A.shortcut}</span>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={onClose} disabled={working}>
              {A.cancel}
            </button>
            <button
              id="doctor-approval-confirm"
              type="button"
              className="btn-pill btn-pill-charcoal"
              style={{ minHeight: 44 }}
              disabled={!ready || working}
              aria-busy={working}
              onClick={approve}
            >
              ✓ {working ? A.working : A.confirm}
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <AnimatedCheck />
          <h3 id="doctor-approval-done-title" tabIndex={-1} className="text-card-heading" style={{ fontSize: 22, margin: 0, outline: 'none' }}>
            {A.doneTitle}
          </h3>
          <p role="status" aria-live="polite" style={{ fontSize: 14, color: 'var(--color-body-gray)' }}>
            {A.doneAnnounce} {A.doneBody}
          </p>
          <div style={{ ...box, alignSelf: 'stretch', textAlign: 'start' }}>
            <div style={label}>{A.doneSent}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }} dir="auto">{shown?.diagnosis}</div>
            {meds.length > 0 && <div style={{ fontSize: 14 }} dir="auto">{meds.map((m) => m.medication_name).join(' · ')}</div>}
            {shown?.treatment_plan && <div style={{ fontSize: 14, whiteSpace: 'pre-line' }} dir="auto">{shown.treatment_plan}</div>}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className={`btn-pill ${onNextPatient ? 'btn-pill-ghost' : 'btn-pill-charcoal'}`} style={{ minHeight: 44 }} onClick={onClose}>
              {A.doneNext}
            </button>
            {onNextPatient && (
              <button type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} onClick={onNextPatient}>
                {A.doneNextPatient}
              </button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
};
