import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { getAppointmentAvailability, isActiveDoctorInOrg } from '../services/appointmentService.js';
import { apiError, clampInt, isIsoDate, isTime, isUuid, serverError, toMinutes } from '../services/validation.js';
import { onAppointmentRescheduled, onAppointmentStatus } from '../services/notificationService.js';

export const appointmentRouter = Router();

// Appointments hold patient names and contact details: staff of the active center only. Patients use the
// portal; platform administrators have no operational access to a center's schedule.
appointmentRouter.use(authenticate, requireTenant, requireRole(['reception', 'doctor', 'center_manager']));

type AppointmentStatus = 'pending' | 'confirmed' | 'checked_in' | 'in_consultation' | 'completed' | 'cancelled' | 'no_show';

// Explicit state machine. Visit creation and approval move appointments to in_consultation / completed
// internally; the transitions below are what staff may request through the API.
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['pending', 'checked_in', 'no_show', 'cancelled'],
  checked_in: ['in_consultation', 'cancelled'],
  in_consultation: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};

// Which target statuses each role may set. Clinical progress belongs to the doctor, arrival to the front desk.
const ROLE_TARGETS: Record<string, AppointmentStatus[]> = {
  reception: ['pending', 'confirmed', 'checked_in', 'no_show', 'cancelled'],
  center_manager: ['pending', 'confirmed', 'checked_in', 'no_show', 'cancelled'],
  doctor: ['in_consultation', 'completed', 'no_show', 'cancelled'],
};

const VALID_STATUSES = Object.keys(TRANSITIONS);

