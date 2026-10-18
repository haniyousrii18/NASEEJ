import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { auditCaregiver, requireDelegation } from '../services/caregiverService.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { buildPatientSummary } from '../services/patientSummary.js';
import { buildTimeline, parseTimelineQuery } from '../services/recordService.js';
import { createPendingAppointment, getAppointmentAvailability, isActiveDoctorInOrg } from '../services/appointmentService.js';
import { apiError, clampInt, isIsoDate, isTime, isUuid, serverError, toMinutes, trimmed } from '../services/validation.js';
import { onDelegationEvent, onPatientMessage } from '../services/notificationService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =============================================================================
// Patient side: /api/portal/caregivers — the patient grants, reviews and revokes access to their own file.
// =============================================================================
export const patientCaregiverRouter = Router();
patientCaregiverRouter.use(authenticate, requirePatient);

const stateOf = (r: any): 'invited' | 'active' | 'expired' | 'declined' | 'revoked' | 'ended' => {
  if (r.status === 'invited' || r.status === 'active') return new Date(r.expires_at).getTime() > Date.now() ? r.status : 'expired';
  return r.status;
};

// GET /api/portal/caregivers
patientCaregiverRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query(
      `SELECT d.id, d.caregiver_email, d.relationship, d.can_view_records, d.can_manage_appointments, d.can_send_messages,
              d.status, d.invited_at, d.accepted_at, d.expires_at, d.ended_at,
              u.full_name_ar AS caregiver_name_ar, u.full_name_en AS caregiver_name_en
       FROM caregiver_delegations d LEFT JOIN users u ON u.id = d.caregiver_user_id
       WHERE d.patient_id = $1
       ORDER BY d.invited_at DESC`,
      [req.user!.patientProfileId]
    );
    res.json({ success: true, data: rows.rows.map((r) => ({ ...r, state: stateOf(r) })) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/portal/caregivers  { email, relationship?, can_view_records, can_manage_appointments, can_send_messages, expires_in_days }
patientCaregiverRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const relationship = body.relationship === undefined || body.relationship === null || body.relationship === '' ? null : trimmed(body.relationship, 60);
  const flags = {
    view: body.can_view_records === true,
    appointments: body.can_manage_appointments === true,
    messages: body.can_send_messages === true,
  };
  const days = clampInt(body.expires_in_days, 90, 7, 365);

  if (!EMAIL_RE.test(email) || email.length > 255) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Enter the caregiver’s email address.'));
    return;
  }
  if (body.relationship && !relationship) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'The relationship label is limited to 60 characters.'));
    return;
  }
  if (!flags.view && !flags.appointments && !flags.messages) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Choose at least one thing the caregiver may do.'));
    return;
  }
  if (email === String(req.user!.email).toLowerCase()) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'You cannot authorize your own account.'));
    return;
  }

  try {
    // An invitation or access that ran past its expiry no longer counts, and must not block a new one.
    await query(
      `UPDATE caregiver_delegations SET status = 'ended', ended_at = COALESCE(ended_at, expires_at), updated_at = NOW()
       WHERE patient_id = $1 AND caregiver_email = $2 AND status IN ('invited', 'active') AND expires_at <= NOW()`,
      [patientId, email]
    );
    const insert = await query(
      `INSERT INTO caregiver_delegations
         (patient_id, caregiver_email, relationship, can_view_records, can_manage_appointments, can_send_messages, status, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'invited', $7, NOW() + ($8 || ' days')::interval)
       RETURNING id, caregiver_email, relationship, can_view_records, can_manage_appointments, can_send_messages, status, invited_at, expires_at`,
      [patientId, email, relationship, flags.view, flags.appointments, flags.messages, req.user!.id, String(days)]
    );
    logAuditEvent({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'patient',
      action: 'CAREGIVER_INVITE',
      resourceType: 'caregiver_delegation',
      resourceId: insert.rows[0].id,
      ipAddress: req.ip,
      details: { delegationId: insert.rows[0].id, patientId, scope: Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join(',') },
    });
    await onDelegationEvent('delegation.invited', { id: insert.rows[0].id, patient_id: patientId, caregiver_email: insert.rows[0].caregiver_email }, req.user!.id);
    res.status(201).json({ success: true, data: { ...insert.rows[0], state: 'invited' } });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('DELEGATION_EXISTS', 'This person already has an open invitation or active access. Revoke it first to change what they can do.'));
      return;
    }
    res.status(500).json(serverError(err));
  }
});

