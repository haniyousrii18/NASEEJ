import React, { useEffect } from 'react';
import { useLang } from '../../context/LangContext.js';
import { AnimatedCheck } from '../motion.js';
import { Icon, StatusChip, VisibilityChip } from './bits.js';
import { Dialog } from './Dialog.js';
import { useApprovalFlow } from './useApprovalFlow.js';

export interface ApprovalTarget {
  kind: 'rx' | 'lab';
  id: string;
  /** Plain lines describing exactly what is being approved. */
  lines: string[];
}

interface Props {
  target: ApprovalTarget | null;
  /** Calls the existing approve endpoint. Must throw on failure. */
  onApprove: (target: ApprovalTarget) => Promise<void>;
  onClose: () => void;
}

/** Same explicit approval step as for visits, for a prescription or a lab result. */
export const ItemApprovalDialog: React.FC<Props> = ({ target, onApprove, onClose }) => {
  const { t } = useLang();
  const I = t.doctor.itemApproval;
  const A = t.doctor.approval;
  const open = !!target;
  const kind = target?.kind ?? 'rx';
  const { stage, working, failed, approve } = useApprovalFlow(open, target?.id, async () => {
    if (target) await onApprove(target);
  });

  useEffect(() => {
    if (stage === 'done') requestAnimationFrame(() => document.getElementById('doctor-item-done-title')?.focus());
  }, [stage]);

  return (
    <Dialog open={open} onClose={onClose} title={kind === 'rx' ? I.rxTitle : I.labTitle} maxWidth={560} locked={working} initialFocusId={stage === 'review' ? 'doctor-item-confirm' : undefined}>
      {stage === 'review' ? (
        <>
          <p style={{ fontSize: 14, color: 'var(--color-body-gray)', marginBottom: 14 }}>{kind === 'rx' ? I.rxLead : I.labLead}</p>
          <div style={{ padding: 16, borderRadius: 16, background: 'var(--color-cloud-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatusChip status="draft" />
              <VisibilityChip visible={false} />
            </div>
            {(target?.lines ?? []).map((l, i) => (
              <div key={i} style={{ fontSize: 14, overflowWrap: 'anywhere' }} dir="auto">{l}</div>
            ))}
          </div>
          <p style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '14px 0', fontSize: 13, color: 'var(--color-body-gray)' }}>
            {Icon.info}
            <span>{kind === 'rx' ? I.rxWhen : I.labWhen}</span>
          </p>
          {failed && (
            <div role="alert" style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', fontSize: 14 }}>
              {I.error}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn-pill btn-pill-ghost" style={{ minHeight: 44 }} onClick={onClose} disabled={working}>
              {A.cancel}
            </button>
            <button id="doctor-item-confirm" type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} disabled={working} aria-busy={working} onClick={() => void approve()}>
              {working ? A.working : failed ? A.retry : kind === 'rx' ? t.clinical.approveRxBtn : t.clinical.approveLabBtn}
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <AnimatedCheck />
          <h3 id="doctor-item-done-title" tabIndex={-1} className="text-card-heading" style={{ fontSize: 22, margin: 0, outline: 'none' }}>
            {kind === 'rx' ? I.rxDoneTitle : I.labDoneTitle}
          </h3>
          <p role="status" aria-live="polite" style={{ fontSize: 14, color: 'var(--color-body-gray)' }}>
            {kind === 'rx' ? I.rxDoneBody : I.labDoneBody}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <StatusChip status="approved" />
            <VisibilityChip visible />
          </div>
          <button type="button" className="btn-pill btn-pill-charcoal" style={{ minHeight: 44 }} onClick={onClose}>
            {A.doneNext}
          </button>
        </div>
      )}
    </Dialog>
  );
};
