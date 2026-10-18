import { Request, Response } from 'express';
import { query } from '../config/db.js';
import { logAuditEvent } from './auditService.js';
import { apiError, isUuid } from './validation.js';

/**
 * Caregiver delegation rules (enforced here and in the routes, never in the UI):
 *  - Access exists only while a delegation is 'active' AND not past its expiry, and only for the capabilities the
 *    patient ticked. Viewing records, managing appointments and sending messages are separate flags.
 *  - The delegation must belong to the signed-in account (caregiver_user_id), never to an email alone once data is involved.
 *  - A delegation that does not exist, belongs to someone else, is revoked/expired, or lacks the capability is
 *    reported as 404, so a caregiver cannot probe for other people's patients.
 */
export type CaregiverCapability = 'view' | 'appointments' | 'messages';

export interface ActiveDelegation {
  id: string;
  patient_id: string;
  caregiver_user_id: string;
  relationship: string | null;
  can_view_records: boolean;
  can_manage_appointments: boolean;
  can_send_messages: boolean;
  expires_at: string;
}

const CAPABILITY_COLUMN: Record<CaregiverCapability, 'can_view_records' | 'can_manage_appointments' | 'can_send_messages'> = {
  view: 'can_view_records',
  appointments: 'can_manage_appointments',
  messages: 'can_send_messages',
};

/** The delegation behind `/patients/:id/...`, when it is the caller's own, active, unexpired and grants `needs` (any of them). */
export async function activeDelegationFor(userId: string, delegationId: string, needs: CaregiverCapability[]): Promise<ActiveDelegation | null> {
  if (!isUuid(delegationId)) return null;
  const res = await query<ActiveDelegation>(
    `SELECT id, patient_id, caregiver_user_id, relationship, can_view_records, can_manage_appointments, can_send_messages, expires_at
     FROM caregiver_delegations
     WHERE id = $1 AND caregiver_user_id = $2 AND status = 'active' AND expires_at > NOW()`,
    [delegationId, userId]
  );
  const delegation = res.rows[0];
  if (!delegation) return null;
  if (needs.length > 0 && !needs.some((n) => delegation[CAPABILITY_COLUMN[n]])) return null;
  return delegation;
}

/** Express guard: resolves the delegation or answers 404, and records refused attempts that look like probing. */
export async function requireDelegation(req: Request, res: Response, needs: CaregiverCapability[]): Promise<ActiveDelegation | null> {
  const delegation = await activeDelegationFor(req.user!.id, req.params.id, needs);
  if (!delegation) {
    logAuditEvent({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'caregiver',
      action: 'SECURITY_CAREGIVER_ACCESS_REFUSED',
      resourceType: 'caregiver_delegation',
      resourceId: isUuid(req.params.id) ? req.params.id : null,
      ipAddress: req.ip,
      details: { path: req.originalUrl, method: req.method, reason: 'No active delegation grants this capability.' },
    });
    res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'This access is not available. It may have expired, been revoked, or not include this action.'));
    return null;
  }
  return delegation;
}

/** Audit row for something a caregiver did or read. Tied to the delegation so the patient can review it. */
export function auditCaregiver(req: Request, delegation: { id: string; patient_id: string }, action: string, area: string, extra: Record<string, unknown> = {}) {
  logAuditEvent({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: 'caregiver',
    action,
    resourceType: 'caregiver_delegation',
    resourceId: delegation.id,
    ipAddress: req.ip,
    details: { delegationId: delegation.id, patientId: delegation.patient_id, area, ...extra },
  });
}