// GET /api/appointments
appointmentRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const role = req.currentMembership!.role;
  const date = req.query.date as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const status = req.query.status as string | undefined;
  let clinicianId = req.query.clinicianId as string | undefined;
  const limit = clampInt(req.query.limit, 200, 1, 500);

  if ((date && !isIsoDate(date)) || (from && !isIsoDate(from)) || (to && !isIsoDate(to))) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Dates must use the YYYY-MM-DD format.'));
    return;
  }
  if (clinicianId && !isUuid(clinicianId)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'clinicianId must be a valid identifier.'));
    return;
  }
  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json(apiError('INVALID_STATUS', `Status must be one of: ${VALID_STATUSES.join(', ')}`));
    return;
  }

  // A doctor sees their own schedule only, whatever the query says.
  if (role === 'doctor') clinicianId = req.user!.id;

  // The reason for a visit can carry clinical wording; operational managers do not receive it or the phone number.
  const sensitive = role === 'center_manager' ? '' : ', a.reason, p.phone as patient_phone';

  try {
    let text = `
      SELECT a.id, a.organization_id, a.patient_id, a.clinician_id, a.appointment_date, a.start_time, a.end_time,
             a.status, a.check_in_time, a.created_at, a.updated_at${sensitive},
             p.full_name_ar as patient_name_ar, p.full_name_en as patient_name_en,
             u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en,
             m.specialty_ar, m.specialty_en
      FROM appointments a
      JOIN patient_profiles p ON a.patient_id = p.id
      JOIN users u ON a.clinician_id = u.id
      LEFT JOIN organization_memberships m ON (m.organization_id = a.organization_id AND m.user_id = a.clinician_id)
      WHERE a.organization_id = $1
    `;
    const params: any[] = [orgId];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      text += ` AND ${clause.replace('?', `$${params.length}`)}`;
    };

    if (date) add('a.appointment_date = ?', date);
    if (from) add('a.appointment_date >= ?', from);
    if (to) add('a.appointment_date <= ?', to);
    if (clinicianId) add('a.clinician_id = ?', clinicianId);
    if (status) add('a.status = ?', status);

    params.push(limit);
    text += ` ORDER BY a.appointment_date ASC, a.start_time ASC LIMIT $${params.length}`;

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/appointments/summary?from=&to=&clinicianId=  (appointments per day and status; counts only, no patient data)
const MAX_SUMMARY_DAYS = 62;
appointmentRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  let clinicianId = req.query.clinicianId as string | undefined;

  if (!isIsoDate(from) || !isIsoDate(to)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'from and to (YYYY-MM-DD) are required.'));
    return;
  }
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (span < 0 || span >= MAX_SUMMARY_DAYS) {
    res.status(400).json(apiError('VALIDATION_ERROR', `The range must run forward and cover at most ${MAX_SUMMARY_DAYS} days.`));
    return;
  }
  if (clinicianId && !isUuid(clinicianId)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'clinicianId must be a valid identifier.'));
    return;
  }
  // A doctor sees their own schedule only, whatever the query says.
  if (req.currentMembership!.role === 'doctor') clinicianId = req.user!.id;

  try {
    const params: any[] = [orgId, from, to];
    let filter = '';
    if (clinicianId) {
      params.push(clinicianId);
      filter = ` AND clinician_id = $${params.length}`;
    }
    const result = await query(
      `SELECT to_char(appointment_date, 'YYYY-MM-DD') AS date, status, count(*)::int AS count
       FROM appointments
       WHERE organization_id = $1 AND appointment_date BETWEEN $2 AND $3${filter}
       GROUP BY appointment_date, status ORDER BY appointment_date`,
      params
    );

    // "total" is the day's booked load: cancelled appointments no longer take the clinician's time.
    type DaySummary = { date: string; total: number; by_status: Record<string, number> };
    const days = new Map<string, DaySummary>();
    for (const row of result.rows) {
      const day: DaySummary = days.get(row.date) ?? { date: row.date, total: 0, by_status: {} };
      day.by_status[row.status] = row.count;
      if (row.status !== 'cancelled') day.total += row.count;
      days.set(row.date, day);
    }
    res.json({ success: true, data: { from, to, days: [...days.values()] } });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/appointments/availability?clinicianId=&date=  (slots confirmed by the server, not computed by the client)
appointmentRouter.get('/availability', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const clinicianId = req.query.clinicianId as string;
  const date = req.query.date as string;

  if (!isUuid(clinicianId) || !isIsoDate(date)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'clinicianId and date (YYYY-MM-DD) are required.'));
    return;
  }

  try {
    if (!(await isActiveDoctorInOrg(clinicianId, orgId))) {
      res.status(404).json(apiError('CLINICIAN_NOT_FOUND', 'No active clinician with this identifier in this medical center.'));
      return;
    }

    const data = await getAppointmentAvailability(orgId, clinicianId, date);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/appointments (server-side conflict detection under a per-clinician-per-day lock)
appointmentRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { patient_id, clinician_id, appointment_date, start_time, end_time, reason } = req.body || {};

  if (!patient_id || !clinician_id || !appointment_date || !start_time || !end_time) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Missing required appointment booking fields.'));
    return;
  }
  if (!isUuid(patient_id) || !isUuid(clinician_id) || !isIsoDate(appointment_date) || !isTime(start_time) || !isTime(end_time)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid identifier, date (YYYY-MM-DD) or time (HH:MM).'));
    return;
  }
  if (toMinutes(end_time) <= toMinutes(start_time)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'end_time must be after start_time.'));
    return;
  }
  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > 500)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'reason must be text of at most 500 characters.'));
    return;
  }

  try {
    if (!(await isPatientLinkedToOrg(patient_id, orgId))) {
      res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
      return;
    }
    if (!(await isActiveDoctorInOrg(clinician_id, orgId))) {
      res.status(400).json(apiError('INVALID_CLINICIAN', 'The selected clinician is not an active doctor in this medical center.'));
      return;
    }

    const outcome = await withTransaction(async (client) => {
      // Serialize bookings for one clinician on one day so two simultaneous requests cannot both pass the check.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${orgId}:${clinician_id}:${appointment_date}`]);

      const conflict = await client.query(
        `SELECT id, appointment_date, start_time, end_time, status
         FROM appointments
         WHERE organization_id = $1 AND clinician_id = $2 AND appointment_date = $3
           AND status <> 'cancelled' AND start_time < $5 AND end_time > $4`,
        [orgId, clinician_id, appointment_date, start_time, end_time]
      );
      if (conflict.rowCount && conflict.rowCount > 0) return { conflict: conflict.rows[0] };

      const insert = await client.query(
        `INSERT INTO appointments (organization_id, patient_id, clinician_id, appointment_date, start_time, end_time, status, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8)
         RETURNING *`,
        [orgId, patient_id, clinician_id, appointment_date, start_time, end_time, reason || null, req.user!.id]
      );
      return { created: insert.rows[0] };
    });

    if ('conflict' in outcome) {
      res.status(409).json(
        apiError('APPOINTMENT_CONFLICT', 'Conflict: The selected clinician already has an appointment booked during this time slot.', outcome.conflict)
      );
      return;
    }

    const created = outcome.created;
    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: 'APPOINTMENT_CREATE',
      resourceType: 'appointment',
      resourceId: created.id,
      ipAddress: req.ip,
      details: { clinicianId: clinician_id, date: appointment_date, time: start_time },
    });

    await onAppointmentStatus(created, 'new', { userId: req.user!.id, role: req.currentMembership?.role ?? '' });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('APPOINTMENT_CONFLICT', 'Unique slot constraint: double-booking prevented by server.'));
      return;
    }
    console.error('Booking error:', err);
    res.status(500).json(serverError(err));
  }
});

