import React, { useEffect, useRef } from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import type { Visit } from '../../lib/types.js';
import { AnimatedCheck } from '../motion.js';
import { Icon, StatusChip, VisibilityChip } from './bits.js';
import { Dialog } from './Dialog.js';
import { useApprovalFlow } from './useApprovalFlow.js';

interface Props {
  open: boolean;
  visit: Visit | null;
  linkedRxCount: number;
  linkedLabCount: number;
  /** Calls the existing approve endpoint. Must throw on failure. */
  onApprove: (visitId: string) => Promise<void>;
  onClose: () => void;
  /** Offered after approval when another patient is waiting. */
  onNextPatient?: () => void;
}

const box: React.CSSProperties = { padding: 16, borderRadius: 16, background: 'var(--color-cloud-card)', display: 'flex', flexDirection: 'column', gap: 10 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 520, color: 'var(--color-body-gray)' };
const value: React.CSSProperties = { fontSize: 14, whiteSpace: 'pre-line', overflowWrap: 'anywhere' };

/**
 * Explicit approval step. The visit is only shown as approved after the API confirms it, a second
 * submit is ignored while one is running, and a failure leaves the visit untouched with a retry.
 */
export const ApprovalDialog: React.FC<Props> = ({ open, visit, linkedRxCount, linkedLabCount, onApprove, onClose, onNextPatient }) => {
  const { t } = useLang();
  const A = t.doctor.approval;
  const snapshot = useRef<Visit | null>(null);
  const { stage, working, failed, approve } = useApprovalFlow(open, visit?.id, async () => {
    if (visit) await onApprove(visit.id);
  });

  // Keep what was on screen when the dialog opened, so the confirmation still shows it after the list refreshes.
  useEffect(() => {
    if (open) snapshot.current = visit;
  }, [open, visit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stage === 'done') requestAnimationFrame(() => document.getElementById('doctor-approval-done-title')?.focus());
  }, [stage]);

  const shown = stage === 'done' ? snapshot.current ?? visit : visit;

  return (
    <Dialog open={open} onClose={onClose} title={A.title} maxWidth={680} locked={working} initialFocusId={stage === 'review' ? 'doctor-approval-confirm' : undefined}>
      {stage === 'review' ? (
        <>
          <p style={{ fontSize: 14, color: 'var(--color-body-gray)', marginBottom: 14 }}>{A.lead}</p>

          <div style={box}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={label}>{A.patientGets}</span>
              <StatusChip status="draft" />
              <VisibilityChip visible={false} />
            </div>
            <div>
              <div style={label}>{A.complaint}</div>
              <div style={value} dir="auto">{shown?.chief_complaint || A.none}</div>
            </div>
            <div>
              <div style={label}>{A.diagnosis}</div>
              <div style={{ ...value, fontWeight: 520, fontSize: 15 }} dir="auto">{shown?.diagnosis || A.none}</div>
            </div>
            <div>
              <div style={label}>{A.plan}</div>
              <div style={value} dir="auto">{shown?.treatment_plan || A.none}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '14px 0', fontSize: 13, color: 'var(--color-body-gray)' }}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>{Icon.info}<span>{A.whenVisible}</span></span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              {Icon.info}
              <span>{A.separate} ({fmt(A.linkedRx, { n: linkedRxCount })} · {fmt(A.linkedLabs, { n: linkedLabCount })})</span>
            </span>
          </div>

          {failed && (
            <div role="alert" style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', fontSize: 14 }}>
              {A.error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={onClose} disabled={working}>
              {A.cancel}
            </button>
            <button id="doctor-approval-confirm" type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} disabled={working} aria-busy={working} onClick={() => void approve()}>
              {working ? A.working : failed ? A.retry : A.confirm}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <StatusChip status="approved" />
            <VisibilityChip visible />
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
