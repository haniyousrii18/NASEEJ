import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authProvider } from '../auth/authProvider.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { apiError, serverError, trimmed } from '../services/validation.js';

/**
 * /api/account: the signed-in person's own account settings.
 *
 * Every route acts on `req.user` only. No user id, organization id or role is ever read from the request body, so
 * one account cannot reach another and a membership's role or center cannot be changed here (a center manager or
 * platform administrator owns those). Audit entries record which fields changed, never the values.
 */
export const accountRouter = Router();
accountRouter.use(authenticate);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{5,18}[0-9]$/;
const BCRYPT_MAX_BYTES = 72;

const roleOf = (req: Request): string => (req.user!.system_role === 'platform_admin' ? 'platform_admin' : req.user!.patientProfileId ? 'patient' : req.user!.memberships[0]?.role ?? 'user');

const audit = (req: Request, action: string, details: Record<string, unknown>) =>
  logAuditEvent({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: roleOf(req),
    action,
    resourceType: 'account',
    resourceId: req.user!.id,
    ipAddress: req.ip,
    details,
  });

// GET /api/account: profile, read-only affiliations, and (for a patient) their contact record.
accountRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  try {
    const centers = user.memberships.length
      ? (
          await query(
            `SELECT o.id, o.name_ar, o.name_en, o.code, o.type, o.status, o.contact_phone, o.contact_email, o.address_ar, o.address_en,
                    m.role, m.specialty_ar, m.specialty_en, m.license_number
             FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
             WHERE m.user_id = $1 AND m.status = 'active'
             ORDER BY o.name_en`,
            [user.id]
          )
        ).rows
      : [];

    let patient: Record<string, unknown> | null = null;
    if (user.patientProfileId) {
      const p = await query(
        'SELECT phone, email, emergency_contact_name, emergency_contact_phone FROM patient_profiles WHERE id = $1',
        [user.patientProfileId]
      );
      patient = p.rows[0] ?? null;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullNameAr: user.full_name_ar,
        fullNameEn: user.full_name_en,
        phone: user.phone ?? null,
        systemRole: user.system_role,
        isPatient: !!user.patientProfileId,
        // Patients' names come from their registered identity; staff names are personal display names.
        nameEditable: !user.patientProfileId,
        centers,
        patient,
      },
    });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/account/profile  { fullNameAr?, fullNameEn?, phone? }   (staff and administrators)
