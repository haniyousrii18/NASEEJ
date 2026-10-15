import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/rbac.js';
import { serverError } from '../services/validation.js';

export const doctorRouter = Router();

doctorRouter.use(authenticate, requireTenant, requireRole(['doctor']));

// GET /api/doctor/overview: the doctor's own day. Today's appointments, and drafts waiting for their sign-off.
// "Pending" means only what the product tracks: draft visits, prescriptions and lab results created by this
// clinician. Nothing is inferred about patients who "need follow-up"; the product has no such concept.
const draftsSql = `SELECT * FROM (
           SELECT 'visit' AS type, v.id, v.patient_id, v.created_at, p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
             FROM visits v JOIN patient_profiles p ON p.id = v.patient_id
             WHERE v.organization_id = $1 AND v.clinician_id = $2 AND v.status = 'draft'
           UNION ALL
           SELECT 'prescription', pr.id, pr.patient_id, pr.created_at, p.full_name_ar, p.full_name_en
             FROM prescriptions pr JOIN patient_profiles p ON p.id = pr.patient_id
             WHERE pr.organization_id = $1 AND pr.clinician_id = $2 AND pr.status = 'draft'
           UNION ALL
           SELECT 'lab_result', lr.id, lo.patient_id, lr.created_at, p.full_name_ar, p.full_name_en
             FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.lab_order_id JOIN patient_profiles p ON p.id = lo.patient_id
             WHERE lr.organization_id = $1 AND lo.clinician_id = $2 AND lr.status = 'draft'
         ) d ORDER BY created_at ASC`;

// GET /api/doctor/pending: every draft this clinician still has to approve (visits, prescriptions, lab results).
doctorRouter.get('/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const drafts = await query(draftsSql, [req.tenantId!, req.user!.id]);
    res.json({ success: true, data: drafts.rows });
  } catch (err: any) {
    console.error('Doctor pending error:', err);
    res.status(500).json(serverError(err));
  }
});

doctorRouter.get('/overview', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const me = req.user!.id;
  try {
    const [appointments, drafts] = await Promise.all([
      query(
        `SELECT a.id, a.patient_id, a.status, to_char(a.start_time, 'HH24:MI') AS start_time, to_char(a.end_time, 'HH24:MI') AS end_time, a.reason,
                p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
         FROM appointments a JOIN patient_profiles p ON p.id = a.patient_id
         WHERE a.organization_id = $1 AND a.clinician_id = $2 AND a.appointment_date = CURRENT_DATE AND a.status <> 'cancelled'
         ORDER BY a.start_time`,
        [orgId, me]
      ),
      query(
        `SELECT * FROM (
           SELECT 'visit' AS type, v.id, v.patient_id, v.created_at, p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
             FROM visits v JOIN patient_profiles p ON p.id = v.patient_id
             WHERE v.organization_id = $1 AND v.clinician_id = $2 AND v.status = 'draft'
           UNION ALL
           SELECT 'prescription', pr.id, pr.patient_id, pr.created_at, p.full_name_ar, p.full_name_en
             FROM prescriptions pr JOIN patient_profiles p ON p.id = pr.patient_id
             WHERE pr.organization_id = $1 AND pr.clinician_id = $2 AND pr.status = 'draft'
           UNION ALL
           SELECT 'lab_result', lr.id, lo.patient_id, lr.created_at, p.full_name_ar, p.full_name_en
             FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.lab_order_id JOIN patient_profiles p ON p.id = lo.patient_id
             WHERE lr.organization_id = $1 AND lo.clinician_id = $2 AND lr.status = 'draft'
         ) d ORDER BY created_at ASC`,
        [orgId, me]
      ),
    ]);

    const counts = { visit: 0, prescription: 0, lab_result: 0 } as Record<string, number>;
    for (const d of drafts.rows) counts[d.type] += 1;

    res.json({
      success: true,
      data: {
        today: appointments.rows,
        waitingCount: appointments.rows.filter((a) => a.status === 'checked_in').length,
        pendingSignOff: { counts, total: drafts.rows.length, items: drafts.rows.slice(0, 8) },
      },
    });
  } catch (err: any) {
    console.error('Doctor overview error:', err);
    res.status(500).json(serverError(err));
  }
});
