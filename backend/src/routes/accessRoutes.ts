import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { authProvider } from '../auth/authProvider.js';
import { pool, query } from '../config/db.js';
import { apiLimiter } from '../services/apiLimit.js';
import { logAuditEvent } from '../services/auditService.js';
import { generateToken, hashToken, isTokenShape } from '../services/health/shareToken.js';
import { MailNotConfiguredError, mailMode, sendMail } from '../services/mail/mail.js';
import { alreadyRegisteredMail, mailLang, passwordChangedMail, resetPasswordMail, verifyEmailMail, type MailLang } from '../services/mail/templates.js';
import { isEmailAddress, isStrongPassword, normalizeEmail } from '../services/passwordPolicy.js';
import { rateLimit } from '../services/rateLimit.js';
import { apiError, serverError } from '../services/validation.js';

/**
 * Self-service account access, mounted next to login at /api/auth:
 *   POST /register            create an account with an email and a password; a confirmation link is mailed
 *   POST /verify-email        open that link: the address is confirmed and the account can sign in
 *   POST /resend-verification mail the confirmation link again
 *   POST /forgot-password     mail a reset link
 *   POST /reset-password      choose a new password with that link
 *
 * Rules that matter:
 *  - These endpoints never say whether an email already has an account: register, resend and forgot answer 202 the same way
 *    either way, and a person who already has an account is told by email instead.
 *  - Links hold a random 256-bit token; only its SHA-256 is stored. Each works once and expires (24 h to confirm, 1 h to reset).
 *  - A reset or password change signs out every other device (see authenticate: tokens older than password_changed_at fail).
 *  - Without a configured mail server in production the endpoints say "email is not configured" rather than pretend.
 */
export const accessRouter = Router();
accessRouter.use(apiLimiter);

const VERIFY_HOURS = 24;
const RESET_HOURS = 1;