accountRouter.patch('/profile', async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const body = req.body || {};
  const changes: Record<string, string | null> = {};

  if (body.fullNameAr !== undefined || body.fullNameEn !== undefined) {
    if (user.patientProfileId) {
      res.status(403).json(apiError('FIELD_MANAGED_ELSEWHERE', 'A patient’s name comes from the registered identity and is changed by the registering center.'));
      return;
    }
    if (body.fullNameAr !== undefined) {
      const v = trimmed(body.fullNameAr, 120);
      if (!v || v.length < 2) {
        res.status(400).json(apiError('VALIDATION_ERROR', 'Enter your name in Arabic (2 to 120 characters).', { field: 'fullNameAr' }));
        return;
      }
      changes.full_name_ar = v;
    }
    if (body.fullNameEn !== undefined) {
      const v = trimmed(body.fullNameEn, 120);
      if (!v || v.length < 2) {
        res.status(400).json(apiError('VALIDATION_ERROR', 'Enter your name in English (2 to 120 characters).', { field: 'fullNameEn' }));
        return;
      }
      changes.full_name_en = v;
    }
  }
  if (body.phone !== undefined) {
    const raw = body.phone === null || body.phone === '' ? null : trimmed(body.phone, 20);
    if (raw !== null && !PHONE_RE.test(raw)) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a valid phone number.', { field: 'phone' }));
      return;
    }
    changes.phone = raw;
  }
  if (Object.keys(changes).length === 0) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Nothing to update.'));
    return;
  }

  try {
    const cols = Object.keys(changes);
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const upd = await query(
      `UPDATE users SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING full_name_ar, full_name_en, phone`,
      [user.id, ...cols.map((c) => changes[c])]
    );
    audit(req, 'ACCOUNT_PROFILE_UPDATED', { fields: cols });
    const r = upd.rows[0];
    res.json({ success: true, data: { fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en, phone: r.phone } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/account/patient-contact  { phone?, email?, emergencyContactName?, emergencyContactPhone? }   (patients only)
// Contact details only: identity (name, national id, date of birth) and anything clinical are not editable here.
accountRouter.patch('/patient-contact', requirePatient, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const body = req.body || {};
  const changes: Record<string, string | null> = {};

  const optional = (value: unknown, max: number): string | null => (value === null || value === '' ? null : trimmed(value, max));

  if (body.phone !== undefined) {
    const v = optional(body.phone, 20);
    if (v === null || !PHONE_RE.test(v)) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a valid phone number.', { field: 'phone' }));
      return;
    }
    changes.phone = v;
  }
  if (body.email !== undefined) {
    const v = optional(body.email, 255);
    if (v !== null && !EMAIL_RE.test(v)) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' }));
      return;
    }
    changes.email = v === null ? null : v.toLowerCase();
  }
  if (body.emergencyContactName !== undefined) {
    const v = optional(body.emergencyContactName, 255);
    if (body.emergencyContactName !== '' && body.emergencyContactName !== null && v === null) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'The emergency contact name is too long.', { field: 'emergencyContactName' }));
      return;
    }
    changes.emergency_contact_name = v;
  }
  if (body.emergencyContactPhone !== undefined) {
    const v = optional(body.emergencyContactPhone, 20);
    if (v !== null && !PHONE_RE.test(v)) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a valid emergency contact phone number.', { field: 'emergencyContactPhone' }));
      return;
    }
    changes.emergency_contact_phone = v;
  }
  if (Object.keys(changes).length === 0) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Nothing to update.'));
    return;
  }

  try {
    const cols = Object.keys(changes);
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    // The id comes from the authenticated account, never from the request.
    const upd = await query(
      `UPDATE patient_profiles SET ${set}, updated_at = NOW() WHERE id = $1
       RETURNING phone, email, emergency_contact_name, emergency_contact_phone`,
      [user.patientProfileId, ...cols.map((c) => changes[c])]
    );
    if (changes.phone) await query('UPDATE users SET phone = $2, updated_at = NOW() WHERE id = $1', [user.id, changes.phone]);
    audit(req, 'ACCOUNT_PATIENT_CONTACT_UPDATED', { fields: cols, patientId: user.patientProfileId });
    res.json({ success: true, data: upd.rows[0] });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/account/password  { currentPassword, newPassword }
// Changing a credential needs the current password again, so a stolen token alone cannot take over the account.
accountRouter.post('/password', async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Enter your current password and a new one.'));
    return;
  }
  if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > BCRYPT_MAX_BYTES || !/[A-Za-z؀-ۿ]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    res.status(400).json(apiError('WEAK_PASSWORD', 'Use at least 8 characters, including a letter and a number.', { field: 'newPassword' }));
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json(apiError('PASSWORD_UNCHANGED', 'The new password must be different from the current one.', { field: 'newPassword' }));
    return;
  }

  try {
    const row = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    const valid = await authProvider.verifyPassword(currentPassword, row.rows[0]?.password_hash);
    if (!valid) {
      audit(req, 'ACCOUNT_PASSWORD_CHANGE_FAILED', { reason: 'Incorrect current password' });
      res.status(403).json(apiError('CURRENT_PASSWORD_INCORRECT', 'The current password is incorrect.', { field: 'currentPassword' }));
      return;
    }
    const hash = await authProvider.hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [user.id, hash]);
    audit(req, 'ACCOUNT_PASSWORD_CHANGED', {});
    res.json({ success: true, data: { changed: true } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
