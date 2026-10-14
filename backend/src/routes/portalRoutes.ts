import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';

export const portalRouter = Router();

portalRouter.use(authenticate, requirePatient);

// GET /api/portal/summary (Longitudinal summary of APPROVED health information)
portalRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;

  try {
    // 1. Patient profile & allergies
    const patientRes = await query('SELECT * FROM patient_profiles WHERE id = $1', [patientId]);
    const allergiesRes = await query('SELECT * FROM patient_allergies WHERE patient_id = $1', [patientId]);

    // 2. Affiliated centers
    const centersRes = await query(
      `SELECT o.id, o.name_ar, o.name_en, o.code, l.mrn, l.first_visit_date
       FROM patient_center_links l
       JOIN organizations o ON l.organization_id = o.id
       WHERE l.patient_id = $1 AND l.status = 'active'`,
      [patientId]
    );

    // 3. Approved Visits Only
    const visitsRes = await query(
      `SELECT v.id, v.organization_id, v.visit_date, v.chief_complaint, v.vital_signs, v.diagnosis, v.treatment_plan, v.status,
              o.name_ar as center_name_ar, o.name_en as center_name_en,
              u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en
       FROM visits v
       JOIN organizations o ON v.organization_id = o.id
       JOIN users u ON v.clinician_id = u.id
       WHERE v.patient_id = $1 AND v.status = 'approved'
       ORDER BY v.visit_date DESC`,
      [patientId]
    );

    // 4. Approved Prescriptions
    const rxRes = await query(
      `SELECT pr.id, pr.organization_id, pr.created_at, pr.notes,
              o.name_ar as center_name_ar, o.name_en as center_name_en,
              u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en,
              json_agg(pi.*) as items
       FROM prescriptions pr
       JOIN organizations o ON pr.organization_id = o.id
       JOIN users u ON pr.clinician_id = u.id
       JOIN prescription_items pi ON pr.id = pi.prescription_id
       WHERE pr.patient_id = $1 AND pr.status = 'approved'
       GROUP BY pr.id, o.name_ar, o.name_en, u.full_name_ar, u.full_name_en
       ORDER BY pr.created_at DESC`,
      [patientId]
    );

    // 5. Approved Lab Results
    const labRes = await query(
      `SELECT lr.id, lr.parameter_name, lr.value, lr.unit, lr.reference_range, lr.is_abnormal, lr.status, lr.reviewed_at,
              lo.test_name_ar, lo.test_name_en, lo.test_category,
              o.name_ar as center_name_ar, o.name_en as center_name_en
       FROM lab_results lr
       JOIN lab_orders lo ON lr.lab_order_id = lo.id
       JOIN organizations o ON lr.organization_id = o.id
       WHERE lo.patient_id = $1 AND lr.status = 'approved'
       ORDER BY lr.reviewed_at DESC`,
      [patientId]
    );

    // 6. Upcoming Appointments
    const appointmentsRes = await query(
      `SELECT a.*, o.name_ar as center_name_ar, o.name_en as center_name_en,
              u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en
       FROM appointments a
       JOIN organizations o ON a.organization_id = o.id
       JOIN users u ON a.clinician_id = u.id
       WHERE a.patient_id = $1 AND a.appointment_date >= CURRENT_DATE AND a.status NOT IN ('cancelled', 'completed')
       ORDER BY a.appointment_date ASC, a.start_time ASC`,
      [patientId]
    );

    res.json({
      success: true,
      data: {
        profile: patientRes.rows[0],
        allergies: allergiesRes.rows,
        affiliatedCenters: centersRes.rows,
        visits: visitsRes.rows,
        prescriptions: rxRes.rows,
        labResults: labRes.rows,
        upcomingAppointments: appointmentsRes.rows,
      },
    });
  } catch (err: any) {
    console.error('Portal summary error:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/portal/messages
portalRouter.get('/messages', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  try {
    const messagesRes = await query(
      `SELECT m.*, o.name_ar as center_name_ar, o.name_en as center_name_en
       FROM patient_messages m
       JOIN organizations o ON m.organization_id = o.id
       WHERE m.patient_id = $1
       ORDER BY m.created_at DESC`,
      [patientId]
    );
    res.json({ success: true, data: messagesRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/portal/messages (Submit question or request)
portalRouter.post('/messages', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  const { organization_id, subject, body, category } = req.body;

  if (!organization_id || !subject || !body) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'organization_id, subject, and body are required.' },
    });
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO patient_messages (organization_id, patient_id, subject, body, category, status)
       VALUES ($1, $2, $3, $4, $5, 'submitted')
       RETURNING *`,
      [organization_id, patientId, subject, body, category || 'medical']
    );

    logAuditEvent({
      organizationId: organization_id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'patient',
      action: 'PATIENT_MESSAGE_SUBMIT',
      resourceType: 'patient_message',
      resourceId: insertRes.rows[0].id,
      ipAddress: req.ip,
      details: { subject, category },
    });

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/portal/symptoms (Log symptom)
portalRouter.post('/symptoms', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  const { organization_id, symptom_description, severity, onset_date, notes } = req.body;

  if (!symptom_description || !severity) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'symptom_description and severity (1-10) are required.' },
    });
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO symptom_reports (patient_id, organization_id, symptom_description, severity, onset_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [patientId, organization_id || null, symptom_description, severity, onset_date || new Date(), notes || null]
    );

    logAuditEvent({
      organizationId: organization_id || null,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'patient',
      action: 'PATIENT_SYMPTOM_LOG',
      resourceType: 'symptom_report',
      resourceId: insertRes.rows[0].id,
      ipAddress: req.ip,
      details: { severity },
    });

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/portal/symptoms
portalRouter.get('/symptoms', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  try {
    const symptomsRes = await query(
      'SELECT * FROM symptom_reports WHERE patient_id = $1 ORDER BY onset_date DESC',
      [patientId]
    );
    res.json({ success: true, data: symptomsRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
