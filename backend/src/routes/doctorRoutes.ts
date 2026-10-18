import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { apiError, isUuid, serverError, trimmed } from '../services/validation.js';

export const doctorRouter = Router();

doctorRouter.use(authenticate, requireTenant, requireRole(['doctor']));

// GET /api/doctor/overview: the doctor's own day. Today's appointments, and drafts waiting for their sign-off.
// "Pending" means only what the product tracks: draft visits, prescriptions and lab results created by this
// clinician. Nothing is inferred about patients who "need follow-up"; the product has no such concept.
const draftsSql = `SELECT * FROM (
           SELECT 'visit' AS type, v.id, v.patient_id, v.created_at, p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
             FROM visits v JOIN patient_profiles p ON p.id = v.patient_id
             WHERE v.organization_id = $1 AND v.clinician_id = $2 AND v.status = 'draft'
           UNION ALL
           SELECT 'prescription', pr.id, pr.patient_id, pr.created_at, p.full_name_ar, p.full_name_en
             FROM prescriptions pr JOIN patient_profiles p ON p.id = pr.patient_id
             WHERE pr.organization_id = $1 AND pr.clinician_id = $2 AND pr.status = 'draft'
           UNION ALL
           SELECT 'lab_result', lr.id, lo.patient_id, lr.created_at, p.full_name_ar, p.full_name_en
             FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.lab_order_id JOIN patient_profiles p ON p.id = lo.patient_id
             WHERE lr.organization_id = $1 AND lo.clinician_id = $2 AND lr.status = 'draft'
         ) d ORDER BY created_at ASC`;

// GET /api/doctor/pending: every draft this clinician still has to approve (visits, prescriptions, lab results).
doctorRouter.get('/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const drafts = await query(draftsSql, [req.tenantId!, req.user!.id]);
    res.json({ success: true, data: drafts.rows });
  } catch (err: any) {
    console.error('Doctor pending error:', err);
    res.status(500).json(serverError(err));
  }
});

