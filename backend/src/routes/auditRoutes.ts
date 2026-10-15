import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { redactAuditDetails } from '../services/accessService.js';
import { apiError, clampInt, escapeLike, isUuid, serverError } from '../services/validation.js';

export const auditRouter = Router();

auditRouter.use(authenticate);

// GET /api/audit-logs
// Read-only. Platform administrators see every center; center managers see only the centers they manage.
// Both are operational roles, so each row's `details` is reduced to non-clinical, allow-listed keys.
// Filters: organizationId (header or query), action (prefix), resourceType, from, to. Paging: limit (max 100), before.
auditRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const orgId = (req.headers['x-organization-id'] as string) || (req.query.organizationId as string) || '';
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const action = (req.query.action as string) || '';
  const resourceType = (req.query.resourceType as string) || '';
  const from = (req.query.from as string) || '';
  const to = (req.query.to as string) || '';
  const before = (req.query.before as string) || '';

  if (orgId && !isUuid(orgId)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'organizationId must be a valid identifier.'));
    return;
  }
  for (const stamp of [from, to, before]) {
    if (stamp && Number.isNaN(Date.parse(stamp))) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'from, to and before must be ISO timestamps.'));
      return;
    }
  }

  try {
    const where: string[] = [];
    const params: any[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };

    if (user.system_role === 'platform_admin') {
      if (orgId) add('a.organization_id = ?', orgId);
    } else {
      // Must be a center manager
      const managed = user.memberships.filter((m) => m.role === 'center_manager').map((m) => m.organization_id);
      if (managed.length === 0) {
        res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only Center Managers or Platform Admins can view audit logs.'));
        return;
      }
      if (orgId && !managed.includes(orgId)) {
        res.status(403).json(apiError('FORBIDDEN_CROSS_TENANT', 'You can only view audit logs of centers you manage.'));
        return;
      }
      add('a.organization_id = ANY(?)', orgId ? [orgId] : managed);
    }

    if (action) add(`a.action LIKE ? || '%' ESCAPE '\\'`, escapeLike(action));
    if (resourceType) add('a.resource_type = ?', resourceType);
    if (from) add('a.created_at >= ?', from);
    if (to) add('a.created_at <= ?', to);
    if (before) add('a.created_at < ?', before);

    params.push(limit + 1);
    const result = await query(
      `SELECT a.id, a.organization_id, a.actor_id, a.actor_email, a.actor_role, a.action, a.resource_type, a.resource_id,
              a.ip_address, a.details, a.created_at,
              o.name_ar as organization_name_ar, o.name_en as organization_name_en
       FROM audit_logs a
       LEFT JOIN organizations o ON a.organization_id = o.id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit).map((r) => ({ ...r, details: redactAuditDetails(r.details) }));
    res.json({
      success: true,
      data: rows,
      meta: { limit, hasMore, nextBefore: hasMore ? rows[rows.length - 1].created_at : null },
    });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});
