import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { CONSENT_SCOPES, isPatientLinkedToOrg } from '../services/accessService.js';
import { apiError, clampInt, isUuid, serverError } from '../services/validation.js';

export const consentRouter = Router();

// A patient manages sharing of their own record only. Staff, managers and administrators have no route here.
consentRouter.use(authenticate, requirePatient);

// GET /api/portal/consents
consentRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query(
      `SELECT c.id, c.scope, c.status, c.granted_at, c.expires_at, c.revoked_at,
              c.from_organization_id, fo.name_ar AS from_name_ar, fo.name_en AS from_name_en,
              c.to_organization_id, tor.name_ar AS to_name_ar, tor.name_en AS to_name_en,
              (c.status = 'active' AND c.revoked_at IS NULL AND c.expires_at > NOW()) AS is_effective
       FROM patient_consents c
       JOIN organizations fo ON fo.id = c.from_organization_id
       JOIN organizations tor ON tor.id = c.to_organization_id
       WHERE c.patient_id = $1
       ORDER BY c.granted_at DESC`,
      [req.user!.patientProfileId]
    );
    // `state` is derived: a consent past its expiry reads as expired even though its stored status is still active.
    const data = rows.rows.map((r) => ({
      ...r,
      state: r.status === 'revoked' ? 'revoked' : r.is_effective ? 'active' : 'expired',
    }));
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/portal/consents  { from_organization_id, to_organization_id, scope, expires_in_days }
// "from" is the center whose records are shared; "to" is the center allowed to read them. The patient must be
// registered at both: a center that does not know the patient cannot receive their record.
consentRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  const { from_organization_id, to_organization_id, scope, expires_in_days } = req.body || {};
  const days = clampInt(expires_in_days, 90, 1, 365);

  if (!isUuid(from_organization_id) || !isUuid(to_organization_id) || from_organization_id === to_organization_id) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Choose two different medical centers.'));
    return;
  }
  if (!CONSENT_SCOPES.includes(scope)) {
    res.status(400).json(apiError('VALIDATION_ERROR', `scope must be one of: ${CONSENT_SCOPES.join(', ')}.`));
    return;
  }

  try {
    const linked =
      (await isPatientLinkedToOrg(patientId, from_organization_id)) && (await isPatientLinkedToOrg(patientId, to_organization_id));
    if (!linked) {
      res.status(400).json(apiError('INVALID_CENTER', 'You can only share between medical centers where you are registered.'));
      return;
    }

    // A consent past its expiry still has the stored status 'active'. Record the expiry first so it neither
    // keeps granting access in any report nor blocks the patient from granting the same consent again.
    await query(
      `UPDATE patient_consents SET status = 'expired'
       WHERE patient_id = $1 AND from_organization_id = $2 AND to_organization_id = $3 AND scope = $4
         AND status = 'active' AND expires_at <= NOW()`,
      [patientId, from_organization_id, to_organization_id, scope]
    );

    const insert = await query(
      `INSERT INTO patient_consents (patient_id, from_organization_id, to_organization_id, scope, status, expires_at, granted_by)
       VALUES ($1, $2, $3, $4, 'active', NOW() + ($5 || ' days')::interval, $6)
       RETURNING id, scope, status, granted_at, expires_at`,
      [patientId, from_organization_id, to_organization_id, scope, String(days), req.user!.id]
    );

    logAuditEvent({
      organizationId: from_organization_id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'patient',
      action: 'CONSENT_GRANT',
      resourceType: 'patient_consent',
      resourceId: insert.rows[0].id,
      ipAddress: req.ip,
      details: { consentId: insert.rows[0].id, scope, to: to_organization_id, from: from_organization_id, patientId },
    });

    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('CONSENT_EXISTS', 'An active consent with the same centers and scope already exists.'));
      return;
    }
    res.status(500).json(serverError(err));
  }
});

// POST /api/portal/consents/:id/revoke (takes effect on the reader's very next request)
consentRouter.post('/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  if (!isUuid(req.params.id)) {
    res.status(404).json(apiError('CONSENT_NOT_FOUND', 'Consent not found.'));
    return;
  }

  try {
    const current = await query('SELECT id, status, expires_at, from_organization_id, to_organization_id, scope FROM patient_consents WHERE id = $1 AND patient_id = $2', [
      req.params.id,
      patientId,
    ]);
    if (current.rowCount === 0) {
      res.status(404).json(apiError('CONSENT_NOT_FOUND', 'Consent not found.'));
      return;
    }
    if (current.rows[0].status !== 'active' || new Date(current.rows[0].expires_at).getTime() <= Date.now()) {
      res.status(409).json(apiError('CONSENT_NOT_ACTIVE', 'This consent is already revoked or expired.'));
      return;
    }

    const update = await query(
      `UPDATE patient_consents SET status = 'revoked', revoked_at = NOW(), revoked_by = $1
       WHERE id = $2 AND patient_id = $3 AND status = 'active'
       RETURNING id, status, revoked_at`,
      [req.user!.id, req.params.id, patientId]
    );
    if (update.rowCount === 0) {
      res.status(409).json(apiError('CONSENT_NOT_ACTIVE', 'This consent is already revoked or expired.'));
      return;
    }

    logAuditEvent({
      organizationId: current.rows[0].from_organization_id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'patient',
      action: 'CONSENT_REVOKE',
      resourceType: 'patient_consent',
      resourceId: req.params.id,
      ipAddress: req.ip,
      details: { consentId: req.params.id, scope: current.rows[0].scope, to: current.rows[0].to_organization_id, from: current.rows[0].from_organization_id, patientId },
    });

    res.json({ success: true, data: update.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});