async function transition(req: Request, res: Response, target: AppointmentStatus, action: string): Promise<void> {
  const orgId = req.tenantId!;
  const appointmentId = req.params.id;
  const role = req.currentMembership!.role;

  if (!isUuid(appointmentId)) {
    res.status(404).json(apiError('APPOINTMENT_NOT_FOUND', 'Appointment not found in this medical center.'));
    return;
  }
  if (!ROLE_TARGETS[role]?.includes(target)) {
    res.status(403).json(apiError('FORBIDDEN_ROLE', `Your role cannot set an appointment to "${target}".`));
    return;
  }

  try {
    const outcome = await withTransaction(async (client) => {
      const current = await client.query(
        'SELECT id, status, clinician_id, (appointment_date + start_time) <= NOW() AS started FROM appointments WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [appointmentId, orgId]
      );
      if (current.rowCount === 0) return { notFound: true as const };
      const row = current.rows[0];

      if (role === 'doctor' && row.clinician_id !== req.user!.id) return { notFound: true as const };
      if (!TRANSITIONS[row.status as AppointmentStatus]?.includes(target)) return { invalid: row.status as string };
      // A no-show can only be recorded once the appointment time has passed.
      if (target === 'no_show' && !row.started) return { tooEarly: true as const };

      const updated = await client.query(
        `UPDATE appointments
         SET status = $1::varchar, updated_at = NOW(), check_in_time = CASE WHEN $1::varchar = 'checked_in' THEN NOW() ELSE check_in_time END
         WHERE id = $2 AND organization_id = $3
         RETURNING *`,
        [target, appointmentId, orgId]
      );
      return { updated: updated.rows[0], from: row.status as string };
    });

    if ('notFound' in outcome) {
      res.status(404).json(apiError('APPOINTMENT_NOT_FOUND', 'Appointment not found in this medical center.'));
      return;
    }
    if ('tooEarly' in outcome) {
      res.status(409).json(apiError('NO_SHOW_TOO_EARLY', 'A no-show can only be recorded after the appointment time has passed.'));
      return;
    }
    if ('invalid' in outcome) {
      res.status(409).json(apiError('INVALID_TRANSITION', `An appointment that is "${outcome.invalid}" cannot become "${target}".`));
      return;
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: role,
      action,
      resourceType: 'appointment',
      resourceId: outcome.updated.id,
      ipAddress: req.ip,
      details: { from: outcome.from, to: target, ...(target === 'checked_in' ? { checkInTime: outcome.updated.check_in_time } : {}) },
    });

    await onAppointmentStatus(outcome.updated, outcome.from, { userId: req.user!.id, role });
    res.json({ success: true, data: outcome.updated });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
}