// POST /api/portal/caregivers/:id/revoke
patientCaregiverRouter.post('/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  const patientId = req.user!.patientProfileId!;
  if (!isUuid(req.params.id)) {
    res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'Authorization not found.'));
    return;
  }
  try {
    const update = await query(
      `UPDATE caregiver_delegations SET status = 'revoked', ended_at = NOW(), ended_by = $3, updated_at = NOW()
       WHERE id = $1 AND patient_id = $2 AND status IN ('invited', 'active')
       RETURNING id, caregiver_user_id, caregiver_email`,
      [req.params.id, patientId, req.user!.id]
    );
    if (update.rowCount === 0) {
      res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'There is no open authorization to revoke.'));
      return;
    }
    logAuditEvent({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'patient',
      action: 'CAREGIVER_REVOKE',
      resourceType: 'caregiver_delegation',
      resourceId: req.params.id,
      ipAddress: req.ip,
      details: { delegationId: req.params.id, patientId },
    });
    await onDelegationEvent('delegation.revoked', { id: req.params.id, patient_id: patientId, caregiver_user_id: update.rows[0].caregiver_user_id, caregiver_email: update.rows[0].caregiver_email }, req.user!.id);
    res.json({ success: true, data: { id: req.params.id, state: 'revoked' } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/portal/caregivers/:id/history: what the caregiver did under this authorization (the patient's own review).
patientCaregiverRouter.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  if (!isUuid(req.params.id)) {
    res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'Authorization not found.'));
    return;
  }
  try {
    const own = await query('SELECT 1 FROM caregiver_delegations WHERE id = $1 AND patient_id = $2', [req.params.id, req.user!.patientProfileId]);
    if (own.rowCount === 0) {
      res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'Authorization not found.'));
      return;
    }
    const rows = await query(
      `SELECT action, actor_role, created_at, details->>'area' AS area
       FROM audit_logs
       WHERE resource_type = 'caregiver_delegation' AND resource_id = $1 AND action NOT LIKE 'SECURITY_%'
       ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// =============================================================================
// Caregiver side: /api/caregiver — acts only through a delegation the patient granted and the caregiver accepted.
// =============================================================================
export const caregiverRouter = Router();
caregiverRouter.use(authenticate);

// GET /api/caregiver/delegations: invitations addressed to this account's email, active access, and past access.
caregiverRouter.get('/delegations', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query(
      `SELECT d.id, d.relationship, d.can_view_records, d.can_manage_appointments, d.can_send_messages,
              d.status, d.invited_at, d.accepted_at, d.expires_at, d.ended_at,
              p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
       FROM caregiver_delegations d JOIN patient_profiles p ON p.id = d.patient_id
       WHERE d.caregiver_user_id = $1 OR (d.caregiver_user_id IS NULL AND d.caregiver_email = LOWER($2))
       ORDER BY d.invited_at DESC`,
      [req.user!.id, req.user!.email]
    );
    res.json({ success: true, data: rows.rows.map((r) => ({ ...r, state: stateOf(r) })) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

async function respondToInvitation(req: Request, res: Response, accept: boolean): Promise<void> {
  if (!isUuid(req.params.id)) {
    res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'Invitation not found.'));
    return;
  }
  try {
    const update = accept
      ? await query(
          `UPDATE caregiver_delegations SET status = 'active', caregiver_user_id = $2, accepted_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'invited' AND expires_at > NOW() AND caregiver_email = LOWER($3)
           RETURNING id, patient_id`,
          [req.params.id, req.user!.id, req.user!.email]
        )
      : await query(
          `UPDATE caregiver_delegations SET status = 'declined', caregiver_user_id = $2, ended_at = NOW(), ended_by = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'invited' AND caregiver_email = LOWER($3)
           RETURNING id, patient_id`,
          [req.params.id, req.user!.id, req.user!.email]
        );
    if (update.rowCount === 0) {
      res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'This invitation is not available. It may have expired or been withdrawn.'));
      return;
    }
    logAuditEvent({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'caregiver',
      action: accept ? 'CAREGIVER_ACCEPT' : 'CAREGIVER_DECLINE',
      resourceType: 'caregiver_delegation',
      resourceId: req.params.id,
      ipAddress: req.ip,
      details: { delegationId: req.params.id, patientId: update.rows[0].patient_id },
    });
    await onDelegationEvent(accept ? 'delegation.accepted' : 'delegation.declined', { id: req.params.id, patient_id: update.rows[0].patient_id, caregiver_user_id: req.user!.id }, req.user!.id);
    res.json({ success: true, data: { id: req.params.id, state: accept ? 'active' : 'declined' } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
}
caregiverRouter.post('/delegations/:id/accept', (req, res) => respondToInvitation(req, res, true));
caregiverRouter.post('/delegations/:id/decline', (req, res) => respondToInvitation(req, res, false));

// POST /api/caregiver/delegations/:id/leave: the caregiver ends their own access.
caregiverRouter.post('/delegations/:id/leave', async (req: Request, res: Response): Promise<void> => {
  if (!isUuid(req.params.id)) {
    res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'Access not found.'));
    return;
  }
  try {
    const update = await query(
      `UPDATE caregiver_delegations SET status = 'ended', ended_at = NOW(), ended_by = $2, updated_at = NOW()
       WHERE id = $1 AND caregiver_user_id = $2 AND status = 'active' RETURNING id, patient_id`,
      [req.params.id, req.user!.id]
    );
    if (update.rowCount === 0) {
      res.status(404).json(apiError('DELEGATION_NOT_FOUND', 'There is no active access to end.'));
      return;
    }
    auditCaregiver(req, { id: req.params.id, patient_id: update.rows[0].patient_id }, 'CAREGIVER_LEAVE', 'access');
    await onDelegationEvent('delegation.ended', { id: req.params.id, patient_id: update.rows[0].patient_id, caregiver_user_id: req.user!.id }, req.user!.id);
    res.json({ success: true, data: { id: req.params.id, state: 'ended' } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/caregiver/patients/:id/summary  (view records)
caregiverRouter.get('/patients/:id/summary', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['view']);
  if (!delegation) return;
  try {
    const summary = await buildPatientSummary(delegation.patient_id);
    auditCaregiver(req, delegation, 'CAREGIVER_READ', 'summary');
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/caregiver/patients/:id/timeline  (view records) — the patient's own approved/released view, nothing more
caregiverRouter.get('/patients/:id/timeline', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['view']);
  if (!delegation) return;
  const parsed = parseTimelineQuery(req.query);
  if ('error' in parsed) {
    res.status(400).json(apiError('VALIDATION_ERROR', parsed.error));
    return;
  }
  try {
    const result = await buildTimeline({ kind: 'patient', patientId: delegation.patient_id }, parsed.options);
    auditCaregiver(req, delegation, 'CAREGIVER_READ', 'timeline');
    res.json({ success: true, data: result.items, meta: { limit: parsed.options.limit, hasMore: result.hasMore, nextBefore: result.nextBefore } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/caregiver/patients/:id/appointments  (manage appointments, or view records)
caregiverRouter.get('/patients/:id/appointments', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['appointments', 'view']);
  if (!delegation) return;
  try {
    const rows = await query(
      `SELECT a.id, a.organization_id, a.appointment_date, to_char(a.start_time, 'HH24:MI') AS start_time, to_char(a.end_time, 'HH24:MI') AS end_time,
              a.status, a.created_at,
              o.name_ar AS center_name_ar, o.name_en AS center_name_en,
              u.full_name_ar AS clinician_name_ar, u.full_name_en AS clinician_name_en
       FROM appointments a JOIN organizations o ON o.id = a.organization_id JOIN users u ON u.id = a.clinician_id
       WHERE a.patient_id = $1 AND a.appointment_date >= CURRENT_DATE - INTERVAL '60 days'
       ORDER BY a.appointment_date DESC, a.start_time DESC LIMIT 100`,
      [delegation.patient_id]
    );
    auditCaregiver(req, delegation, 'CAREGIVER_READ', 'appointments');
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/caregiver/patients/:id/centers  (manage appointments or messages): the patient's linked centers, names only
caregiverRouter.get('/patients/:id/centers', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['appointments', 'messages']);
  if (!delegation) return;
  try {
    const rows = await query(
      `SELECT o.id, o.name_ar, o.name_en FROM patient_center_links l JOIN organizations o ON o.id = l.organization_id
       WHERE l.patient_id = $1 AND l.status = 'active' AND o.status = 'active' ORDER BY o.name_en`,
      [delegation.patient_id]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/caregiver/patients/:id/clinicians?organizationId=  (manage appointments)
caregiverRouter.get('/patients/:id/clinicians', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['appointments']);
  if (!delegation) return;
  const organizationId = req.query.organizationId;
  if (!isUuid(organizationId)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'organizationId must be a valid identifier.'));
    return;
  }
  try {
    if (!(await isPatientLinkedToOrg(delegation.patient_id, organizationId))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to the patient.'));
      return;
    }
    const rows = await query(
      `SELECT u.id, u.full_name_ar, u.full_name_en, m.specialty_ar, m.specialty_en
       FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.role = 'doctor' AND m.status = 'active' AND u.is_active = true
       ORDER BY u.full_name_ar, u.full_name_en`,
      [organizationId]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/caregiver/patients/:id/availability?organizationId=&clinicianId=&date=  (manage appointments)
caregiverRouter.get('/patients/:id/availability', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['appointments']);
  if (!delegation) return;
  const { organizationId, clinicianId, date } = req.query;
  if (!isUuid(organizationId) || !isUuid(clinicianId) || !isIsoDate(date)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A valid organizationId, clinicianId, and date (YYYY-MM-DD) are required.'));
    return;
  }
  try {
    if (!(await isPatientLinkedToOrg(delegation.patient_id, organizationId))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to the patient.'));
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

// POST /api/caregiver/patients/:id/appointments  (manage appointments): a pending request, like the patient's own
caregiverRouter.post('/patients/:id/appointments', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['appointments']);
  if (!delegation) return;
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
    if (!(await isPatientLinkedToOrg(delegation.patient_id, organization_id))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to the patient.'));
      return;
    }
    if (!(await isActiveDoctorInOrg(clinician_id, organization_id))) {
      res.status(404).json(apiError('CLINICIAN_NOT_FOUND', 'The selected clinician is not available at this center.'));
      return;
    }
    const outcome = await createPendingAppointment({
      patientId: delegation.patient_id, createdBy: req.user!.id, organization_id, clinician_id, appointment_date, start_time, end_time,
    });
    if ('reason' in outcome) {
      const map = {
        past: [400, 'APPOINTMENT_SLOT_PAST', 'Choose a future appointment slot.'],
        unavailable: [409, 'APPOINTMENT_SLOT_UNAVAILABLE', 'The selected slot is no longer available.'],
        conflict: [409, 'APPOINTMENT_CONFLICT', 'Another appointment has taken this slot. Choose a different time.'],
      } as const;
      const [status, code, message] = map[outcome.reason];
      res.status(status).json(apiError(code, message));
      return;
    }
    auditCaregiver(req, delegation, 'CAREGIVER_APPOINTMENT_REQUEST', 'appointments', { clinicianId: clinician_id, date: appointment_date, time: start_time });
    res.status(201).json({ success: true, data: outcome.created });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('APPOINTMENT_CONFLICT', 'Another appointment has taken this slot. Choose a different time.'));
      return;
    }
    res.status(500).json(serverError(err));
  }
});

// GET /api/caregiver/patients/:id/messages  (send messages): only messages THIS caregiver sent, with any reply to them
caregiverRouter.get('/patients/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['messages']);
  if (!delegation) return;
  try {
    const rows = await query(
      `SELECT m.id, m.subject, m.body, m.category, m.status, m.response, m.responded_at, m.created_at,
              o.name_ar AS center_name_ar, o.name_en AS center_name_en
       FROM patient_messages m JOIN organizations o ON o.id = m.organization_id
       WHERE m.patient_id = $1 AND m.sent_by_caregiver_id = $2
       ORDER BY m.created_at DESC`,
      [delegation.patient_id, req.user!.id]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/caregiver/patients/:id/messages  (send messages)
caregiverRouter.post('/patients/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const delegation = await requireDelegation(req, res, ['messages']);
  if (!delegation) return;
  const { organization_id, subject, body, category } = req.body || {};
  const cleanSubject = trimmed(subject, 255);
  const cleanBody = trimmed(body, 4000);
  const allowed = ['medical', 'administrative', 'refill'];
  if (!isUuid(organization_id) || !cleanSubject || !cleanBody || !allowed.includes(category || 'medical')) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Choose a center and provide a subject (up to 255 characters), a message (up to 4000 characters) and a valid category.'));
    return;
  }
  try {
    if (!(await isPatientLinkedToOrg(delegation.patient_id, organization_id))) {
      res.status(404).json(apiError('CENTER_NOT_FOUND', 'This medical center is not linked to the patient.'));
      return;
    }
    const insert = await query(
      `INSERT INTO patient_messages (organization_id, patient_id, subject, body, category, status, sent_by_caregiver_id)
       VALUES ($1, $2, $3, $4, $5, 'submitted', $6)
       RETURNING id, subject, category, status, created_at`,
      [organization_id, delegation.patient_id, cleanSubject, cleanBody, category || 'medical', req.user!.id]
    );
    auditCaregiver(req, delegation, 'CAREGIVER_MESSAGE_SEND', 'messages', { count: 1 });
    await onPatientMessage({ id: insert.rows[0].id, organization_id }, req.user!.id);
    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
