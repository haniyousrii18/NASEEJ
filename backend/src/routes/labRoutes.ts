import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { blockPlatformAdminFromClinical, requireClinicalReader } from '../middleware/rbac.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { isUuid } from '../services/validation.js';
import { logAuditEvent } from '../services/auditService.js';
import { onRecordApproved } from '../services/notificationService.js';

export const labRouter = Router();

labRouter.use(authenticate, requireTenant, blockPlatformAdminFromClinical, requireClinicalReader);

// GET /api/labs/orders
labRouter.get('/orders', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const patientId = req.query.patientId as string;
  const user = req.user!;

  try {
    let text = `
      SELECT lo.*,
             p.full_name_ar as patient_name_ar, p.full_name_en as patient_name_en,
             u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', lr.id,
                   'parameter_name', lr.parameter_name,
                   'value', lr.value,
                   'unit', lr.unit,
                   'reference_range', lr.reference_range,
                   'is_abnormal', lr.is_abnormal,
                   'status', lr.status,
                   'reviewed_at', lr.reviewed_at
                 )
               ) FILTER (WHERE lr.id IS NOT NULL), '[]'
             ) as results
      FROM lab_orders lo
      JOIN patient_profiles p ON lo.patient_id = p.id
      JOIN users u ON lo.clinician_id = u.id
      LEFT JOIN lab_results lr ON lo.id = lr.lab_order_id
      WHERE lo.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (user.patientProfileId) {
      params.push(user.patientProfileId);
      text += ` AND lo.patient_id = $${params.length}`;
      // Patient only sees approved results
      text += ` AND (lr.status = 'approved' OR lr.id IS NULL)`;
    } else if (patientId) {
      params.push(patientId);
      text += ` AND lo.patient_id = $${params.length}`;
    }

    text += ' GROUP BY lo.id, p.full_name_ar, p.full_name_en, u.full_name_ar, u.full_name_en ORDER BY lo.created_at DESC';

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/labs/orders
labRouter.post('/orders', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const clinicianId = req.user!.id;
  const { visit_id, patient_id, test_name_ar, test_name_en, test_category, clinical_notes } = req.body;

  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only clinicians can order laboratory tests.' },
    });
    return;
  }

  if (!patient_id || !test_name_ar || !test_name_en) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'patient_id, test_name_ar, and test_name_en are required.' },
    });
    return;
  }

  try {
    if (!isUuid(patient_id) || !(await isPatientLinkedToOrg(patient_id, orgId))) {
      res.status(404).json({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found in this medical center.' } });
      return;
    }
    if (visit_id) {
      const visitCheck = await query('SELECT 1 FROM visits WHERE id = $1 AND organization_id = $2 AND patient_id = $3', [isUuid(visit_id) ? visit_id : '00000000-0000-0000-0000-000000000000', orgId, patient_id]);
      if (visitCheck.rowCount === 0) {
        res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found for this patient in this medical center.' } });
        return;
      }
    }

    const insertRes = await query(
      `INSERT INTO lab_orders (organization_id, visit_id, patient_id, clinician_id, test_name_ar, test_name_en, test_category, clinical_notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [orgId, visit_id || null, patient_id, clinicianId, test_name_ar, test_name_en, test_category || 'General', clinical_notes || null]
    );

    logAuditEvent({
      organizationId: orgId,
      actorId: clinicianId,
      actorEmail: req.user!.email,
      actorRole: 'doctor',
      action: 'LAB_ORDER_CREATE',
      resourceType: 'lab_order',
      resourceId: insertRes.rows[0].id,
      ipAddress: req.ip,
      details: { testName: test_name_en },
    });

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/labs/orders/:id/results (Enter lab result values)
labRouter.post('/orders/:id/results', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const orderId = String(req.params.id);
  const { parameter_name, value, unit, reference_range, is_abnormal } = req.body || {};

  // Entering results is clinical work. Previously any member of the center (or a linked patient) could post here.
  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only clinicians can enter laboratory results.' },
    });
    return;
  }

  if (!parameter_name || !value || !unit) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'parameter_name, value, and unit are required.' },
    });
    return;
  }

  try {
    const orderCheck = await query('SELECT 1 FROM lab_orders WHERE id = $1 AND organization_id = $2', [isUuid(orderId) ? orderId : '00000000-0000-0000-0000-000000000000', orgId]);
    if (orderCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: { code: 'LAB_ORDER_NOT_FOUND', message: 'Laboratory order not found in this medical center.' } });
      return;
    }

    const resultRes = await query(
      `INSERT INTO lab_results (organization_id, lab_order_id, parameter_name, value, unit, reference_range, is_abnormal, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
       RETURNING *`,
      [orgId, orderId, parameter_name, value, unit, reference_range || null, !!is_abnormal]
    );

    await query(
      `UPDATE lab_orders SET status = 'completed', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [orderId, orgId]
    );

    res.status(201).json({ success: true, data: resultRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/labs/results/:id/approve (Clinician reviews and approves result)
labRouter.post('/results/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const resultId = String(req.params.id);
  const clinicianId = req.user!.id;

  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only clinicians can approve laboratory results.' },
    });
    return;
  }

  try {
    const approveRes = await query(
      `UPDATE lab_results
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [clinicianId, resultId, orgId]
    );

    if (approveRes.rowCount === 0) {
      res.status(404).json({ success: false, error: { code: 'LAB_RESULT_NOT_FOUND', message: 'Lab result not found.' } });
      return;
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: clinicianId,
      actorEmail: req.user!.email,
      actorRole: 'doctor',
      action: 'LAB_RESULT_APPROVE',
      resourceType: 'lab_result',
      resourceId: resultId,
      ipAddress: req.ip,
      details: { parameter: approveRes.rows[0].parameter_name },
    });
    const owner = await query('SELECT patient_id FROM lab_orders WHERE id = $1', [approveRes.rows[0].lab_order_id]);
    if (owner.rows[0]) await onRecordApproved('lab_result', resultId, owner.rows[0].patient_id, orgId, clinicianId);

    res.json({ success: true, data: approveRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
