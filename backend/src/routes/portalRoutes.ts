import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { buildTimeline, parseTimelineQuery } from '../services/recordService.js';
import { buildPatientSummary } from '../services/patientSummary.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { createPendingAppointment, getAppointmentAvailability, isActiveDoctorInOrg } from '../services/appointmentService.js';
import { apiError, isIsoDate, isTime, isUuid, serverError, toMinutes } from '../services/validation.js';

export const portalRouter = Router();

portalRouter.use(authenticate, requirePatient);

// GET /api/portal/clinicians?organizationId=... (only centers linked to this patient's profile)
portalRouter.get('/clinicians', async (req: Request, res: Response): Promise<void> => {
  const organizationId = req.query.organizationId;
  if (!isUuid(organizationId)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'organizationId must be a valid identifier.'));
    return;
  }
  try {
    if (!(await isPatientLinkedToOrg(req.user!.patientProfileId!, organizationId))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to your profile.'));
      return;
    }
    const clinicians = await query(
      `SELECT u.id, u.full_name_ar, u.full_name_en, m.specialty_ar, m.specialty_en
       FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.role = 'doctor' AND m.status = 'active' AND u.is_active = true
       ORDER BY u.full_name_ar, u.full_name_en`,
      [organizationId]
    );
    res.json({ success: true, data: clinicians.rows });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/portal/availability?organizationId=&clinicianId=&date=
portalRouter.get('/availability', async (req: Request, res: Response): Promise<void> => {
  const organizationId = req.query.organizationId;
  const clinicianId = req.query.clinicianId;
  const date = req.query.date;
  if (!isUuid(organizationId) || !isUuid(clinicianId) || !isIsoDate(date)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A valid organizationId, clinicianId, and date (YYYY-MM-DD) are required.'));
    return;
  }
  try {
    if (!(await isPatientLinkedToOrg(req.user!.patientProfileId!, organizationId))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to your profile.'));
      return;
    }
    if (!(await isActiveDoctorInOrg(clinicianId, organizationId))) {
      res.status(404).json(apiError('CLINICIAN_NOT_FOUND', 'No active clinician is available at this center.'));
      return;
    }
    res.json({ success: true, data: await getAppointmentAvailability(organizationId, clinicianId, date) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/portal/appointments: submit a patient appointment request as a pending appointment.
portalRouter.post('/appointments', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  const patientUserId = req.user!.id;
  const { organization_id, clinician_id, appointment_date, start_time, end_time } = req.body || {};
  if (
    !isUuid(organization_id) || !isUuid(clinician_id) || !isIsoDate(appointment_date) ||
    !isTime(start_time) || !isTime(end_time) || !/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time) ||
    toMinutes(end_time) <= toMinutes(start_time)
  ) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Choose a valid medical center, clinician, date, and time slot.'));
    return;
  }
  try {
    if (!(await isPatientLinkedToOrg(patientId, organization_id))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to your profile.'));
      return;
    }
    if (!(await isActiveDoctorInOrg(clinician_id, organization_id))) {
      res.status(404).json(apiError('CLINICIAN_NOT_FOUND', 'The selected clinician is not available at this center.'));
      return;
    }

    const outcome = await createPendingAppointment({
      patientId, createdBy: patientUserId, organization_id, clinician_id, appointment_date, start_time, end_time,
    });

    if ('reason' in outcome) {
      if (outcome.reason === 'past') {
        res.status(400).json(apiError('APPOINTMENT_SLOT_PAST', 'Choose a future appointment slot.'));
      } else if (outcome.reason === 'unavailable') {
        res.status(409).json(apiError('APPOINTMENT_SLOT_UNAVAILABLE', 'The selected slot is no longer available.'));
      } else {
        res.status(409).json(apiError('APPOINTMENT_CONFLICT', 'Another appointment has taken this slot. Choose a different time.'));
      }
      return;
    }

    logAuditEvent({
      organizationId: organization_id,
      actorId: patientUserId,
      actorEmail: req.user!.email,
      actorRole: 'patient',
      action: 'PATIENT_APPOINTMENT_REQUEST',
      resourceType: 'appointment',
      resourceId: String(outcome.created.id),
      ipAddress: req.ip,
      details: { clinicianId: clinician_id, date: appointment_date, time: start_time },
    });
    res.status(201).json({ success: true, data: outcome.created });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('APPOINTMENT_CONFLICT', 'Another appointment has taken this slot. Choose a different time.'));
      return;
    }
    res.status(500).json(serverError(err));
  }
});

// GET /api/portal/summary (Longitudinal summary of APPROVED health information)
portalRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await buildPatientSummary(req.user!.patientProfileId!) });
  } catch (err: any) {
    console.error('Portal summary error:', err);
    res.status(500).json(serverError(err));
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
  const { organization_id, subject, body, category } = req.body || {};
  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  const cleanBody = typeof body === 'string' ? body.trim() : '';
  const allowedCategories = ['medical', 'administrative', 'refill'];

  if (
    !isUuid(organization_id) || !cleanSubject || cleanSubject.length > 255 ||
    !cleanBody || cleanBody.length > 4000 || !allowedCategories.includes(category || 'medical')
  ) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Choose a linked medical center and provide a subject (up to 255 characters), message (up to 4000 characters), and valid category.' },
    });
    return;
  }

  try {
    if (!(await isPatientLinkedToOrg(patientId, organization_id))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to your profile.'));
      return;
    }
    const insertRes = await query(
      `INSERT INTO patient_messages (organization_id, patient_id, subject, body, category, status)
       VALUES ($1, $2, $3, $4, $5, 'submitted')
       RETURNING *`,
      [organization_id, patientId, cleanSubject, cleanBody, category || 'medical']
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
      // Message content can contain sensitive health information; never copy it into audit metadata.
      details: { category: category || 'medical', count: 1 },
    });

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/portal/symptoms (Log symptom)
portalRouter.post('/symptoms', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  const { organization_id, symptom_description, severity, onset_date, notes } = req.body || {};
  const description = typeof symptom_description === 'string' ? symptom_description.trim() : '';
  const cleanNotes = typeof notes === 'string' ? notes.trim() : '';
  const severityValue = typeof severity === 'number' ? severity : Number.NaN;

  if (
    !description || description.length > 4000 ||
    !Number.isInteger(severityValue) || severityValue < 1 || severityValue > 10 ||
    (organization_id !== undefined && organization_id !== null && !isUuid(organization_id)) ||
    (onset_date !== undefined && onset_date !== null && !isIsoDate(onset_date)) ||
    cleanNotes.length > 2000
  ) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Provide a symptom description, a severity from 1 to 10, and valid optional date, center, and notes.' },
    });
    return;
  }

  try {
    if (organization_id && !(await isPatientLinkedToOrg(patientId, organization_id))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to your profile.'));
      return;
    }
    if (onset_date) {
      const dateCheck = await query('SELECT $1::date <= CURRENT_DATE AS is_not_future', [onset_date]);
      if (!dateCheck.rows[0]?.is_not_future) {
        res.status(400).json(apiError('VALIDATION_ERROR', 'The symptom start date cannot be in the future.'));
        return;
      }
    }
    const insertRes = await query(
      `INSERT INTO symptom_reports (patient_id, organization_id, symptom_description, severity, onset_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [patientId, organization_id || null, description, severityValue, onset_date || new Date(), cleanNotes || null]
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
      details: { severity: severityValue },
    });

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json(serverError(err));
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

// GET /api/portal/timeline (the patient's longitudinal record: approved and released items only, every center)
portalRouter.get('/timeline', async (req: Request, res: Response): Promise<void> => {
  const parsed = parseTimelineQuery(req.query);
  if ('error' in parsed) {
    res.status(400).json(apiError('VALIDATION_ERROR', parsed.error));
    return;
  }
  try {
    const result = await buildTimeline({ kind: 'patient', patientId: req.user!.patientProfileId! }, parsed.options);
    res.json({
      success: true,
      data: result.items,
      meta: { limit: parsed.options.limit, hasMore: result.hasMore, nextBefore: result.nextBefore },
    });
  } catch (err: any) {
    console.error('Portal timeline error:', err);
    res.status(500).json(serverError(err));
  }
});
