import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { logAuditEvent } from '../services/auditService.js';

export const appointmentRouter = Router();

appointmentRouter.use(authenticate, requireTenant);

// GET /api/appointments
appointmentRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const date = req.query.date as string;
  const clinicianId = req.query.clinicianId as string;
  const status = req.query.status as string;

  try {
    let text = `
      SELECT a.*,
             p.full_name_ar as patient_name_ar, p.full_name_en as patient_name_en, p.phone as patient_phone,
             u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en,
             m.specialty_ar, m.specialty_en
      FROM appointments a
      JOIN patient_profiles p ON a.patient_id = p.id
      JOIN users u ON a.clinician_id = u.id
      LEFT JOIN organization_memberships m ON (m.organization_id = a.organization_id AND m.user_id = a.clinician_id)
      WHERE a.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (date) {
      params.push(date);
      text += ` AND a.appointment_date = $${params.length}`;
    }
    if (clinicianId) {
      params.push(clinicianId);
      text += ` AND a.clinician_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      text += ` AND a.status = $${params.length}`;
    }

    text += ' ORDER BY a.appointment_date ASC, a.start_time ASC';

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/appointments (With Server-Side Conflict Detection)
appointmentRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { patient_id, clinician_id, appointment_date, start_time, end_time, reason } = req.body;

  if (!patient_id || !clinician_id || !appointment_date || !start_time || !end_time) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required appointment booking fields.' },
    });
    return;
  }

  try {
    // 1. Conflict Check: verify clinician does not already have an appointment at this date and overlapping time
    const conflictCheck = await query(
      `SELECT id, appointment_date, start_time, end_time, status 
       FROM appointments 
       WHERE organization_id = $1 
         AND clinician_id = $2 
         AND appointment_date = $3 
         AND status NOT IN ('cancelled')
         AND (
           (start_time <= $4 AND end_time > $4) OR
           (start_time < $5 AND end_time >= $5) OR
           (start_time >= $4 AND end_time <= $5)
         )`,
      [orgId, clinician_id, appointment_date, start_time, end_time]
    );

    if (conflictCheck.rowCount && conflictCheck.rowCount > 0) {
      res.status(409).json({
        success: false,
        error: {
          code: 'APPOINTMENT_CONFLICT',
          message: 'Conflict: The selected clinician already has an appointment booked during this time slot.',
          details: conflictCheck.rows[0],
        },
      });
      return;
    }

    // 2. Insert Appointment
    const insertRes = await query(
      `INSERT INTO appointments (organization_id, patient_id, clinician_id, appointment_date, start_time, end_time, status, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8)
       RETURNING *`,
      [orgId, patient_id, clinician_id, appointment_date, start_time, end_time, reason, req.user!.id]
    );

    const newAppointment = insertRes.rows[0];

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: 'APPOINTMENT_CREATE',
      resourceType: 'appointment',
      resourceId: newAppointment.id,
      ipAddress: req.ip,
      details: { clinicianId: clinician_id, date: appointment_date, time: start_time },
    });

    res.status(201).json({ success: true, data: newAppointment });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({
        success: false,
        error: { code: 'APPOINTMENT_CONFLICT', message: 'Unique slot constraint: double-booking prevented by server.' },
      });
      return;
    }
    console.error('Booking error:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PATCH /api/appointments/:id/check-in (Reception Arrival Workflow)
appointmentRouter.patch('/:id/check-in', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const appointmentId = req.params.id;

  try {
    const updateRes = await query(
      `UPDATE appointments
       SET status = 'checked_in', check_in_time = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [appointmentId, orgId]
    );

    if (updateRes.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found in this medical center.' },
      });
      return;
    }

    const updated = updateRes.rows[0];

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: 'APPOINTMENT_CHECK_IN',
      resourceType: 'appointment',
      resourceId: updated.id,
      ipAddress: req.ip,
      details: { checkInTime: updated.check_in_time },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PATCH /api/appointments/:id/status
appointmentRouter.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const appointmentId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Status must be one of: ${validStatuses.join(', ')}` },
    });
    return;
  }

  try {
    const updateRes = await query(
      `UPDATE appointments
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [status, appointmentId, orgId]
    );

    if (updateRes.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found in this medical center.' },
      });
      return;
    }

    res.json({ success: true, data: updateRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/appointments/schedules
appointmentRouter.get('/schedules', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const clinicianId = req.query.clinicianId as string;

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
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
