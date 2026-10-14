import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

export const auditRouter = Router();

auditRouter.use(authenticate);

// GET /api/audit-logs
auditRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const orgIdHeader = req.headers['x-organization-id'] as string;
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

  try {
    let text = `
      SELECT a.*, o.name_ar as organization_name_ar, o.name_en as organization_name_en
      FROM audit_logs a
      LEFT JOIN organizations o ON a.organization_id = o.id
    `;
    const params: any[] = [];

    if (user.system_role === 'platform_admin') {
      if (orgIdHeader) {
        params.push(orgIdHeader);
        text += ` WHERE a.organization_id = $1`;
      }
    } else {
      // Must be a center manager
      const managerMemberships = user.memberships.filter((m) => m.role === 'center_manager');
      if (managerMemberships.length === 0) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN_ROLE', message: 'Only Center Managers or Platform Admins can view audit logs.' },
        });
        return;
      }
      const allowedOrgs = managerMemberships.map((m) => m.organization_id);
      params.push(allowedOrgs);
      text += ` WHERE a.organization_id = ANY($1)`;
    }

    params.push(limit);
    text += ` ORDER BY a.created_at DESC LIMIT $${params.length}`;

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