const emailOf = (req: Request): string => (typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : 'unknown');
const perIp = (windowMs: number, max: number) => rateLimit({ windowMs, max, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a while and try again.' });
const perEmail = (name: string, windowMs: number, max: number) => rateLimit({ windowMs, max, key: (req) => `${name}:${emailOf(req)}`, code: 'RATE_LIMITED', message: 'Too many attempts for this address. Please wait a while and try again.' });

const accepted = (res: Response) => res.status(202).json({ success: true, data: { accepted: true } });
const mailOff = (res: Response) => res.status(503).json(apiError('EMAIL_NOT_CONFIGURED', 'Email is not set up on this server, so this cannot be done right now.'));

const audit = (req: Request, action: string, actorId?: string) => logAuditEvent({ actorId, action, resourceType: 'auth', ipAddress: req.ip });

/** A new link for `purpose`. Earlier unused links of the same kind stop working, so only the latest email is valid. */
async function issueToken(userId: string, purpose: 'verify_email' | 'reset_password', hours: number): Promise<string> {
  const token = generateToken();
  await query(`DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, [userId, purpose]);
  await query(`INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1,$2,$3, NOW() + make_interval(hours => $4))`, [userId, purpose, hashToken(token), hours]);
  return token;
}

/** The unused, unexpired token row for a link, or null. The same answer for "wrong", "used" and "expired". */
async function findToken(raw: unknown, purpose: 'verify_email' | 'reset_password') {
  if (!isTokenShape(raw)) return null;
  const r = await query(
    `SELECT t.id, t.user_id, u.email, u.full_name_en, u.full_name_ar, u.is_active FROM auth_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.purpose = $2 AND t.used_at IS NULL AND t.expires_at > NOW()`,
    [hashToken(raw), purpose],
  );
  return r.rows[0] ?? null;
}

const validName = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 120;

// POST /api/auth/register  { email, password, fullName, lang }
accessRouter.post('/register', perIp(60 * 60_000, 20), perEmail('register', 60 * 60_000, 5), async (req: Request, res: Response): Promise<void> => {
  const { password, fullName } = req.body ?? {};
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  const lang = mailLang(req.body?.lang);
  if (!isEmailAddress(email)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' }));
  if (!validName(fullName)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Enter your name (2 to 120 characters).', { field: 'fullName' }));
  if (!isStrongPassword(password)) return void res.status(400).json(apiError('WEAK_PASSWORD', 'Use at least 8 characters, including a letter and a number.', { field: 'password' }));
  if (mailMode() === 'off') return void mailOff(res);

  const name = fullName.trim();
  try {
    const existing = await query('SELECT id, email_verified_at, auth_provider_id FROM users WHERE LOWER(email) = $1', [email]);
    const row = existing.rows[0];
    let mail;
    if (row && row.email_verified_at) {
      // A verified account already owns this address. Say nothing different to the caller; tell the owner by email.
      mail = alreadyRegisteredMail(email, lang);
    } else if (row && String(row.auth_provider_id).startsWith('local_signup_')) {
      // Registered earlier and never confirmed: the latest registration wins, so nobody can squat on someone else's address.
      const hash = await authProvider.hashPassword(password);
      await query('UPDATE users SET password_hash = $2, full_name_ar = $3, full_name_en = $3, updated_at = NOW() WHERE id = $1', [row.id, hash, name]);
      await query('UPDATE patient_profiles SET full_name_ar = $2, full_name_en = $2, updated_at = NOW() WHERE user_id = $1', [row.id, name]);
      mail = verifyEmailMail(email, lang, name, await issueToken(row.id, 'verify_email', VERIFY_HOURS));
    } else if (row) {
      // An account made by an administrator or the seed: not ours to change.
      mail = alreadyRegisteredMail(email, lang);
    } else {
      const hash = await authProvider.hashPassword(password);
      const client = await pool.connect();
      let userId: string;
      try {
        await client.query('BEGIN');
        const u = await client.query(
          `INSERT INTO users (auth_provider_id, email, password_hash, full_name_ar, full_name_en, system_role, is_active, email_verified_at)
           VALUES ($1,$2,$3,$4,$4,'user',true,NULL) RETURNING id`,
          [`local_signup_${randomUUID()}`, email, hash, name],
        );
        userId = u.rows[0].id;
        await client.query(`INSERT INTO patient_profiles (user_id, full_name_ar, full_name_en, email) VALUES ($1,$2,$2,$3)`, [userId, name, email]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      audit(req, 'AUTH_REGISTERED', userId);
      mail = verifyEmailMail(email, lang, name, await issueToken(userId, 'verify_email', VERIFY_HOURS));
    }
    try {
      await sendMail(mail);
    } catch (err) {
      if (err instanceof MailNotConfiguredError) return void mailOff(res);
      console.error('[Mail] could not send the registration email:', (err as Error)?.message);
      return void res.status(502).json(apiError('EMAIL_SEND_FAILED', 'We could not send the email right now. Please try again in a few minutes.'));
    }
    accepted(res);
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/auth/verify-email  { token }
accessRouter.post('/verify-email', perIp(15 * 60_000, 30), async (req: Request, res: Response): Promise<void> => {
  try {
    const t = await findToken(req.body?.token, 'verify_email');
    if (!t) return void res.status(400).json(apiError('LINK_INVALID', 'This link is not valid any more. Ask for a new one.'));
    await query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $1', [t.user_id]);
    await query('UPDATE auth_tokens SET used_at = NOW() WHERE id = $1', [t.id]);
    audit(req, 'AUTH_EMAIL_VERIFIED', t.user_id);
    res.json({ success: true, data: { verified: true } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/auth/resend-verification  { email, lang }
accessRouter.post('/resend-verification', perIp(60 * 60_000, 20), perEmail('resend', 60 * 60_000, 3), async (req: Request, res: Response): Promise<void> => {
  const email = emailOf(req);
  const lang: MailLang = mailLang(req.body?.lang);
  if (!isEmailAddress(email)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' }));
  if (mailMode() === 'off') return void mailOff(res);
  try {
    const r = await query(`SELECT id, full_name_en FROM users WHERE LOWER(email) = $1 AND email_verified_at IS NULL AND is_active AND auth_provider_id LIKE 'local_signup_%'`, [email]);
    const u = r.rows[0];
    if (u) {
      try {
        await sendMail(verifyEmailMail(email, lang, u.full_name_en, await issueToken(u.id, 'verify_email', VERIFY_HOURS)));
      } catch (err) {
        console.error('[Mail] could not send the confirmation email:', (err as Error)?.message);
      }
    }
    accepted(res);
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/auth/forgot-password  { email, lang }
accessRouter.post('/forgot-password', perIp(15 * 60_000, 20), perEmail('forgot', 60 * 60_000, 3), async (req: Request, res: Response): Promise<void> => {
  const email = emailOf(req);
  const lang: MailLang = mailLang(req.body?.lang);
  if (!isEmailAddress(email)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' }));
  if (mailMode() === 'off') return void mailOff(res);
  try {
    const r = await query('SELECT id, full_name_en, full_name_ar FROM users WHERE LOWER(email) = $1 AND is_active', [email]);
    const u = r.rows[0];
    if (u) {
      try {
        const name = lang === 'ar' ? u.full_name_ar : u.full_name_en;
        await sendMail(resetPasswordMail(email, lang, name, await issueToken(u.id, 'reset_password', RESET_HOURS)));
        audit(req, 'AUTH_PASSWORD_RESET_REQUESTED', u.id);
      } catch (err) {
        console.error('[Mail] could not send the reset email:', (err as Error)?.message);
      }
    }
    accepted(res); // the same answer whether or not the address has an account
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/auth/reset-password  { token, newPassword, lang }
accessRouter.post('/reset-password', perIp(15 * 60_000, 30), async (req: Request, res: Response): Promise<void> => {
  const { newPassword } = req.body ?? {};
  if (!isStrongPassword(newPassword)) return void res.status(400).json(apiError('WEAK_PASSWORD', 'Use at least 8 characters, including a letter and a number.', { field: 'newPassword' }));
  try {
    const t = await findToken(req.body?.token, 'reset_password');
    if (!t || !t.is_active) return void res.status(400).json(apiError('LINK_INVALID', 'This link is not valid any more. Ask for a new one.'));
    const hash = await authProvider.hashPassword(newPassword);
    // Everything or nothing: the new password, the used link and the sign-out of every earlier session.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET password_hash = $2, password_changed_at = NOW(), email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $1',
        [t.user_id, hash],
      );
      await client.query(`UPDATE auth_tokens SET used_at = NOW() WHERE id = $1`, [t.id]);
      await client.query(`DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = 'reset_password' AND used_at IS NULL`, [t.user_id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    audit(req, 'AUTH_PASSWORD_RESET_COMPLETED', t.user_id);
    const lang = mailLang(req.body?.lang);
    void sendMail(passwordChangedMail(t.email, lang, lang === 'ar' ? t.full_name_ar : t.full_name_en)).catch(() => undefined);
    res.json({ success: true, data: { reset: true } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

/** What the site needs to know to explain things honestly: whether email can actually be sent right now. */
accessRouter.get('/access-status', (_req: Request, res: Response): void => {
  res.json({ success: true, data: { mail: mailMode() } });
});
