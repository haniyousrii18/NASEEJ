import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { blockPlatformAdminFromClinical } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';

export const patientRouter = Router();

// Apply auth, tenant, and platform admin clinical block
patientRouter.use(authenticate, requireTenant, blockPlatformAdminFromClinical);

// GET /api/patients (Scoped to active medical center)
patientRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const search = (req.query.search as string) || '';

  try {
    let text = `
      SELECT p.*, l.mrn, l.first_visit_date, l.status as link_status
      FROM patient_profiles p
      JOIN patient_center_links l ON p.id = l.patient_id
      WHERE l.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      text += ` AND (LOWER(p.full_name_ar) LIKE $2 OR LOWER(p.full_name_en) LIKE $2 OR p.national_id LIKE $2 OR LOWER(l.mrn) LIKE $2)`;
    }

    text += ' ORDER BY p.created_at DESC';

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/patients (Register patient & create center link with MRN)
patientRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, email, emergency_contact_name, emergency_contact_phone } = req.body;

  if (!national_id || !full_name_ar || !full_name_en || !date_of_birth || !gender || !phone) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required fields for patient registration.' },
    });
    return;
  }

  try {
    // 1. Check if patient profile already exists by National ID
    let patientRes = await query('SELECT * FROM patient_profiles WHERE national_id = $1', [national_id.trim()]);
    let patientId: string;
    let isNewProfile = false;

    if (patientRes.rowCount === 0) {
      const insertRes = await query(
        `INSERT INTO patient_profiles (national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, email, emergency_contact_name, emergency_contact_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [national_id.trim(), full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, email, emergency_contact_name, emergency_contact_phone]
      );
      patientId = insertRes.rows[0].id;
      isNewProfile = true;
    } else {
      patientId = patientRes.rows[0].id;
    }

    // 2. Check if link already exists with this center
    const linkRes = await query(
      'SELECT * FROM patient_center_links WHERE organization_id = $1 AND patient_id = $2',
      [orgId, patientId]
    );

    let mrn: string;
    if (linkRes.rowCount && linkRes.rowCount > 0) {
      mrn = linkRes.rows[0].mrn;
    } else {
      // Generate clean MRN for this center
      const countRes = await query('SELECT count(*) FROM patient_center_links WHERE organization_id = $1', [orgId]);
      const nextNum = parseInt(countRes.rows[0].count, 10) + 1001;
      mrn = `MRN-${nextNum}`;

      await query(
        `INSERT INTO patient_center_links (organization_id, patient_id, mrn, status, first_visit_date)
         VALUES ($1, $2, $3, 'active', CURRENT_DATE)`,
        [orgId, patientId, mrn]
      );
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: isNewProfile ? 'PATIENT_PROFILE_CREATE' : 'PATIENT_CENTER_LINK_CREATE',
      resourceType: 'patient_profile',
      resourceId: patientId,
      ipAddress: req.ip,
      details: { mrn, nationalId: national_id },
    });

    res.status(201).json({
      success: true,
      data: {
        patientId,
        mrn,
        isNewProfile,
      },
    });
  } catch (err: any) {
    console.error('Patient create error:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/patients/:id
patientRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const patientId = req.params.id;

  try {
    // Strict isolation: must have an active link in THIS center
    const patientRes = await query(
      `SELECT p.*, l.mrn, l.first_visit_date, l.status as link_status
       FROM patient_profiles p
       JOIN patient_center_links l ON p.id = l.patient_id
       WHERE p.id = $1 AND l.organization_id = $2`,
      [patientId, orgId]
    );

    if (patientRes.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found in this medical center.' },
      });
      return;
    }

    // Fetch allergies
    const allergiesRes = await query(
      'SELECT * FROM patient_allergies WHERE patient_id = $1 ORDER BY created_at DESC',
      [patientId]
    );

    res.json({
      success: true,
      data: {
        ...patientRes.rows[0],
        allergies: allergiesRes.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/patients/:id/allergies
patientRouter.get('/:id/allergies', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const allergiesRes = await query(
      'SELECT * FROM patient_allergies WHERE patient_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json({ success: true, data: allergiesRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/patients/:id/allergies
patientRouter.post('/:id/allergies', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.params.id;
  const { allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at } = req.body;

  if (!allergen_ar || !allergen_en || !severity) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'allergen_ar, allergen_en, and severity are required.' },
    });
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO patient_allergies (patient_id, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [patientId, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at || new Date()]
    );

    logAuditEvent({
      organizationId: req.tenantId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: 'PATIENT_ALLERGY_DOCUMENT',
      resourceType: 'patient_allergy',
      resourceId: insertRes.rows[0].id,
      ipAddress: req.ip,
      details: { allergen: allergen_en, severity },
    });

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
