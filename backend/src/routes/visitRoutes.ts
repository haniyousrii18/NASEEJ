import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { blockPlatformAdminFromClinical } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';

export const visitRouter = Router();

visitRouter.use(authenticate, requireTenant, blockPlatformAdminFromClinical);

// GET /api/visits (List visits in center)
visitRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const patientId = req.query.patientId as string;
  const user = req.user!;

  try {
    let text = `
      SELECT v.*,
             p.full_name_ar as patient_name_ar, p.full_name_en as patient_name_en,
             u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en
      FROM visits v
      JOIN patient_profiles p ON v.patient_id = p.id
      JOIN users u ON v.clinician_id = u.id
      WHERE v.organization_id = $1
    `;
    const params: any[] = [orgId];

    // If user is a patient, strictly show ONLY approved visits!
    if (user.patientProfileId) {
      params.push(user.patientProfileId);
      text += ` AND v.patient_id = $${params.length} AND v.status = 'approved'`;
    } else if (patientId) {
      params.push(patientId);
      text += ` AND v.patient_id = $${params.length}`;
    }

    text += ' ORDER BY v.visit_date DESC';

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/visits (Clinician creates visit draft)
visitRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const clinicianId = req.user!.id;
  const { patient_id, appointment_id, chief_complaint, vital_signs, examination_notes, diagnosis, treatment_plan } = req.body;

  // Authorization: Only doctors can create visits
  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only licensed clinicians can document clinical visits.' },
    });
    return;
  }

  if (!patient_id || !chief_complaint || !diagnosis) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'patient_id, chief_complaint, and diagnosis are required.' },
    });
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO visits (
         organization_id, patient_id, clinician_id, appointment_id, chief_complaint, vital_signs, examination_notes, diagnosis, treatment_plan, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
       RETURNING *`,
      [
        orgId,
        patient_id,
        clinicianId,
        appointment_id || null,
        chief_complaint,
        JSON.stringify(vital_signs || {}),
        examination_notes || null,
        diagnosis,
        treatment_plan || null,
      ]
    );

    const newVisit = insertRes.rows[0];

    // If an appointment was linked, transition its status to 'in_consultation'
    if (appointment_id) {
      await query(
        `UPDATE appointments SET status = 'in_consultation', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [appointment_id, orgId]
      );
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: clinicianId,
      actorEmail: req.user!.email,
      actorRole: 'doctor',
      action: 'VISIT_DRAFT_CREATE',
      resourceType: 'visit',
      resourceId: newVisit.id,
      ipAddress: req.ip,
      details: { patientId: patient_id, diagnosis },
    });

    res.status(201).json({ success: true, data: newVisit });
  } catch (err: any) {
    console.error('Visit create error:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/visits/:id (Get visit details with prescriptions and labs)
visitRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const visitId = req.params.id;
  const user = req.user!;

  try {
    const visitRes = await query(
      `SELECT v.*,
              p.full_name_ar as patient_name_ar, p.full_name_en as patient_name_en, p.national_id as patient_national_id,
              u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en
       FROM visits v
       JOIN patient_profiles p ON v.patient_id = p.id
       JOIN users u ON v.clinician_id = u.id
       WHERE v.id = $1 AND v.organization_id = $2`,
      [visitId, orgId]
    );

    if (visitRes.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found in this medical center.' },
      });
      return;
    }

    const visit = visitRes.rows[0];

    // Strict Draft Concealment: If user is a patient and visit is NOT approved, deny access!
    if (user.patientProfileId && visit.status !== 'approved') {
      res.status(404).json({
        success: false,
        error: {
          code: 'VISIT_NOT_AVAILABLE',
          message: 'Clinical visit is currently in draft status and awaiting clinician approval.',
        },
      });
      return;
    }

    // Fetch prescriptions for this visit
    const rxRes = await query(
      `SELECT pr.*, json_agg(pi.*) as items
       FROM prescriptions pr
       LEFT JOIN prescription_items pi ON pr.id = pi.prescription_id
       WHERE pr.visit_id = $1 AND pr.organization_id = $2
       GROUP BY pr.id`,
      [visitId, orgId]
    );

    // Fetch lab orders for this visit
    const labRes = await query(
      `SELECT lo.*, json_agg(lr.*) as results
       FROM lab_orders lo
       LEFT JOIN lab_results lr ON lo.id = lr.lab_order_id
       WHERE lo.visit_id = $1 AND lo.organization_id = $2
       GROUP BY lo.id`,
      [visitId, orgId]
    );

    res.json({
      success: true,
      data: {
        ...visit,
        prescriptions: rxRes.rows,
        labOrders: labRes.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/visits/:id (Update visit draft)
visitRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const visitId = req.params.id;
  const { chief_complaint, vital_signs, examination_notes, diagnosis, treatment_plan } = req.body;

  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only clinicians can update clinical notes.' },
    });
    return;
  }

  try {
    const existingRes = await query('SELECT status FROM visits WHERE id = $1 AND organization_id = $2', [visitId, orgId]);
    if (existingRes.rowCount === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
      return;
    }

    if (existingRes.rows[0].status === 'approved') {
      res.status(400).json({
        success: false,
        error: { code: 'VISIT_ALREADY_APPROVED', message: 'Approved visits cannot be directly overwritten.' },
      });
      return;
    }

    const updateRes = await query(
      `UPDATE visits
       SET chief_complaint = COALESCE($1, chief_complaint),
           vital_signs = COALESCE($2, vital_signs),
           examination_notes = COALESCE($3, examination_notes),
           diagnosis = COALESCE($4, diagnosis),
           treatment_plan = COALESCE($5, treatment_plan),
           updated_at = NOW()
       WHERE id = $6 AND organization_id = $7
       RETURNING *`,
      [
        chief_complaint,
        vital_signs ? JSON.stringify(vital_signs) : null,
        examination_notes,
        diagnosis,
        treatment_plan,
        visitId,
        orgId,
      ]
    );

    res.json({ success: true, data: updateRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/visits/:id/approve (Clinician Sign-off)
visitRouter.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const visitId = req.params.id;
  const clinicianId = req.user!.id;

  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only clinicians can sign off and approve clinical visits.' },
    });
    return;
  }

  try {
    const approveRes = await query(
      `UPDATE visits
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [clinicianId, visitId, orgId]
    );

    if (approveRes.rowCount === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
      return;
    }

    const approvedVisit = approveRes.rows[0];

    // If appointment is attached, mark completed
    if (approvedVisit.appointment_id) {
      await query(
        `UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [approvedVisit.appointment_id, orgId]
      );
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: clinicianId,
      actorEmail: req.user!.email,
      actorRole: 'doctor',
      action: 'VISIT_APPROVE',
      resourceType: 'visit',
      resourceId: approvedVisit.id,
      ipAddress: req.ip,
      details: { diagnosis: approvedVisit.diagnosis },
    });

    res.json({ success: true, data: approvedVisit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
