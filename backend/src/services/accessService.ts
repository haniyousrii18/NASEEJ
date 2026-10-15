import { query } from '../config/db.js';

/** Record types a consent can cover. 'all' covers every type. */
export type ConsentKind = 'visits' | 'labs' | 'prescriptions' | 'documents';
export const CONSENT_SCOPES = ['all', 'visits', 'labs', 'prescriptions', 'documents'] as const;

export interface EffectiveConsent {
  id: string;
  patient_id: string;
  from_organization_id: string;
  to_organization_id: string;
  scope: string;
  granted_at: string;
  expires_at: string;
}

export function scopeCovers(scope: string, kind: ConsentKind): boolean {
  return scope === 'all' || scope === kind;
}

/** A patient must hold an active link to a center before that center's staff can act on them. */
export async function isPatientLinkedToOrg(patientId: string, orgId: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM patient_center_links WHERE patient_id = $1 AND organization_id = $2 AND status = 'active'`,
    [patientId, orgId]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Consents under which `readerOrgId` may read records that other centers created for this patient.
 * Effective means: status active, not revoked, not past its expiry, and the source center still active.
 * Revocation and expiry therefore take effect on the very next request.
 */
export async function effectiveConsentsForReader(patientId: string, readerOrgId: string): Promise<EffectiveConsent[]> {
  const res = await query<EffectiveConsent>(
    `SELECT c.id, c.patient_id, c.from_organization_id, c.to_organization_id, c.scope, c.granted_at, c.expires_at
     FROM patient_consents c
     JOIN organizations src ON src.id = c.from_organization_id AND src.status = 'active'
     WHERE c.patient_id = $1
       AND c.to_organization_id = $2
       AND c.status = 'active'
       AND c.revoked_at IS NULL
       AND c.expires_at > NOW()`,
    [patientId, readerOrgId]
  );
  return res.rows;
}

/** True when an effective consent from `fromOrgId` to `toOrgId` exists for the patient (any scope). */
export async function hasEffectiveConsent(patientId: string, fromOrgId: string, toOrgId: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM patient_consents
     WHERE patient_id = $1 AND from_organization_id = $2 AND to_organization_id = $3
       AND status = 'active' AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [patientId, fromOrgId, toOrgId]
  );
  return (res.rowCount ?? 0) > 0;
}

const AUDIT_DETAIL_ALLOWLIST = new Set([
  'role',
  'membershipsCount',
  'reason',
  'path',
  'method',
  'code',
  'name_en',
  'targetUserId',
  'targetEmail',
  'clinicianId',
  'patientId',
  'date',
  'time',
  'checkInTime',
  'status',
  'from',
  'to',
  'scope',
  'consentId',
  'consentIds',
  'fromOrganizationIds',
  'types',
  'count',
  'itemsCount',
  'mrn',
  'documentId',
  'caseId',
  'taskId',
  'referralId',
  'isActive',
]);

/**
 * Audit rows were written with whatever context was handy, some of it clinical (a diagnosis, an allergen).
 * Operational viewers (center managers, platform administrators) get only allow-listed, non-clinical keys.
 * The stored row is never modified.
 */
export function redactAuditDetails(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (AUDIT_DETAIL_ALLOWLIST.has(key)) out[key] = value;
  }
  return out;
}