// PATCH /api/appointments/:id  (reception, center manager): move a pending or confirmed appointment to another
// time and/or another doctor of the same center. Both clinician-days are locked, in a fixed order, while the
// new slot is checked, so a booking and a move cannot both take it.
appointmentRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const role = req.currentMembership!.role;
  const appointmentId = req.params.id;
  const { clinician_id, appointment_date, start_time, end_time, reason } = req.body || {};

  if (role === 'doctor') {
    res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only reception and center managers can reschedule an appointment.'));
    return;
  }
  if (!isUuid(appointmentId)) {
    res.status(404).json(apiError('APPOINTMENT_NOT_FOUND', 'Appointment not found in this medical center.'));
    return;
  }
  if (!isIsoDate(appointment_date) || !isTime(start_time) || !isTime(end_time) || (clinician_id !== undefined && !isUuid(clinician_id))) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'appointment_date (YYYY-MM-DD), start_time and end_time (HH:MM) are required; clinician_id must be a valid identifier.'));
    return;
  }
  if (toMinutes(end_time) <= toMinutes(start_time)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'end_time must be after start_time.'));
    return;
  }
  if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > 500)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'reason must be text of at most 500 characters.'));
    return;
  }

  try {
    if (clinician_id && !(await isActiveDoctorInOrg(clinician_id, orgId))) {
      res.status(400).json(apiError('INVALID_CLINICIAN', 'The selected clinician is not an active doctor in this medical center.'));
      return;
    }

    const outcome = await withTransaction(async (client) => {
      const found = await client.query(
        'SELECT id, status, clinician_id, appointment_date, start_time, end_time FROM appointments WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [appointmentId, orgId]
      );
      if (found.rowCount === 0) return { notFound: true as const };
      const before = found.rows[0];
      if (before.status !== 'pending' && before.status !== 'confirmed') return { notReschedulable: before.status as string };

      const target = clinician_id ?? before.clinician_id;
      const past = await client.query('SELECT ($1::date + $2::time) < NOW() AS is_past', [appointment_date, start_time]);
      if (past.rows[0].is_past) return { past: true as const };

      const keys = [...new Set([`${orgId}:${before.clinician_id}:${before.appointment_date}`, `${orgId}:${target}:${appointment_date}`])].sort();
      for (const key of keys) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);

      const conflict = await client.query(
        `SELECT id FROM appointments
         WHERE organization_id = $1 AND clinician_id = $2 AND appointment_date = $3 AND id <> $6
           AND status <> 'cancelled' AND start_time < $5 AND end_time > $4`,
        [orgId, target, appointment_date, start_time, end_time, appointmentId]
      );
      if (conflict.rowCount && conflict.rowCount > 0) return { conflict: true as const };

      const updated = await client.query(
        `UPDATE appointments
         SET clinician_id = $1, appointment_date = $2, start_time = $3, end_time = $4,
             reason = CASE WHEN $5::boolean THEN $6 ELSE reason END, updated_at = NOW()
         WHERE id = $7 AND organization_id = $8
         RETURNING *`,
        [target, appointment_date, start_time, end_time, reason !== undefined, reason ?? null, appointmentId, orgId]
      );
      return { updated: updated.rows[0], before };
    });

    if ('notFound' in outcome) {
      res.status(404).json(apiError('APPOINTMENT_NOT_FOUND', 'Appointment not found in this medical center.'));
      return;
    }
    if ('notReschedulable' in outcome) {
      res.status(409).json(apiError('NOT_RESCHEDULABLE', `An appointment that is "${outcome.notReschedulable}" cannot be rescheduled.`));
      return;
    }
    if ('past' in outcome) {
      res.status(400).json(apiError('APPOINTMENT_SLOT_PAST', 'Choose a future appointment time.'));
      return;
    }
    if ('conflict' in outcome) {
      res.status(409).json(apiError('APPOINTMENT_CONFLICT', 'Conflict: The selected clinician already has an appointment booked during this time slot.'));
      return;
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: role,
      action: 'APPOINTMENT_RESCHEDULE',
      resourceType: 'appointment',
      resourceId: outcome.updated.id,
      ipAddress: req.ip,
      details: {
        from: { clinicianId: outcome.before.clinician_id, date: outcome.before.appointment_date, time: String(outcome.before.start_time).slice(0, 5) },
        to: { clinicianId: outcome.updated.clinician_id, date: appointment_date, time: start_time },
      },
    });

    await onAppointmentRescheduled(outcome.updated, outcome.before, req.user!.id);
    res.json({ success: true, data: outcome.updated });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('APPOINTMENT_CONFLICT', 'Unique slot constraint: double-booking prevented by server.'));
      return;
    }
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/appointments/:id/check-in (front-desk arrival workflow)
appointmentRouter.patch('/:id/check-in', (req: Request, res: Response) => transition(req, res, 'checked_in', 'APPOINTMENT_CHECK_IN'));