// GET /api/doctor/patient-messages?status=: questions patients (or their authorized caregivers) sent to this center.
doctorRouter.get('/patient-messages', async (req: Request, res: Response): Promise<void> => {
  const params: unknown[] = [req.tenantId];
  let where = 'm.organization_id = $1';
  const status = req.query.status;
  if (typeof status === 'string' && status) {
    if (!['submitted', 'under_review', 'resolved'].includes(status)) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'status must be submitted, under_review or resolved.'));
      return;
    }
    params.push(status);
    where += ` AND m.status = $${params.length}`;
  }
  try {
    const rows = await query(
      `SELECT m.id, m.patient_id, m.subject, m.body, m.category, m.status, m.response, m.responded_at, m.created_at,
              p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en,
              cu.full_name_ar AS caregiver_name_ar, cu.full_name_en AS caregiver_name_en
       FROM patient_messages m JOIN patient_profiles p ON p.id = m.patient_id
       LEFT JOIN users cu ON cu.id = m.sent_by_caregiver_id
       WHERE ${where} ORDER BY (m.status = 'resolved'), m.created_at DESC LIMIT 200`,
      params
    );
    logAuditEvent({
      organizationId: req.tenantId, actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'doctor',
      action: 'PATIENT_MESSAGES_READ', resourceType: 'patient_message', ipAddress: req.ip, details: { count: rows.rowCount ?? 0 },
    });
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/doctor/patient-messages/:id/respond  { response?, status: 'under_review' | 'resolved' }
doctorRouter.post('/patient-messages/:id/respond', async (req: Request, res: Response): Promise<void> => {
  const status = req.body?.status;
  const response = req.body?.response === undefined || req.body?.response === '' ? null : trimmed(req.body.response, 4000);
  if (!isUuid(req.params.id) || !['under_review', 'resolved'].includes(status) || (req.body?.response && !response)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Provide a status (under_review or resolved) and, optionally, a response of up to 4000 characters.'));
    return;
  }
  if (status === 'resolved' && !response) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Add a response before marking the message resolved.'));
    return;
  }
  try {
    const update = await query(
      `UPDATE patient_messages
       SET status = $3, response = COALESCE($4, response), responded_by = CASE WHEN $4::text IS NULL THEN responded_by ELSE $5::uuid END,
           responded_at = CASE WHEN $4::text IS NULL THEN responded_at ELSE NOW() END, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING id, patient_id`,
      [req.params.id, req.tenantId, status, response, req.user!.id]
    );
    if (update.rowCount === 0) {
      res.status(404).json(apiError('MESSAGE_NOT_FOUND', 'Message not found in this medical center.'));
      return;
    }
    logAuditEvent({
      organizationId: req.tenantId, actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'doctor',
      action: 'PATIENT_MESSAGE_RESPOND', resourceType: 'patient_message', resourceId: req.params.id, ipAddress: req.ip,
      details: { patientId: update.rows[0].patient_id, status },
    });
    res.json({ success: true, data: { id: req.params.id, status } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

doctorRouter.get('/overview', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const me = req.user!.id;
  try {
    const [appointments, drafts, review] = await Promise.all([
      query(
        `SELECT a.id, a.patient_id, a.status, to_char(a.start_time, 'HH24:MI') AS start_time, to_char(a.end_time, 'HH24:MI') AS end_time, a.reason,
                p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
         FROM appointments a JOIN patient_profiles p ON p.id = a.patient_id
         WHERE a.organization_id = $1 AND a.clinician_id = $2 AND a.appointment_date = CURRENT_DATE AND a.status <> 'cancelled'
         ORDER BY a.start_time`,
        [orgId, me]
      ),
      query(
        `SELECT * FROM (
           SELECT 'visit' AS type, v.id, v.patient_id, v.created_at, p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
             FROM visits v JOIN patient_profiles p ON p.id = v.patient_id
             WHERE v.organization_id = $1 AND v.clinician_id = $2 AND v.status = 'draft'
           UNION ALL
           SELECT 'prescription', pr.id, pr.patient_id, pr.created_at, p.full_name_ar, p.full_name_en
             FROM prescriptions pr JOIN patient_profiles p ON p.id = pr.patient_id
             WHERE pr.organization_id = $1 AND pr.clinician_id = $2 AND pr.status = 'draft'
           UNION ALL
           SELECT 'lab_result', lr.id, lo.patient_id, lr.created_at, p.full_name_ar, p.full_name_en
             FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.lab_order_id JOIN patient_profiles p ON p.id = lo.patient_id
             WHERE lr.organization_id = $1 AND lo.clinician_id = $2 AND lr.status = 'draft'
         ) d ORDER BY created_at ASC`,
        [orgId, me]
      ),
      // Waiting on this center's clinicians: patient files nobody has reviewed yet, AI suggestions to confirm, patient questions.
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM documents d WHERE d.organization_id = $1 AND d.review_status = 'unreviewed') AS documents_unreviewed,
           (SELECT COUNT(*)::int FROM document_facts f WHERE f.organization_id = $1 AND f.review_status = 'unreviewed') AS suggestions_unreviewed,
           (SELECT COUNT(*)::int FROM patient_messages m WHERE m.organization_id = $1 AND m.status = 'submitted') AS patient_questions_new,
           (SELECT COUNT(*)::int FROM ops_messages o WHERE o.organization_id = $1 AND o.to_role = 'doctor' AND o.status = 'new'
              AND (o.to_user_id IS NULL OR o.to_user_id = $2)) AS ops_messages_new`,
        [orgId, me]
      ),
    ]);

    const counts = { visit: 0, prescription: 0, lab_result: 0 } as Record<string, number>;
    for (const d of drafts.rows) counts[d.type] += 1;

    res.json({
      success: true,
      data: {
        today: appointments.rows,
        waitingCount: appointments.rows.filter((a) => a.status === 'checked_in').length,
        pendingSignOff: { counts, total: drafts.rows.length, items: drafts.rows.slice(0, 8) },
        awaitingReview: {
          documents: review.rows[0].documents_unreviewed,
          suggestions: review.rows[0].suggestions_unreviewed,
          patientQuestions: review.rows[0].patient_questions_new,
          operationalMessages: review.rows[0].ops_messages_new,
        },
      },
    });
  } catch (err: any) {
    console.error('Doctor overview error:', err);
    res.status(500).json(serverError(err));
  }
});
