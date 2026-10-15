import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/rbac.js';
import { apiError, isIsoDate, serverError } from '../services/validation.js';

/**
 * Center operations for the center manager: aggregates about schedules, staff and workload.
 * Nothing in this router returns an individual patient or any clinical content; managers see counts,
 * not records, even for patients registered at their own center.
 */
export const centerRouter = Router();

centerRouter.use(authenticate, requireTenant, requireRole(['center_manager']));

// GET /api/center/overview
centerRouter.get('/overview', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  try {
    const [today, upcoming, perClinician, staff, patients, coordination] = await Promise.all([
      query(`SELECT status, count(*)::int AS count FROM appointments WHERE organization_id = $1 AND appointment_date = CURRENT_DATE GROUP BY status`, [orgId]),
      query(
        `SELECT count(*)::int AS count FROM appointments
         WHERE organization_id = $1 AND appointment_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 AND status <> 'cancelled'`,
        [orgId]
      ),
      query(
        `SELECT u.id AS clinician_id, u.full_name_ar, u.full_name_en, count(*)::int AS count
         FROM appointments a JOIN users u ON u.id = a.clinician_id
         WHERE a.organization_id = $1 AND a.appointment_date = CURRENT_DATE AND a.status <> 'cancelled'
         GROUP BY u.id, u.full_name_ar, u.full_name_en ORDER BY count DESC, u.full_name_en`,
        [orgId]
      ),
      query(`SELECT role, count(*)::int AS count FROM organization_memberships WHERE organization_id = $1 AND status = 'active' GROUP BY role`, [orgId]),
      query(`SELECT count(*)::int AS count FROM patient_center_links WHERE organization_id = $1 AND status = 'active'`, [orgId]),
      query(
        `SELECT (SELECT count(*)::int FROM care_cases WHERE organization_id = $1 AND status = 'open') AS open_cases,
                (SELECT count(*)::int FROM care_tasks WHERE organization_id = $1 AND status IN ('open','in_progress') AND due_date < CURRENT_DATE) AS overdue_tasks`,
        [orgId]
      ),
    ]);

    const byStatus: Record<string, number> = {};
    for (const r of today.rows) byStatus[r.status] = r.count;

    res.json({
      success: true,
      data: {
        appointmentsToday: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
        appointmentsNext7Days: upcoming.rows[0].count,
        clinicianLoadToday: perClinician.rows,
        activeStaffByRole: Object.fromEntries(staff.rows.map((r) => [r.role, r.count])),
        registeredPatients: patients.rows[0].count,
        coordination: { openCases: coordination.rows[0].open_cases, overdueTasks: coordination.rows[0].overdue_tasks },
      },
    });
  } catch (err: any) {
    console.error('Center overview error:', err);
    res.status(500).json(serverError(err));
  }
});

// GET /api/center/reports/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days, at most 92)
centerRouter.get('/reports/appointments', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
  const from = (req.query.from as string) || new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);

  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'from and to must be YYYY-MM-DD dates with from on or before to.'));
    return;
  }
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 92) {
    res.status(400).json(apiError('RANGE_TOO_LARGE', 'Reports cover at most 93 days.'));
    return;
  }

  try {
    const [daily, byClinician, booked, capacity] = await Promise.all([
      query(
        `SELECT to_char(appointment_date, 'YYYY-MM-DD') AS date, status, count(*)::int AS count
         FROM appointments WHERE organization_id = $1 AND appointment_date BETWEEN $2 AND $3
         GROUP BY appointment_date, status ORDER BY appointment_date`,
        [orgId, from, to]
      ),
      query(
        `SELECT u.id AS clinician_id, u.full_name_ar, u.full_name_en,
                count(*)::int AS total,
                count(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                count(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a JOIN users u ON u.id = a.clinician_id
         WHERE a.organization_id = $1 AND a.appointment_date BETWEEN $2 AND $3
         GROUP BY u.id, u.full_name_ar, u.full_name_en ORDER BY total DESC, u.full_name_en`,
        [orgId, from, to]
      ),
      query(
        `SELECT clinician_id, COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60), 0)::int AS booked_minutes
         FROM appointments WHERE organization_id = $1 AND appointment_date BETWEEN $2 AND $3 AND status <> 'cancelled'
         GROUP BY clinician_id`,
        [orgId, from, to]
      ),
      query(
        `WITH days AS (SELECT d::date AS day, EXTRACT(DOW FROM d)::int AS dow FROM generate_series($2::date, $3::date, '1 day') d)
         SELECT s.clinician_id, COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60), 0)::int AS capacity_minutes
         FROM days JOIN clinician_schedules s ON s.day_of_week = days.dow AND s.organization_id = $1 AND s.is_active = true
         GROUP BY s.clinician_id`,
        [orgId, from, to]
      ),
    ]);

    const bookedBy = new Map(booked.rows.map((r) => [r.clinician_id, r.booked_minutes as number]));
    const capacityBy = new Map(capacity.rows.map((r) => [r.clinician_id, r.capacity_minutes as number]));

    res.json({
      success: true,
      data: {
        range: { from, to },
        daily: daily.rows,
        byClinician: byClinician.rows.map((r) => {
          const cap = capacityBy.get(r.clinician_id) ?? 0;
          const used = bookedBy.get(r.clinician_id) ?? 0;
          return { ...r, bookedMinutes: used, capacityMinutes: cap, utilizationPercent: cap > 0 ? Math.round((used / cap) * 100) : null };
        }),
      },
    });
  } catch (err: any) {
    console.error('Appointment report error:', err);
    res.status(500).json(serverError(err));
  }
});

// GET /api/center/specialties: what the center's active doctors cover (derived; the product has no separate service catalogue)
centerRouter.get('/specialties', async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await query(
      `SELECT specialty_ar, specialty_en, count(*)::int AS doctors FROM organization_memberships
       WHERE organization_id = $1 AND role = 'doctor' AND status = 'active'
       GROUP BY specialty_ar, specialty_en ORDER BY doctors DESC, specialty_en`,
      [req.tenantId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});
