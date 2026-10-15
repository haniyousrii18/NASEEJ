import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { blockPlatformAdminFromClinical, requireClinicalReader } from '../middleware/rbac.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { isUuid } from '../services/validation.js';
import { logAuditEvent } from '../services/auditService.js';

export const prescriptionRouter = Router();

prescriptionRouter.use(authenticate, requireTenant, blockPlatformAdminFromClinical, requireClinicalReader);

// GET /api/prescriptions
prescriptionRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const patientId = req.query.patientId as string;
  const user = req.user!;

  try {
    let text = `
      SELECT pr.*,
             p.full_name_ar as patient_name_ar, p.full_name_en as patient_name_en,
             u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', pi.id,
                   'medication_name', pi.medication_name,
                   'dosage', pi.dosage,
                   'frequency', pi.frequency,
                   'duration', pi.duration,
                   'instructions', pi.instructions
                 )
               ) FILTER (WHERE pi.id IS NOT NULL), '[]'
             ) as items
      FROM prescriptions pr
      JOIN patient_profiles p ON pr.patient_id = p.id
      JOIN users u ON pr.clinician_id = u.id
      LEFT JOIN prescription_items pi ON pr.id = pi.prescription_id
      WHERE pr.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (user.patientProfileId) {
      params.push(user.patientProfileId);
      text += ` AND pr.patient_id = $${params.length} AND pr.status = 'approved'`;
    } else if (patientId) {
      params.push(patientId);
      text += ` AND pr.patient_id = $${params.length}`;
    }

    text += ' GROUP BY pr.id, p.full_name_ar, p.full_name_en, u.full_name_ar, u.full_name_en ORDER BY pr.created_at DESC';

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/prescriptions (Clinician creates prescription with items)
prescriptionRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const clinicianId = req.user!.id;
  const { visit_id, patient_id, notes, items } = req.body;

  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only clinicians can prescribe medications.' },
    });
    return;
  }

  if (!visit_id || !patient_id || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'visit_id, patient_id, and at least one prescription item are required.' },
    });
    return;
  }

  try {
    // The visit must exist at this center and belong to this patient; the patient must be registered here.
    if (!isUuid(visit_id) || !isUuid(patient_id) || !(await isPatientLinkedToOrg(patient_id, orgId))) {
      res.status(404).json({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient or visit not found in this medical center.' } });
      return;
    }
    const visitCheck = await query('SELECT 1 FROM visits WHERE id = $1 AND organization_id = $2 AND patient_id = $3', [visit_id, orgId, patient_id]);
    if (visitCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found for this patient in this medical center.' } });
      return;
    }

    // 1. Fetch patient allergies for safety check verification
    const allergiesRes = await query('SELECT allergen_en, severity FROM patient_allergies WHERE patient_id = $1', [patient_id]);

    // 2. Insert Prescription
    const rxRes = await query(
      `INSERT INTO prescriptions (organization_id, visit_id, patient_id, clinician_id, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING *`,
      [orgId, visit_id, patient_id, clinicianId, notes || null]
    );

    const newRx = rxRes.rows[0];

    // 3. Insert Items
    for (const item of items) {
      await query(
        `INSERT INTO prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newRx.id, item.medication_name, item.dosage, item.frequency, item.duration, item.instructions || null]
      );
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: clinicianId,
      actorEmail: req.user!.email,
      actorRole: 'doctor',
      action: 'PRESCRIPTION_DRAFT_CREATE',
      resourceType: 'prescription',
      resourceId: newRx.id,
      ipAddress: req.ip,
      details: { itemsCount: items.length, patientId: patient_id },
    });

    res.status(201).json({
      success: true,
      data: {
        ...newRx,
        allergiesChecked: allergiesRes.rows,
      },
    });
  } catch (err: any) {
    console.error('Prescription create error:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/prescriptions/:id/approve (Clinician approves prescription)
prescriptionRouter.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const rxId = req.params.id;
  const clinicianId = req.user!.id;

  if (req.currentMembership?.role !== 'doctor') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only clinicians can approve prescriptions.' },
    });
    return;
  }

  try {
    const approveRes = await query(
      `UPDATE prescriptions
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [clinicianId, rxId, orgId]
    );

    if (approveRes.rowCount === 0) {
      res.status(404).json({ success: false, error: { code: 'PRESCRIPTION_NOT_FOUND', message: 'Prescription not found.' } });
      return;
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: clinicianId,
      actorEmail: req.user!.email,
      actorRole: 'doctor',
      action: 'PRESCRIPTION_APPROVE',
      resourceType: 'prescription',
      resourceId: rxId,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: approveRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