// PATCH /api/appointments/:id/status
appointmentRouter.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json(apiError('INVALID_STATUS', `Status must be one of: ${VALID_STATUSES.join(', ')}`));
    return;
  }
  await transition(req, res, status as AppointmentStatus, 'APPOINTMENT_STATUS_CHANGE');
});

// GET /api/appointments/schedules
appointmentRouter.get('/schedules', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const clinicianId = req.query.clinicianId as string;
  if (clinicianId && !isUuid(clinicianId)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'clinicianId must be a valid identifier.'));
    return;
  }

  try {
    let text = `
      SELECT s.*, u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en
      FROM clinician_schedules s
      JOIN users u ON s.clinician_id = u.id
      WHERE s.organization_id = $1 AND s.is_active = true
    `;
    const params: any[] = [orgId];

    if (clinicianId) {
      params.push(clinicianId);
      text += ` AND s.clinician_id = $${params.length}`;
    }

    text += ' ORDER BY s.day_of_week ASC, s.start_time ASC';

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

const requireManager = requireRole(['center_manager']);

// POST /api/appointments/schedules (center manager): add a working window for one of the center's doctors
appointmentRouter.post('/schedules', requireManager, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { clinician_id, day_of_week, start_time, end_time, slot_duration_minutes } = req.body || {};
  const duration = slot_duration_minutes === undefined ? 30 : Number(slot_duration_minutes);

  if (
    !isUuid(clinician_id) ||
    !Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6 ||
    !isTime(start_time) || !isTime(end_time) ||
    !Number.isInteger(duration) || duration < 5 || duration > 240
  ) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'clinician_id, day_of_week (0-6), start_time, end_time and slot_duration_minutes (5-240) are required.'));
    return;
  }
  if (toMinutes(end_time) - toMinutes(start_time) < duration) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'The working window must fit at least one slot.'));
    return;
  }

  try {
    if (!(await isActiveDoctorInOrg(clinician_id, orgId))) {
      res.status(400).json(apiError('INVALID_CLINICIAN', 'The selected clinician is not an active doctor in this medical center.'));
      return;
    }

    const overlap = await query(
      `SELECT 1 FROM clinician_schedules
       WHERE organization_id = $1 AND clinician_id = $2 AND day_of_week = $3 AND is_active = true
         AND start_time < $5 AND end_time > $4`,
      [orgId, clinician_id, day_of_week, start_time, end_time]
    );
    if (overlap.rowCount && overlap.rowCount > 0) {
      res.status(409).json(apiError('SCHEDULE_OVERLAP', 'This clinician already has a working window that overlaps these hours.'));
      return;
    }

    const insert = await query(
      `INSERT INTO clinician_schedules (organization_id, clinician_id, day_of_week, start_time, end_time, slot_duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [orgId, clinician_id, day_of_week, start_time, end_time, duration]
    );

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'center_manager',
      action: 'SCHEDULE_CREATE',
      resourceType: 'clinician_schedule',
      resourceId: insert.rows[0].id,
      ipAddress: req.ip,
      details: { clinicianId: clinician_id, date: String(day_of_week), time: start_time },
    });

    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/appointments/schedules/:id (center manager): switch a window off or on, scoped to this center
appointmentRouter.patch('/schedules/:id', requireManager, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { is_active } = req.body || {};

  if (!isUuid(req.params.id) || typeof is_active !== 'boolean') {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A schedule id and a boolean is_active are required.'));
    return;
  }

  try {
    const update = await query(
      'UPDATE clinician_schedules SET is_active = $1 WHERE id = $2 AND organization_id = $3 RETURNING *',
      [is_active, req.params.id, orgId]
    );
    if (update.rowCount === 0) {
      res.status(404).json(apiError('SCHEDULE_NOT_FOUND', 'Schedule not found in this medical center.'));
      return;
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'center_manager',
      action: 'SCHEDULE_UPDATE',
      resourceType: 'clinician_schedule',
      resourceId: update.rows[0].id,
      ipAddress: req.ip,
      details: { isActive: is_active },
    });

    res.json({ success: true, data: update.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});
