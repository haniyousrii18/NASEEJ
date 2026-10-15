import { Router, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { hasEffectiveConsent, isPatientLinkedToOrg } from '../services/accessService.js';
import { apiError, clampInt, isIsoDate, isUuid, serverError, trimmed } from '../services/validation.js';

/**
 * Care coordination: operational follow-up only (cases, tasks, referral tracking, a follow-up log).
 * Nothing here stores or returns clinical content, so a coordinator can work a case without ever reading a
 * diagnosis, note, medication or result. Those stay behind the clinical routes, which refuse this role.
 */
export const coordinationRouter = Router();

coordinationRouter.use(authenticate, requireTenant, requireRole(['care_coordinator', 'center_manager']));

const coordinatorOnly = requireRole(['care_coordinator']);
const isManager = (req: Request) => req.currentMembership?.role === 'center_manager';

type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['open', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};
const TASK_TYPES = ['missing_document', 'appointment_coordination', 'referral_handoff', 'other'];

async function logFollowup(
  client: PoolClient | null,
  e: { orgId: string; caseId: string; taskId?: string; referralId?: string; actorId: string; event: string; note?: string | null; details?: Record<string, unknown> }
) {
  const run = client ? client.query.bind(client) : query;
  await run(
    `INSERT INTO care_followup_log (organization_id, case_id, task_id, referral_id, actor_id, event_type, note, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.orgId, e.caseId, e.taskId ?? null, e.referralId ?? null, e.actorId, e.event, e.note ?? null, JSON.stringify(e.details ?? {})]
  );
}

/** SQL fragment limiting cases to what the caller may see: a coordinator's own cases, or every case in the center for a manager. */
function caseScope(req: Request, params: unknown[], alias = 'c'): string {
  params.push(req.tenantId);
  let sql = `${alias}.organization_id = $${params.length}`;
  if (!isManager(req)) {
    params.push(req.user!.id);
    sql += ` AND ${alias}.coordinator_id = $${params.length}`;
  }
  return sql;
}

const CASE_SELECT = `
  c.id, c.organization_id, c.patient_id, c.coordinator_id, c.reason, c.status, c.version, c.created_at, c.updated_at, c.closed_at,
  p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en, p.phone AS patient_phone, l.mrn,
  cu.full_name_ar AS coordinator_name_ar, cu.full_name_en AS coordinator_name_en,
  (SELECT count(*) FROM care_tasks t WHERE t.case_id = c.id AND t.status IN ('open','in_progress')) AS open_tasks,
  (SELECT row_to_json(n) FROM (
      SELECT to_char(a.appointment_date, 'YYYY-MM-DD') AS date, to_char(a.start_time, 'HH24:MI') AS start_time, a.status,
             cl.full_name_ar AS clinician_name_ar, cl.full_name_en AS clinician_name_en
      FROM appointments a JOIN users cl ON cl.id = a.clinician_id
      WHERE a.patient_id = c.patient_id AND a.organization_id = c.organization_id
        AND a.appointment_date >= CURRENT_DATE AND a.status NOT IN ('cancelled', 'completed')
      ORDER BY a.appointment_date, a.start_time LIMIT 1) n) AS next_appointment`;

const CASE_FROM = `
  FROM care_cases c
  JOIN patient_profiles p ON p.id = c.patient_id
  JOIN patient_center_links l ON l.patient_id = c.patient_id AND l.organization_id = c.organization_id
  JOIN users cu ON cu.id = c.coordinator_id`;

async function activeCoordinator(userId: string, orgId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.user_id = $1 AND m.organization_id = $2 AND m.role = 'care_coordinator' AND m.status = 'active' AND u.is_active = true`,
    [userId, orgId]
  );
  return (r.rowCount ?? 0) > 0;
}

async function loadCase(req: Request, caseId: string) {
  if (!isUuid(caseId)) return null;
  const params: unknown[] = [];
  const scope = caseScope(req, params);
  params.push(caseId);
  const r = await query(`SELECT ${CASE_SELECT} ${CASE_FROM} WHERE ${scope} AND c.id = $${params.length}`, params);
  return r.rows[0] ?? null;
}

const staleOrMissing = (res: Response, current: { version: number } | null, what: string) => {
  if (!current) res.status(404).json(apiError(`${what.toUpperCase()}_NOT_FOUND`, `${what} not found.`));
  else res.status(409).json(apiError('STALE_VERSION', `This ${what.toLowerCase()} changed since you loaded it. Reload and try again.`, { currentVersion: current.version }));
};

// ---------------------------------------------------------------------------------------------- dashboard
// GET /api/coordination/dashboard (coordinator): what needs doing, by owner, status and due date
coordinationRouter.get('/dashboard', coordinatorOnly, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const me = req.user!.id;
  try {
    const [counts, upcoming, referrals, incoming, recent] = await Promise.all([
      query(
        `SELECT
           (SELECT count(*) FROM care_cases WHERE organization_id = $1 AND coordinator_id = $2 AND status = 'open') AS open_cases,
           count(*) FILTER (WHERE t.status IN ('open','in_progress')) AS active_tasks,
           count(*) FILTER (WHERE t.status IN ('open','in_progress') AND t.due_date < CURRENT_DATE) AS overdue_tasks,
           count(*) FILTER (WHERE t.status IN ('open','in_progress') AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3) AS due_soon
         FROM care_tasks t JOIN care_cases c ON c.id = t.case_id
         WHERE t.organization_id = $1 AND (t.owner_id = $2 OR c.coordinator_id = $2)`,
        [orgId, me]
      ),
      query(
        `SELECT t.id, t.title, t.task_type, t.status, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.case_id, c.reason AS case_reason,
                p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en,
                (t.due_date < CURRENT_DATE) AS is_overdue
         FROM care_tasks t JOIN care_cases c ON c.id = t.case_id JOIN patient_profiles p ON p.id = c.patient_id
         WHERE t.organization_id = $1 AND (t.owner_id = $2 OR c.coordinator_id = $2) AND t.status IN ('open','in_progress')
         ORDER BY t.due_date NULLS LAST, t.created_at LIMIT 8`,
        [orgId, me]
      ),
      query(
        `SELECT count(*) AS pending FROM care_referrals r JOIN care_cases c ON c.id = r.case_id
         WHERE r.organization_id = $1 AND c.coordinator_id = $2 AND r.status IN ('requested','sent')`,
        [orgId, me]
      ),
      query(
        `SELECT count(*) AS awaiting FROM care_referrals r JOIN care_cases c ON c.id = r.case_id
         WHERE r.to_organization_id = $1 AND r.status = 'sent'
           AND EXISTS (SELECT 1 FROM patient_consents pc WHERE pc.patient_id = c.patient_id AND pc.from_organization_id = r.organization_id
                         AND pc.to_organization_id = r.to_organization_id AND pc.status = 'active' AND pc.revoked_at IS NULL AND pc.expires_at > NOW())`,
        [orgId]
      ),
      query(
        `SELECT f.id, f.event_type, f.note, f.created_at, f.case_id, u.full_name_ar AS actor_name_ar, u.full_name_en AS actor_name_en
         FROM care_followup_log f JOIN care_cases c ON c.id = f.case_id JOIN users u ON u.id = f.actor_id
         WHERE f.organization_id = $1 AND c.coordinator_id = $2 ORDER BY f.created_at DESC LIMIT 6`,
        [orgId, me]
      ),
    ]);

    const c = counts.rows[0];
    res.json({
      success: true,
      data: {
        openCases: Number(c.open_cases),
        activeTasks: Number(c.active_tasks),
        overdueTasks: Number(c.overdue_tasks),
        dueSoonTasks: Number(c.due_soon),
        pendingOutgoingReferrals: Number(referrals.rows[0].pending),
        incomingReferralsAwaitingReceipt: Number(incoming.rows[0].awaiting),
        upcomingTasks: upcoming.rows,
        recentFollowups: recent.rows,
      },
    });
  } catch (err: any) {
    console.error('Coordination dashboard error:', err);
    res.status(500).json(serverError(err));
  }
});

