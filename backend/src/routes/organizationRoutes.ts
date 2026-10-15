import { Router, Request, Response } from 'express';
import { randomInt } from 'crypto';
import { query, withTransaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { authProvider } from '../auth/authProvider.js';
import { apiError, isUuid, serverError } from '../services/validation.js';

export const organizationRouter = Router();

// Roles a membership can hold. Only a platform administrator may create a center manager.
const MEMBER_ROLES = ['doctor', 'reception', 'care_coordinator', 'center_manager'] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A random one-time password for accounts created without one. Shown once to the creator, never stored in clear. */
function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 14; i++) out += alphabet[randomInt(alphabet.length)];
  return `${out}!7`;
}

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
    res.status(500).json(serverError(err));
  }
});

// POST /api/organizations (Platform Admin Only)
organizationRouter.post('/', authenticate, requirePlatformAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name_ar, name_en, code, type, contact_phone, contact_email, address_ar, address_en } = req.body || {};
  if (!name_ar || !name_en || !code) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'name_ar, name_en, and code are required.'));
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO organizations (name_ar, name_en, code, type, contact_phone, contact_email, address_ar, address_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name_ar, name_en, String(code).toUpperCase(), type || 'clinic', contact_phone, contact_email, address_ar, address_en]
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
      res.status(409).json(apiError('CONFLICT_CODE', 'A medical center with this code already exists.'));
      return;
    }
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/organizations/:id (Platform Admin Only): configuration and status. A suspended center is closed to
// its staff and patients by the tenant middleware on their next request.
organizationRouter.patch('/:id', authenticate, requirePlatformAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isUuid(id)) {
    res.status(404).json(apiError('ORGANIZATION_NOT_FOUND', 'Medical center not found.'));
    return;
  }
  const { name_ar, name_en, type, status, contact_phone, contact_email, address_ar, address_en } = req.body || {};

  if (status !== undefined && !['active', 'suspended'].includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'status must be active or suspended.'));
    return;
  }
  if (type !== undefined && !['hospital', 'clinic', 'specialized_center'].includes(type)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'type must be hospital, clinic or specialized_center.'));
    return;
  }

  try {
    const before = await query('SELECT status FROM organizations WHERE id = $1', [id]);
    if (before.rowCount === 0) {
      res.status(404).json(apiError('ORGANIZATION_NOT_FOUND', 'Medical center not found.'));
      return;
    }

    const update = await query(
      `UPDATE organizations SET
         name_ar = COALESCE($1, name_ar), name_en = COALESCE($2, name_en), type = COALESCE($3, type),
         status = COALESCE($4, status), contact_phone = COALESCE($5, contact_phone), contact_email = COALESCE($6, contact_email),
         address_ar = COALESCE($7, address_ar), address_en = COALESCE($8, address_en), updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [name_ar ?? null, name_en ?? null, type ?? null, status ?? null, contact_phone ?? null, contact_email ?? null, address_ar ?? null, address_en ?? null, id]
    );

    logAuditEvent({
      organizationId: id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'platform_admin',
      action: status && status !== before.rows[0].status ? 'ORGANIZATION_STATUS_CHANGE' : 'ORGANIZATION_UPDATE',
      resourceType: 'organization',
      resourceId: id,
      ipAddress: req.ip,
      details: status ? { from: before.rows[0].status, to: status } : {},
    });

    res.json({ success: true, data: update.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/organizations/:id/members
organizationRouter.get('/:id/members', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  // Authorization check: platform admin or manager/staff of this center
  const membership = req.user!.memberships.find((m) => m.organization_id === id);
  const isAdmin = req.user!.system_role === 'platform_admin';
  if (!isAdmin && !membership) {
    res.status(403).json(apiError('FORBIDDEN_CROSS_TENANT', 'You do not have access to this center staff directory.'));
    return;
  }
  const full = isAdmin || membership?.role === 'center_manager';

  try {
    // Staff who are not managing the center get a directory (who, which role, which specialty): no email, phone or license.
    const membersRes = await query(
      full
        ? `SELECT m.id as membership_id, m.role, m.specialty_ar, m.specialty_en, m.license_number, m.status, m.created_at,
                  u.id as user_id, u.email, u.full_name_ar, u.full_name_en, u.phone
           FROM organization_memberships m JOIN users u ON m.user_id = u.id
           WHERE m.organization_id = $1 ORDER BY m.created_at ASC`
        : `SELECT m.id as membership_id, m.role, m.specialty_ar, m.specialty_en, m.status,
                  u.id as user_id, u.full_name_ar, u.full_name_en
           FROM organization_memberships m JOIN users u ON m.user_id = u.id
           WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY m.created_at ASC`,
      [id]
    );

    res.json({ success: true, data: membersRes.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/organizations/:id/members (Center Manager or Platform Admin)
organizationRouter.post('/:id/members', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const isManager = req.user!.memberships.some((m) => m.organization_id === id && m.role === 'center_manager');
  const isAdmin = req.user!.system_role === 'platform_admin';

  if (!isAdmin && !isManager) {
    res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only Center Managers or Platform Admins can assign staff.'));
    return;
  }

  const { email, password, full_name_ar, full_name_en, phone, role, specialty_ar, specialty_en, license_number } = req.body || {};
  if (!email || !full_name_ar || !full_name_en || !role) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'email, full_name_ar, full_name_en, and role are required.'));
    return;
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A valid email address is required.'));
    return;
  }
  if (!MEMBER_ROLES.includes(role)) {
    res.status(400).json(apiError('VALIDATION_ERROR', `role must be one of: ${MEMBER_ROLES.join(', ')}.`));
    return;
  }
  if (role === 'center_manager' && !isAdmin) {
    res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only a Platform Admin can assign a Center Manager.'));
    return;
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A password must be at least 8 characters.'));
    return;
  }

  try {
    const exists = await query('SELECT id FROM organizations WHERE id = $1', [isUuid(id) ? id : '00000000-0000-0000-0000-000000000000']);
    if (exists.rowCount === 0) {
      res.status(404).json(apiError('ORGANIZATION_NOT_FOUND', 'Medical center not found.'));
      return;
    }

    const outcome = await withTransaction(async (client) => {
      // Check if user already exists or create new user
      const userRes = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
      let userId: string;
      let issuedPassword: string | undefined;

      if (userRes.rowCount === 0) {
        issuedPassword = password ? undefined : temporaryPassword();
        const hash = await authProvider.hashPassword(password || issuedPassword!);
        const newUserRes = await client.query(
          `INSERT INTO users (auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, system_role)
           VALUES ($1, $2, $3, $4, $5, $6, 'user')
           RETURNING id`,
          [`local_auth_${Date.now()}_${randomInt(1e6)}`, email.trim().toLowerCase(), hash, full_name_ar, full_name_en, phone]
        );
        userId = newUserRes.rows[0].id;
      } else {
        userId = userRes.rows[0].id;
      }

      const memRes = await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, specialty_ar, specialty_en, license_number, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING *`,
        [id, userId, role as MemberRole, specialty_ar, specialty_en, license_number]
      );
      return { membership: memRes.rows[0], userId, issuedPassword };
    });

    logAuditEvent({
      organizationId: id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: isManager ? 'center_manager' : 'platform_admin',
      action: 'STAFF_MEMBER_ASSIGN',
      resourceType: 'organization_membership',
      resourceId: outcome.membership.id,
      ipAddress: req.ip,
      details: { role, targetUserId: outcome.userId, targetEmail: email },
    });

    // The one-time password is returned exactly once, only when the server generated it.
    res.status(201).json({
      success: true,
      data: outcome.issuedPassword ? { ...outcome.membership, temporaryPassword: outcome.issuedPassword } : outcome.membership,
    });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json(apiError('CONFLICT_MEMBERSHIP', 'User is already a member of this medical center.'));
      return;
    }
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/organizations/:id/members/:membershipId (Center Manager of this center, or Platform Admin)
// Changes a membership's status or role. The lookup is scoped by organization, so another center's membership
// id cannot be reached; a manager can neither change their own membership nor remove the last active manager.
organizationRouter.patch('/:id/members/:membershipId', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id, membershipId } = req.params;
  const isManager = req.user!.memberships.some((m) => m.organization_id === id && m.role === 'center_manager');
  const isAdmin = req.user!.system_role === 'platform_admin';

  if (!isAdmin && !isManager) {
    res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only Center Managers or Platform Admins can change staff.'));
    return;
  }
  if (!isUuid(id) || !isUuid(membershipId)) {
    res.status(404).json(apiError('MEMBERSHIP_NOT_FOUND', 'Membership not found in this medical center.'));
    return;
  }

  const { status, role } = req.body || {};
  if (status === undefined && role === undefined) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Provide status and/or role.'));
    return;
  }
  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'status must be active or inactive.'));
    return;
  }
  if (role !== undefined && !MEMBER_ROLES.includes(role)) {
    res.status(400).json(apiError('VALIDATION_ERROR', `role must be one of: ${MEMBER_ROLES.join(', ')}.`));
    return;
  }
  if (role === 'center_manager' && !isAdmin) {
    res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only a Platform Admin can assign a Center Manager.'));
    return;
  }

  try {
    const outcome = await withTransaction(async (client) => {
      const current = await client.query(
        'SELECT id, user_id, role, status FROM organization_memberships WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [membershipId, id]
      );
      if (current.rowCount === 0) return { notFound: true as const };
      const row = current.rows[0];

      if (!isAdmin && row.user_id === req.user!.id) return { self: true as const };

      const nextRole = role ?? row.role;
      const nextStatus = status ?? row.status;
      const losesManager = row.role === 'center_manager' && row.status === 'active' && (nextRole !== 'center_manager' || nextStatus !== 'active');
      if (losesManager) {
        const others = await client.query(
          `SELECT 1 FROM organization_memberships WHERE organization_id = $1 AND role = 'center_manager' AND status = 'active' AND id <> $2`,
          [id, membershipId]
        );
        if (others.rowCount === 0) return { lastManager: true as const };
      }

      const update = await client.query(
        'UPDATE organization_memberships SET role = $1, status = $2, updated_at = NOW() WHERE id = $3 AND organization_id = $4 RETURNING *',
        [nextRole, nextStatus, membershipId, id]
      );
      return { updated: update.rows[0], before: { role: row.role, status: row.status } };
    });

    if ('notFound' in outcome) {
      res.status(404).json(apiError('MEMBERSHIP_NOT_FOUND', 'Membership not found in this medical center.'));
      return;
    }
    if ('self' in outcome) {
      res.status(403).json(apiError('FORBIDDEN_SELF_CHANGE', 'You cannot change your own membership.'));
      return;
    }
    if ('lastManager' in outcome) {
      res.status(409).json(apiError('LAST_MANAGER', 'The center must keep at least one active Center Manager.'));
      return;
    }

    logAuditEvent({
      organizationId: id,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: isAdmin ? 'platform_admin' : 'center_manager',
      action: 'STAFF_MEMBER_UPDATE',
      resourceType: 'organization_membership',
      resourceId: membershipId,
      ipAddress: req.ip,
      details: { from: `${outcome.before.role}/${outcome.before.status}`, to: `${outcome.updated.role}/${outcome.updated.status}` },
    });

    res.json({ success: true, data: outcome.updated });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

