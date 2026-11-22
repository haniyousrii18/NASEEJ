import { Router, Request, Response } from 'express';
import { isStrongPassword } from '../services/passwordPolicy.js';
import { query } from '../config/db.js';
import { authProvider } from '../auth/authProvider.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { apiError, serverError, trimmed } from '../services/validation.js';
import { onPasswordChanged, type NotificationRole } from '../services/notificationService.js';
import { completeName, hasArabic, hasLatin } from '../services/names/transliterate.js';

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
/** Letters (any script), combining marks, spaces and the punctuation names use: O'Neil, Al-Mansoor, Jr. */
const NAME_RE = /^[\p{L}\p{M}\s'’.-]+$/u;

/** After a name change, the next one is allowed this many days later. */
export const NAME_LOCK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the name may next be changed, or null when it may be changed now. */
function nameLockedUntil(changedAt: Date | string | null | undefined, now = Date.now()): string | null {
  if (!changedAt) return null;
  const until = new Date(changedAt).getTime() + NAME_LOCK_DAYS * DAY_MS;
  return until > now ? new Date(until).toISOString() : null;
}

/** A name field from the request, checked: 2 to 120 characters, letters only, written in the field's own script. */
function readName(value: unknown, script: 'ar' | 'en'): { ok: true; value: string } | { ok: false } {
  const v = trimmed(value, 120);
  if (!v || v.length < 2 || !NAME_RE.test(v)) return { ok: false };
  if (script === 'ar' && (!hasArabic(v) || hasLatin(v))) return { ok: false };
  if (script === 'en' && (!hasLatin(v) || hasArabic(v))) return { ok: false };
  return { ok: true, value: v.replace(/\s+/g, ' ') };
}

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
    const changed = (await query('SELECT name_changed_at FROM users WHERE id = $1', [user.id])).rows[0]?.name_changed_at ?? null;

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
        // Anyone may change their own name, once every NAME_LOCK_DAYS days.
        nameEditable: true,
        nameChangedAt: changed,
        nameLockedUntil: nameLockedUntil(changed),
        nameLockDays: NAME_LOCK_DAYS,
        centers,
        patient,
      },
    });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/account/name-preview  { name }  ->  { ar, en }
// The name in both scripts, as a change would save it, so the person sees (and can correct) the other version first.
accountRouter.post('/name-preview', (req: Request, res: Response): void => {
  const name = trimmed(req.body?.name, 120);
  if (!name || !NAME_RE.test(name)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a name of 2 to 120 letters.', { field: 'name' }));
    return;
  }
  res.json({ success: true, data: completeName(hasArabic(name) ? { ar: name } : { en: name }) });
});

// PATCH /api/account/profile  { fullNameAr?, fullNameEn?, phone? }
// A name may be sent in one script or both; a missing side is written from the other. Changing the name is allowed once
// every NAME_LOCK_DAYS days. Sending the current name again is not a change and does not start the wait.
accountRouter.patch('/profile', async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const body = req.body || {};
  const changes: Record<string, string | null> = {};
  let nameChanged = false;

  if (body.fullNameAr !== undefined || body.fullNameEn !== undefined) {
    let ar: string | undefined;
    let en: string | undefined;
    if (body.fullNameAr !== undefined) {
      const r = readName(body.fullNameAr, 'ar');
      if (!r.ok) {
        res.status(400).json(apiError('VALIDATION_ERROR', 'Enter your name in Arabic letters (2 to 120 characters).', { field: 'fullNameAr' }));
        return;
      }
      ar = r.value;
    }
    if (body.fullNameEn !== undefined) {
      const r = readName(body.fullNameEn, 'en');
      if (!r.ok) {
        res.status(400).json(apiError('VALIDATION_ERROR', 'Enter your name in English letters (2 to 120 characters).', { field: 'fullNameEn' }));
        return;
      }
      en = r.value;
    }
    const next = completeName({ ar, en });
    if (next.ar !== user.full_name_ar || next.en !== user.full_name_en) {
      changes.full_name_ar = next.ar;
      changes.full_name_en = next.en;
      nameChanged = true;
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
  const nameSent = body.fullNameAr !== undefined || body.fullNameEn !== undefined;
  if (Object.keys(changes).length === 0 && !nameSent) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Nothing to update.'));
    return;
  }

  try {
    if (Object.keys(changes).length === 0) {
      // The current name sent again is a successful no-op: it does not start the wait.
      const changed = (await query('SELECT name_changed_at FROM users WHERE id = $1', [user.id])).rows[0]?.name_changed_at ?? null;
      res.json({ success: true, data: { fullNameAr: user.full_name_ar, fullNameEn: user.full_name_en, phone: user.phone ?? null, nameChangedAt: changed, nameLockedUntil: nameLockedUntil(changed) } });
      return;
    }
    const cols = Object.keys(changes);
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    // The wait is checked in the same statement that writes, so two saves at once cannot both change the name.
    const upd = await query(
      `UPDATE users SET ${set}${nameChanged ? ', name_changed_at = NOW()' : ''}, updated_at = NOW()
       WHERE id = $1${nameChanged ? ` AND (name_changed_at IS NULL OR name_changed_at <= NOW() - INTERVAL '${NAME_LOCK_DAYS} days')` : ''}
       RETURNING full_name_ar, full_name_en, phone, name_changed_at`,
      [user.id, ...cols.map((c) => changes[c])]
    );
    if (upd.rowCount === 0) {
      const changed = (await query('SELECT name_changed_at FROM users WHERE id = $1', [user.id])).rows[0]?.name_changed_at ?? null;
      res.status(409).json(apiError('NAME_CHANGE_LOCKED', `Your name can be changed once every ${NAME_LOCK_DAYS} days.`, { field: 'fullNameAr', availableAt: nameLockedUntil(changed) }));
      return;
    }
    // A patient's record carries the name too (shares, visit summaries); it follows the account.
    if (nameChanged && user.patientProfileId) {
      await query('UPDATE patient_profiles SET full_name_ar = $2, full_name_en = $3, updated_at = NOW() WHERE id = $1', [user.patientProfileId, changes.full_name_ar, changes.full_name_en]);
    }
    audit(req, 'ACCOUNT_PROFILE_UPDATED', { fields: cols });
    const r = upd.rows[0];
    res.json({
      success: true,
      data: { fullNameAr: r.full_name_ar, fullNameEn: r.full_name_en, phone: r.phone, nameChangedAt: r.name_changed_at, nameLockedUntil: nameLockedUntil(r.name_changed_at) },
    });
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
  if (!isStrongPassword(newPassword)) {
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
    await onPasswordChanged(user.id, roleOf(req) as NotificationRole);
    res.json({ success: true, data: { changed: true } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