// GET /api/coordination/coordinators: the center's active coordinators (names only), for assignment pickers
coordinationRouter.get('/coordinators', async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await query(
      `SELECT u.id AS user_id, u.full_name_ar, u.full_name_en FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.role = 'care_coordinator' AND m.status = 'active' AND u.is_active = true ORDER BY u.full_name_en`,
      [req.tenantId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/coordination/destinations: the other active medical centers a referral can be addressed to (names only)
coordinationRouter.get('/destinations', async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await query(`SELECT id, name_ar, name_en FROM organizations WHERE status = 'active' AND id <> $1 ORDER BY name_en`, [req.tenantId]);
    res.json({ success: true, data: r.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/coordination/patients?search=: identity-level lookup (name, MRN) to open a case. No contact, no clinical data.
coordinationRouter.get('/patients', async (req: Request, res: Response): Promise<void> => {
  const search = trimmed(req.query.search, 100);
  if (!search || search.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }
  try {
    const r = await query(
      `SELECT p.id, p.full_name_ar, p.full_name_en, l.mrn
       FROM patient_profiles p JOIN patient_center_links l ON l.patient_id = p.id
       WHERE l.organization_id = $1 AND l.status = 'active'
         AND (LOWER(p.full_name_ar) LIKE $2 OR LOWER(p.full_name_en) LIKE $2 OR LOWER(l.mrn) LIKE $2)
       ORDER BY p.full_name_en LIMIT 20`,
      [req.tenantId, `%${search.toLowerCase()}%`]
    );
    res.json({ success: true, data: r.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// ---------------------------------------------------------------------------------------------- cases
// GET /api/coordination/cases?status=open|closed|all
coordinationRouter.get('/cases', async (req: Request, res: Response): Promise<void> => {
  const status = (req.query.status as string) || 'open';
  if (!['open', 'closed', 'all'].includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'status must be open, closed or all.'));
    return;
  }
  try {
    const params: unknown[] = [];
    let where = caseScope(req, params);
    if (status !== 'all') {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }
    params.push(clampInt(req.query.limit, 100, 1, 200));
    const r = await query(`SELECT ${CASE_SELECT} ${CASE_FROM} WHERE ${where} ORDER BY c.created_at DESC LIMIT $${params.length}`, params);
    res.json({ success: true, data: r.rows.map((x) => ({ ...x, open_tasks: Number(x.open_tasks) })) });
  } catch (err: any) {
    console.error('List cases error:', err);
    res.status(500).json(serverError(err));
  }
});

// POST /api/coordination/cases { patient_id, reason, coordinator_id? }
coordinationRouter.post('/cases', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { patient_id, coordinator_id } = req.body || {};
  const reason = trimmed(req.body?.reason, 500);

  if (!isUuid(patient_id) || !reason) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'patient_id and a reason (at most 500 characters) are required.'));
    return;
  }
  // A coordinator opens cases for themselves; a manager assigns one of the center's coordinators.
  const assignee = isManager(req) ? coordinator_id : req.user!.id;
  if (!isUuid(assignee) || !(await activeCoordinator(assignee, orgId))) {
    res.status(400).json(apiError('INVALID_COORDINATOR', 'Choose an active care coordinator of this medical center.'));
    return;
  }

  try {
    if (!(await isPatientLinkedToOrg(patient_id, orgId))) {
      res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
      return;
    }

    const created = await withTransaction(async (client) => {
      const insert = await client.query(
        `INSERT INTO care_cases (organization_id, patient_id, coordinator_id, reason, opened_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orgId, patient_id, assignee, reason, req.user!.id]
      );
      await logFollowup(client, { orgId, caseId: insert.rows[0].id, actorId: req.user!.id, event: 'case_opened', note: reason });
      return insert.rows[0].id as string;
    });

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: 'CARE_CASE_OPEN',
      resourceType: 'care_case',
      resourceId: created,
      ipAddress: req.ip,
      details: { caseId: created, patientId: patient_id },
    });

    const row = (await query(`SELECT ${CASE_SELECT} ${CASE_FROM} WHERE c.id = $1`, [created])).rows[0];
    res.status(201).json({ success: true, data: { ...row, open_tasks: Number(row.open_tasks) } });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('CASE_EXISTS', 'This coordinator already follows an open case for this patient.'));
      return;
    }
    console.error('Open case error:', err);
    res.status(500).json(serverError(err));
  }
});

// GET /api/coordination/cases/:id (case, its tasks, referrals and follow-up log)
coordinationRouter.get('/cases/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const c = await loadCase(req, req.params.id);
    if (!c) {
      res.status(404).json(apiError('CASE_NOT_FOUND', 'Case not found.'));
      return;
    }
    const [tasks, referrals, log] = await Promise.all([
      query(
        `SELECT t.id, t.title, t.details, t.task_type, t.status, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.completion_note, t.completed_at,
                t.owner_id, t.version, t.created_at, ou.full_name_ar AS owner_name_ar, ou.full_name_en AS owner_name_en,
                (t.status IN ('open','in_progress') AND t.due_date < CURRENT_DATE) AS is_overdue
         FROM care_tasks t JOIN users ou ON ou.id = t.owner_id WHERE t.case_id = $1 ORDER BY t.created_at DESC`,
        [c.id]
      ),
      query(
        `SELECT r.id, r.status, r.reason, r.version, r.created_at, r.sent_at, r.receipt_confirmed_at,
                r.to_organization_id, o.name_ar AS to_name_ar, o.name_en AS to_name_en
         FROM care_referrals r JOIN organizations o ON o.id = r.to_organization_id WHERE r.case_id = $1 ORDER BY r.created_at DESC`,
        [c.id]
      ),
      query(
        `SELECT f.id, f.event_type, f.note, f.created_at, f.task_id, f.referral_id, u.full_name_ar AS actor_name_ar, u.full_name_en AS actor_name_en
         FROM care_followup_log f JOIN users u ON u.id = f.actor_id WHERE f.case_id = $1 ORDER BY f.created_at DESC LIMIT 100`,
        [c.id]
      ),
    ]);
    res.json({ success: true, data: { ...c, open_tasks: Number(c.open_tasks), tasks: tasks.rows, referrals: referrals.rows, followups: log.rows } });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/coordination/cases/:id { action: 'close' | 'reassign', coordinator_id?, version }
coordinationRouter.patch('/cases/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { action, coordinator_id, version } = req.body || {};
  if (!['close', 'reassign'].includes(action) || !Number.isInteger(version)) {
    res.status(400).json(apiError('VALIDATION_ERROR', "action ('close' or 'reassign') and the version you loaded are required."));
    return;
  }
  if (action === 'reassign' && !isManager(req)) {
    res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only a Center Manager can reassign a case.'));
    return;
  }
  if (action === 'reassign' && (!isUuid(coordinator_id) || !(await activeCoordinator(coordinator_id, orgId)))) {
    res.status(400).json(apiError('INVALID_COORDINATOR', 'Choose an active care coordinator of this medical center.'));
    return;
  }

  try {
    const existing = await loadCase(req, req.params.id);
    if (!existing) return staleOrMissing(res, null, 'Case');
    if (existing.status === 'closed') {
      res.status(409).json(apiError('CASE_CLOSED', 'This case is already closed.'));
      return;
    }

    const outcome = await withTransaction(async (client) => {
      if (action === 'close') {
        const open = await client.query(`SELECT count(*) FROM care_tasks WHERE case_id = $1 AND status IN ('open','in_progress')`, [existing.id]);
        if (Number(open.rows[0].count) > 0) return { openTasks: true as const };
      }
      const update =
        action === 'close'
          ? await client.query(
              `UPDATE care_cases SET status = 'closed', closed_at = NOW(), version = version + 1, updated_at = NOW()
               WHERE id = $1 AND organization_id = $2 AND version = $3 RETURNING id, version`,
              [existing.id, orgId, version]
            )
          : await client.query(
              `UPDATE care_cases SET coordinator_id = $4, version = version + 1, updated_at = NOW()
               WHERE id = $1 AND organization_id = $2 AND version = $3 RETURNING id, version`,
              [existing.id, orgId, version, coordinator_id]
            );
      if (update.rowCount === 0) return { stale: true as const };
      await logFollowup(client, {
        orgId,
        caseId: existing.id,
        actorId: req.user!.id,
        event: action === 'close' ? 'case_closed' : 'case_reassigned',
        details: action === 'reassign' ? { to: coordinator_id } : {},
      });
      return { ok: true as const };
    });

    if ('openTasks' in outcome) {
      res.status(409).json(apiError('OPEN_TASKS_REMAIN', 'Finish or cancel the open tasks before closing the case.'));
      return;
    }
    if ('stale' in outcome) return staleOrMissing(res, existing, 'Case');

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: action === 'close' ? 'CARE_CASE_CLOSE' : 'CARE_CASE_REASSIGN',
      resourceType: 'care_case',
      resourceId: existing.id,
      ipAddress: req.ip,
      details: { caseId: existing.id },
    });

    const row = await loadCase(req, existing.id);
    res.json({ success: true, data: row ? { ...row, open_tasks: Number(row.open_tasks) } : { id: existing.id } });
  } catch (err: any) {
    console.error('Update case error:', err);
    res.status(500).json(serverError(err));
  }
});

// ---------------------------------------------------------------------------------------------- tasks
// GET /api/coordination/tasks?status=active|done|cancelled|all&overdue=1&caseId=
coordinationRouter.get('/tasks', async (req: Request, res: Response): Promise<void> => {
  const status = (req.query.status as string) || 'active';
  if (!['active', 'done', 'cancelled', 'all'].includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'status must be active, done, cancelled or all.'));
    return;
  }
  if (req.query.caseId && !isUuid(req.query.caseId)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'caseId must be a valid identifier.'));
    return;
  }
  try {
    const params: unknown[] = [req.tenantId];
    let where = 't.organization_id = $1';
    if (!isManager(req)) {
      params.push(req.user!.id);
      where += ` AND (t.owner_id = $${params.length} OR c.coordinator_id = $${params.length})`;
    }
    if (status === 'active') where += ` AND t.status IN ('open','in_progress')`;
    else if (status !== 'all') {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }
    if (req.query.overdue === '1') where += ` AND t.status IN ('open','in_progress') AND t.due_date < CURRENT_DATE`;
    if (req.query.caseId) {
      params.push(req.query.caseId);
      where += ` AND t.case_id = $${params.length}`;
    }
    params.push(clampInt(req.query.limit, 100, 1, 200));
    const r = await query(
      `SELECT t.id, t.case_id, t.title, t.details, t.task_type, t.status, to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
              t.completion_note, t.completed_at, t.owner_id, t.version, t.created_at,
              ou.full_name_ar AS owner_name_ar, ou.full_name_en AS owner_name_en,
              p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en,
              (t.status IN ('open','in_progress') AND t.due_date < CURRENT_DATE) AS is_overdue
       FROM care_tasks t JOIN care_cases c ON c.id = t.case_id JOIN patient_profiles p ON p.id = c.patient_id JOIN users ou ON ou.id = t.owner_id
       WHERE ${where} ORDER BY (t.status IN ('done','cancelled')), t.due_date NULLS LAST, t.created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ success: true, data: r.rows });
  } catch (err: any) {
    console.error('List tasks error:', err);
    res.status(500).json(serverError(err));
  }
});

// POST /api/coordination/tasks { case_id, title, details?, task_type?, due_date?, owner_id? }
coordinationRouter.post('/tasks', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { case_id, task_type, due_date, owner_id } = req.body || {};
  const title = trimmed(req.body?.title, 200);
  const details = req.body?.details == null || req.body.details === '' ? null : trimmed(req.body.details, 1000);

  if (!isUuid(case_id) || !title || (req.body?.details && !details)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'case_id and a title (at most 200 characters) are required; details are limited to 1000 characters.'));
    return;
  }
  if (task_type !== undefined && !TASK_TYPES.includes(task_type)) {
    res.status(400).json(apiError('VALIDATION_ERROR', `task_type must be one of: ${TASK_TYPES.join(', ')}.`));
    return;
  }
  if (due_date !== undefined && due_date !== null && !isIsoDate(due_date)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'due_date must use the YYYY-MM-DD format.'));
    return;
  }

  try {
    const c = await loadCase(req, case_id);
    if (!c) return staleOrMissing(res, null, 'Case');
    if (c.status !== 'open') {
      res.status(409).json(apiError('CASE_CLOSED', 'Tasks can only be added to an open case.'));
      return;
    }
    const owner = owner_id ?? (isManager(req) ? c.coordinator_id : req.user!.id);
    if (!isUuid(owner) || !(await activeCoordinator(owner, orgId))) {
      res.status(400).json(apiError('INVALID_COORDINATOR', 'The task owner must be an active care coordinator of this medical center.'));
      return;
    }

    const taskId = await withTransaction(async (client) => {
      const insert = await client.query(
        `INSERT INTO care_tasks (organization_id, case_id, title, details, task_type, owner_id, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [orgId, case_id, title, details, task_type || 'other', owner, due_date || null, req.user!.id]
      );
      await logFollowup(client, { orgId, caseId: case_id, taskId: insert.rows[0].id, actorId: req.user!.id, event: 'task_created', note: title });
      return insert.rows[0].id as string;
    });

    const row = (
      await query(
        `SELECT t.id, t.case_id, t.title, t.details, t.task_type, t.status, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.owner_id, t.version, t.created_at
         FROM care_tasks t WHERE t.id = $1`,
        [taskId]
      )
    ).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err: any) {
    console.error('Create task error:', err);
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/coordination/tasks/:id { status?, completion_note?, due_date?, version }
coordinationRouter.patch('/tasks/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { status, due_date, version } = req.body || {};
  const note = req.body?.completion_note == null ? null : trimmed(req.body.completion_note, 1000);

  if (!isUuid(req.params.id) || !Number.isInteger(version)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A task id and the version you loaded are required.'));
    return;
  }
  if (status !== undefined && !['open', 'in_progress', 'done', 'cancelled'].includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'status must be open, in_progress, done or cancelled.'));
    return;
  }
  if (due_date !== undefined && due_date !== null && !isIsoDate(due_date)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'due_date must use the YYYY-MM-DD format.'));
    return;
  }
  if (status === 'done' && !note) {
    res.status(400).json(apiError('COMPLETION_NOTE_REQUIRED', 'A completion note is required to mark a task done.'));
    return;
  }
  if (status === undefined && due_date === undefined) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Provide a status and/or a due_date.'));
    return;
  }

  try {
    const found = await query(
      `SELECT t.id, t.status, t.version, t.owner_id, t.case_id, c.coordinator_id FROM care_tasks t JOIN care_cases c ON c.id = t.case_id
       WHERE t.id = $1 AND t.organization_id = $2`,
      [req.params.id, orgId]
    );
    const task = found.rows[0];
    const allowed = task && (isManager(req) || task.owner_id === req.user!.id || task.coordinator_id === req.user!.id);
    if (!allowed) return staleOrMissing(res, null, 'Task');

    if (['done', 'cancelled'].includes(task.status)) {
      res.status(409).json(apiError('TASK_FINISHED', 'A finished task cannot be changed.'));
      return;
    }
    if (status !== undefined && status !== task.status && !TASK_TRANSITIONS[task.status as TaskStatus].includes(status)) {
      res.status(409).json(apiError('INVALID_TRANSITION', `A task that is "${task.status}" cannot become "${status}".`));
      return;
    }

    const changed = await withTransaction(async (client) => {
      const next = status ?? task.status;
      const update = await client.query(
        `UPDATE care_tasks SET status = $1::varchar, due_date = COALESCE($2::date, due_date),
                completion_note = CASE WHEN $1::varchar IN ('done','cancelled') THEN COALESCE($3::varchar, completion_note) ELSE completion_note END,
                completed_at = CASE WHEN $1::varchar = 'done' THEN NOW() ELSE completed_at END,
                version = version + 1, updated_at = NOW()
         WHERE id = $4 AND organization_id = $5 AND version = $6 RETURNING id`,
        [next, due_date ?? null, note, task.id, orgId, version]
      );
      if (update.rowCount === 0) return false;
      await logFollowup(client, {
        orgId,
        caseId: task.case_id,
        taskId: task.id,
        actorId: req.user!.id,
        event: next === 'done' ? 'task_completed' : next !== task.status ? 'task_status_changed' : 'task_updated',
        note,
        details: { from: task.status, to: next },
      });
      return true;
    });
    if (!changed) return staleOrMissing(res, { version: task.version }, 'Task');

    const row = (
      await query(
        `SELECT t.id, t.case_id, t.title, t.status, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.completion_note, t.completed_at, t.owner_id, t.version
         FROM care_tasks t WHERE t.id = $1`,
        [task.id]
      )
    ).rows[0];
    res.json({ success: true, data: row });
  } catch (err: any) {
    console.error('Update task error:', err);
    res.status(500).json(serverError(err));
  }
});

// ---------------------------------------------------------------------------------------------- referrals
// GET /api/coordination/referrals?direction=outgoing|incoming
// Incoming referrals reveal a patient to another center, so they are listed only while the patient's consent
// from the sending center to this one is effective, and only with name, reason and status (no contact, no MRN).
coordinationRouter.get('/referrals', async (req: Request, res: Response): Promise<void> => {
  const direction = (req.query.direction as string) || 'outgoing';
  if (!['outgoing', 'incoming'].includes(direction)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'direction must be outgoing or incoming.'));
    return;
  }
  try {
    if (direction === 'outgoing') {
      const params: unknown[] = [];
      const scope = caseScope(req, params);
      const r = await query(
        `SELECT r.id, r.case_id, r.status, r.reason, r.version, r.created_at, r.sent_at, r.receipt_confirmed_at,
                r.to_organization_id, o.name_ar AS other_name_ar, o.name_en AS other_name_en,
                p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en,
                EXISTS (SELECT 1 FROM patient_consents pc WHERE pc.patient_id = c.patient_id AND pc.from_organization_id = r.organization_id
                          AND pc.to_organization_id = r.to_organization_id AND pc.status = 'active' AND pc.revoked_at IS NULL AND pc.expires_at > NOW()) AS consent_effective
         FROM care_referrals r JOIN care_cases c ON c.id = r.case_id JOIN patient_profiles p ON p.id = c.patient_id
         JOIN organizations o ON o.id = r.to_organization_id
         WHERE ${scope} ORDER BY r.created_at DESC LIMIT 100`,
        params
      );
      res.json({ success: true, data: r.rows });
      return;
    }

    const r = await query(
      `SELECT r.id, r.status, r.reason, r.version, r.created_at, r.sent_at, r.receipt_confirmed_at,
              r.organization_id AS from_organization_id, o.name_ar AS other_name_ar, o.name_en AS other_name_en,
              p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
       FROM care_referrals r JOIN care_cases c ON c.id = r.case_id JOIN patient_profiles p ON p.id = c.patient_id
       JOIN organizations o ON o.id = r.organization_id
       WHERE r.to_organization_id = $1 AND r.status IN ('sent','receipt_confirmed')
         AND EXISTS (SELECT 1 FROM patient_consents pc WHERE pc.patient_id = c.patient_id AND pc.from_organization_id = r.organization_id
                       AND pc.to_organization_id = r.to_organization_id AND pc.status = 'active' AND pc.revoked_at IS NULL AND pc.expires_at > NOW())
       ORDER BY r.created_at DESC LIMIT 100`,
      [req.tenantId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err: any) {
    console.error('List referrals error:', err);
    res.status(500).json(serverError(err));
  }
});

// POST /api/coordination/referrals { case_id, to_organization_id, reason }
coordinationRouter.post('/referrals', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { case_id, to_organization_id } = req.body || {};
  const reason = trimmed(req.body?.reason, 500);

  if (!isUuid(case_id) || !isUuid(to_organization_id) || to_organization_id === orgId || !reason) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'case_id, a different destination center and a reason (at most 500 characters) are required.'));
    return;
  }
  try {
    const c = await loadCase(req, case_id);
    if (!c) return staleOrMissing(res, null, 'Case');
    if (c.status !== 'open') {
      res.status(409).json(apiError('CASE_CLOSED', 'Referrals can only be added to an open case.'));
      return;
    }
    const dest = await query(`SELECT 1 FROM organizations WHERE id = $1 AND status = 'active'`, [to_organization_id]);
    if (dest.rowCount === 0) {
      res.status(404).json(apiError('ORGANIZATION_NOT_FOUND', 'Destination medical center not found.'));
      return;
    }

    const id = await withTransaction(async (client) => {
      const insert = await client.query(
        `INSERT INTO care_referrals (organization_id, to_organization_id, case_id, reason, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orgId, to_organization_id, case_id, reason, req.user!.id]
      );
      await logFollowup(client, { orgId, caseId: case_id, referralId: insert.rows[0].id, actorId: req.user!.id, event: 'referral_created', note: reason });
      return insert.rows[0].id as string;
    });

    res.status(201).json({ success: true, data: { id, status: 'requested', version: 1 } });
  } catch (err: any) {
    console.error('Create referral error:', err);
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/coordination/referrals/:id { action: 'send' | 'cancel' | 'confirm_receipt', version }
// Sending requires the patient's effective consent. Confirming receipt records that the information arrived;
// it never marks the referral clinically complete, and no status here implies that care happened.
coordinationRouter.patch('/referrals/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const { action, version } = req.body || {};
  if (!isUuid(req.params.id) || !['send', 'cancel', 'confirm_receipt'].includes(action) || !Number.isInteger(version)) {
    res.status(400).json(apiError('VALIDATION_ERROR', "A referral id, an action ('send', 'cancel', 'confirm_receipt') and the version you loaded are required."));
    return;
  }

  try {
    const found = await query(
      `SELECT r.id, r.status, r.version, r.organization_id, r.to_organization_id, r.case_id, c.patient_id, c.coordinator_id
       FROM care_referrals r JOIN care_cases c ON c.id = r.case_id WHERE r.id = $1`,
      [req.params.id]
    );
    const ref = found.rows[0];
    const isOrigin = ref && ref.organization_id === orgId;
    const isDestination = ref && ref.to_organization_id === orgId;
    // Origin side: the case's coordinator (or a manager). Destination side: any coordinator or manager of that center.
    const originAllowed = isOrigin && (isManager(req) || ref.coordinator_id === req.user!.id);
    if (!ref || (!originAllowed && !isDestination)) return staleOrMissing(res, null, 'Referral');

    if (action === 'confirm_receipt' ? !isDestination : !originAllowed) {
      res.status(403).json(apiError('FORBIDDEN_ROLE', 'This action belongs to the other medical center.'));
      return;
    }

    const rule: Record<string, { from: string[]; to: string }> = {
      send: { from: ['requested'], to: 'sent' },
      cancel: { from: ['requested', 'sent'], to: 'cancelled' },
      confirm_receipt: { from: ['sent'], to: 'receipt_confirmed' },
    };
    if (!rule[action].from.includes(ref.status)) {
      res.status(409).json(apiError('INVALID_TRANSITION', `A referral that is "${ref.status}" cannot be ${action.replace('_', ' ')}ed.`));
      return;
    }
    if ((action === 'send' || action === 'confirm_receipt') && !(await hasEffectiveConsent(ref.patient_id, ref.organization_id, ref.to_organization_id))) {
      res.status(409).json(apiError('CONSENT_REQUIRED', "The patient's consent to share between these centers is missing, revoked or expired."));
      return;
    }

    const changed = await withTransaction(async (client) => {
      const update = await client.query(
        `UPDATE care_referrals SET status = $1::varchar,
                sent_at = CASE WHEN $1::varchar = 'sent' THEN NOW() ELSE sent_at END,
                receipt_confirmed_at = CASE WHEN $1::varchar = 'receipt_confirmed' THEN NOW() ELSE receipt_confirmed_at END,
                receipt_confirmed_by = CASE WHEN $1::varchar = 'receipt_confirmed' THEN $4::uuid ELSE receipt_confirmed_by END,
                version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3 RETURNING id`,
        [rule[action].to, ref.id, version, req.user!.id]
      );
      if (update.rowCount === 0) return false;
      await logFollowup(client, {
        orgId: ref.organization_id,
        caseId: ref.case_id,
        referralId: ref.id,
        actorId: req.user!.id,
        event: `referral_${rule[action].to}`,
        details: { from: ref.status, to: rule[action].to },
      });
      return true;
    });
    if (!changed) return staleOrMissing(res, { version: ref.version }, 'Referral');

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: `CARE_REFERRAL_${rule[action].to.toUpperCase()}`,
      resourceType: 'care_referral',
      resourceId: ref.id,
      ipAddress: req.ip,
      details: { referralId: ref.id, caseId: ref.case_id, from: ref.status, to: rule[action].to },
    });

    res.json({ success: true, data: { id: ref.id, status: rule[action].to, version: ref.version + 1 } });
  } catch (err: any) {
    console.error('Update referral error:', err);
    res.status(500).json(serverError(err));
  }
});

// ---------------------------------------------------------------------------------------------- follow-up log
// GET /api/coordination/followup-log?caseId=&before=&limit=  (read-only; entries are written by the actions above)
coordinationRouter.get('/followup-log', async (req: Request, res: Response): Promise<void> => {
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const before = (req.query.before as string) || '';
  if ((req.query.caseId && !isUuid(req.query.caseId)) || (before && Number.isNaN(Date.parse(before)))) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'caseId must be an identifier and before an ISO timestamp.'));
    return;
  }
  try {
    const params: unknown[] = [];
    let where = caseScope(req, params);
    if (req.query.caseId) {
      params.push(req.query.caseId);
      where += ` AND f.case_id = $${params.length}`;
    }
    if (before) {
      params.push(before);
      where += ` AND f.created_at < $${params.length}`;
    }
    params.push(limit + 1);
    const r = await query(
      `SELECT f.id, f.case_id, f.task_id, f.referral_id, f.event_type, f.note, f.details, f.created_at,
              u.full_name_ar AS actor_name_ar, u.full_name_en AS actor_name_en,
              p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en
       FROM care_followup_log f JOIN care_cases c ON c.id = f.case_id JOIN users u ON u.id = f.actor_id JOIN patient_profiles p ON p.id = c.patient_id
       WHERE ${where} ORDER BY f.created_at DESC, f.id DESC LIMIT $${params.length}`,
      params
    );
    const hasMore = r.rows.length > limit;
    const rows = r.rows.slice(0, limit);
    res.json({ success: true, data: rows, meta: { limit, hasMore, nextBefore: hasMore ? rows[rows.length - 1].created_at : null } });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

