import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { apiError, clampInt, escapeLike, isUuid, serverError } from '../services/validation.js';

/**
 * Platform administration: centers, accounts and platform health. Everything here is account- and
 * operations-level. No route in this router reads, joins or returns patient records or clinical content,
 * and the clinical routers refuse this role outright.
 */
export const adminRouter = Router();

adminRouter.use(authenticate, requirePlatformAdmin);

const startedAt = Date.now();

// GET /api/admin/overview
adminRouter.get('/overview', async (_req: Request, res: Response): Promise<void> => {
  try {
    const t0 = Date.now();
    await query('SELECT 1');
    const dbLatencyMs = Date.now() - t0;

    const [orgs, users, roles, audit24h, demoRequests] = await Promise.all([
      query(`SELECT status, count(*)::int AS count FROM organizations GROUP BY status`),
      query(`SELECT is_active, count(*)::int AS count FROM users GROUP BY is_active`),
      query(`SELECT role, count(*)::int AS count FROM organization_memberships WHERE status = 'active' GROUP BY role`),
      query(`SELECT count(*)::int AS count FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours'`),
      query(`SELECT count(*)::int AS count FROM demo_requests WHERE status = 'new'`),
    ]);

    const centers: Record<string, number> = { active: 0, suspended: 0 };
    for (const r of orgs.rows) centers[r.status] = r.count;
    const accounts = { active: 0, deactivated: 0 };
    for (const r of users.rows) (r.is_active ? (accounts.active += r.count) : (accounts.deactivated += r.count));

    res.json({
      success: true,
      data: {
        service: { status: 'healthy', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), database: { status: 'up', latencyMs: dbLatencyMs } },
        centers,
        accounts,
        activeMembershipsByRole: Object.fromEntries(roles.rows.map((r) => [r.role, r.count])),
        auditEventsLast24h: audit24h.rows[0].count,
        newDemoRequests: demoRequests.rows[0].count,
      },
    });
  } catch (err: any) {
    console.error('Admin overview error:', err);
    res.status(500).json(serverError(err));
  }
});

// GET /api/admin/users?search=&limit=&offset=
adminRouter.get('/users', async (req: Request, res: Response): Promise<void> => {
  const search = ((req.query.search as string) || '').trim().toLowerCase();
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 100000);

  try {
    const params: unknown[] = [];
    let where = '';
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      where = `WHERE LOWER(u.email) LIKE $1 ESCAPE '\\' OR LOWER(u.full_name_en) LIKE $1 ESCAPE '\\' OR LOWER(u.full_name_ar) LIKE $1 ESCAPE '\\'`;
    }
    params.push(limit + 1, offset);
    const r = await query(
      `SELECT u.id, u.email, u.full_name_ar, u.full_name_en, u.system_role, u.is_active, u.created_at,
              EXISTS (SELECT 1 FROM patient_profiles p WHERE p.user_id = u.id) AS has_patient_profile,
              COALESCE((SELECT json_agg(json_build_object('organization_id', m.organization_id, 'organization_name_en', o.name_en,
                          'organization_name_ar', o.name_ar, 'membership_id', m.id, 'role', m.role, 'status', m.status) ORDER BY o.name_en)
                        FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = u.id), '[]') AS memberships
       FROM users u ${where} ORDER BY u.created_at DESC, u.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const hasMore = r.rows.length > limit;
    res.json({ success: true, data: r.rows.slice(0, limit), meta: { limit, offset, hasMore } });
  } catch (err: any) {
    console.error('Admin users error:', err);
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/admin/users/:id { is_active }
// A deactivated account is rejected at its next request. You cannot deactivate yourself or the last active admin.
adminRouter.patch('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const { is_active } = req.body || {};
  if (!isUuid(req.params.id) || typeof is_active !== 'boolean') {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A user id and a boolean is_active are required.'));
    return;
  }
  if (req.params.id === req.user!.id) {
    res.status(403).json(apiError('FORBIDDEN_SELF_CHANGE', 'You cannot change your own activation.'));
    return;
  }

  try {
    const target = await query('SELECT id, system_role, is_active FROM users WHERE id = $1', [req.params.id]);
    if (target.rowCount === 0) {
      res.status(404).json(apiError('USER_NOT_FOUND', 'Account not found.'));
      return;
    }
    if (!is_active && target.rows[0].system_role === 'platform_admin') {
      const others = await query(`SELECT 1 FROM users WHERE system_role = 'platform_admin' AND is_active = true AND id <> $1`, [req.params.id]);
      if (others.rowCount === 0) {
        res.status(409).json(apiError('LAST_ADMIN', 'The platform must keep at least one active administrator.'));
        return;
      }
    }

    const update = await query('UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, is_active', [is_active, req.params.id]);

    logAuditEvent({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'platform_admin',
      action: is_active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      resourceType: 'user',
      resourceId: req.params.id,
      ipAddress: req.ip,
      details: { targetUserId: req.params.id, targetEmail: update.rows[0].email, isActive: is_active },
    });

    res.json({ success: true, data: update.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

const DEMO_STATUSES = ['new', 'contacted', 'scheduled', 'completed'];

// GET /api/admin/demo-requests?status=: requests sent from the public site, newest first
adminRouter.get('/demo-requests', async (req: Request, res: Response): Promise<void> => {
  const status = (req.query.status as string) || '';
  if (status && !DEMO_STATUSES.includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', `status must be one of: ${DEMO_STATUSES.join(', ')}.`));
    return;
  }
  try {
    const r = await query(
      `SELECT id, organization_name, contact_name, email, phone, center_type, notes, status, created_at
       FROM demo_requests ${status ? 'WHERE status = $1' : ''} ORDER BY created_at DESC LIMIT 200`,
      status ? [status] : []
    );
    res.json({ success: true, data: r.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/admin/demo-requests/:id { status }
adminRouter.patch('/demo-requests/:id', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body || {};
  if (!isUuid(req.params.id) || !DEMO_STATUSES.includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', `A request id and a status (${DEMO_STATUSES.join(', ')}) are required.`));
    return;
  }
  try {
    const update = await query('UPDATE demo_requests SET status = $1 WHERE id = $2 RETURNING id, status', [status, req.params.id]);
    if (update.rowCount === 0) {
      res.status(404).json(apiError('DEMO_REQUEST_NOT_FOUND', 'Demo request not found.'));
      return;
    }
    logAuditEvent({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'platform_admin',
      action: 'DEMO_REQUEST_STATUS_CHANGE',
      resourceType: 'demo_request',
      resourceId: req.params.id,
      ipAddress: req.ip,
      details: { status },
    });
    res.json({ success: true, data: update.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});
