import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { authProvider } from '../auth/authProvider.js';

export const organizationRouter = Router();

// GET /api/organizations
organizationRouter.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.system_role === 'platform_admin') {
      const orgsRes = await query('SELECT * FROM organizations ORDER BY created_at DESC');
      res.json({ success: true, data: orgsRes.rows });
      return;
    }

    // Regular users: return organizations they belong to
    const orgIds = req.user!.memberships.map((m) => m.organization_id);
    if (orgIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const orgsRes = await query('SELECT * FROM organizations WHERE id = ANY($1)', [orgIds]);
    res.json({ success: true, data: orgsRes.rows });
  } catch (err: any) {
    console.error('Fetch organizations error:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/organizations (Platform Admin Only)
organizationRouter.post('/', authenticate, requirePlatformAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name_ar, name_en, code, type, contact_phone, contact_email, address_ar, address_en } = req.body;
  if (!name_ar || !name_en || !code) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'name_ar, name_en, and code are required.' },
    });
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO organizations (name_ar, name_en, code, type, contact_phone, contact_email, address_ar, address_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name_ar, name_en, code.toUpperCase(), type || 'clinic', contact_phone, contact_email, address_ar, address_en]
    );

    const newOrg = insertRes.rows[0];

    logAuditEvent({
      organizationId: newOrg.id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'platform_admin',
      action: 'ORGANIZATION_CREATE',
      resourceType: 'organization',
      resourceId: newOrg.id,
      ipAddress: req.ip,
      details: { code: newOrg.code, name_en: newOrg.name_en },
    });

    res.status(201).json({ success: true, data: newOrg });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT_CODE', message: 'A medical center with this code already exists.' },
      });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/organizations/:id/members
organizationRouter.get('/:id/members', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  // Authorization check: platform admin or manager/staff of this center
  const isMember = req.user!.memberships.some((m) => m.organization_id === id);
  if (req.user!.system_role !== 'platform_admin' && !isMember) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_CROSS_TENANT', message: 'You do not have access to this center staff directory.' },
    });
    return;
  }

  try {
    const membersRes = await query(
      `SELECT m.id as membership_id, m.role, m.specialty_ar, m.specialty_en, m.license_number, m.status, m.created_at,
              u.id as user_id, u.email, u.full_name_ar, u.full_name_en, u.phone
       FROM organization_memberships m
       JOIN users u ON m.user_id = u.id
       WHERE m.organization_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );

    res.json({ success: true, data: membersRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/organizations/:id/members (Center Manager or Platform Admin)
organizationRouter.post('/:id/members', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const isManager = req.user!.memberships.some((m) => m.organization_id === id && m.role === 'center_manager');
  const isAdmin = req.user!.system_role === 'platform_admin';

  if (!isAdmin && !isManager) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_ROLE', message: 'Only Center Managers or Platform Admins can assign staff.' },
    });
    return;
  }

  const { email, password, full_name_ar, full_name_en, phone, role, specialty_ar, specialty_en, license_number } = req.body;
  if (!email || !full_name_ar || !full_name_en || !role) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'email, full_name_ar, full_name_en, and role are required.' },
    });
    return;
  }

  try {
    // Check if user already exists or create new user
    let userRes = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    let userId: string;

    if (userRes.rowCount === 0) {
      const defaultPassword = password || 'Password123!';
      const hash = await authProvider.hashPassword(defaultPassword);
      const newUserRes = await query(
        `INSERT INTO users (auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, system_role)
         VALUES ($1, $2, $3, $4, $5, $6, 'user')
         RETURNING id`,
        [`local_auth_${Date.now()}`, email.trim().toLowerCase(), hash, full_name_ar, full_name_en, phone]
      );
      userId = newUserRes.rows[0].id;
    } else {
      userId = userRes.rows[0].id;
    }

    // Create membership
    const memRes = await query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, specialty_ar, specialty_en, license_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [id, userId, role, specialty_ar, specialty_en, license_number]
    );

    logAuditEvent({
      organizationId: id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: isManager ? 'center_manager' : 'platform_admin',
      action: 'STAFF_MEMBER_ASSIGN',
      resourceType: 'organization_membership',
      resourceId: memRes.rows[0].id,
      ipAddress: req.ip,
      details: { role, targetUserId: userId, targetEmail: email },
    });

    res.status(201).json({ success: true, data: memRes.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT_MEMBERSHIP', message: 'User is already a member of this medical center.' },
      });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
