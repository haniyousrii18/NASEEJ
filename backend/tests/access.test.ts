import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { ENV } from '../src/config/env.js';
import { clearOutbox, mailMode, outbox } from '../src/services/mail/mail.js';
import { isEmailAddress, isStrongPassword } from '../src/services/passwordPolicy.js';

// Sign-up, email confirmation, forgot and reset password. Mail goes to the in-memory dev outbox: nothing is sent anywhere.
const PW = 'Sup3rSecret1';
const NEW_PW = 'Another9Pass';
const api = (path: string) => request(app).post(`/api/auth${path}`);
let n = 0;
const email = () => `access-test-${Date.now()}-${n++}@example.test`;
const tokenIn = (text: string, kind: 'verify-email' | 'reset-password') => new RegExp(`#/${kind}/([A-Za-z0-9_-]{43})`).exec(text)?.[1] ?? '';
const last = () => outbox[outbox.length - 1];

async function cleanup() {
  await pool.query(`DELETE FROM patient_profiles WHERE email LIKE 'access-test-%@example.test'`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'access-test-%@example.test'`);
}
beforeEach(() => clearOutbox());
afterEach(cleanup);
afterAll(cleanup);

async function register(e: string, extra: Record<string, unknown> = {}) {
  return api('/register').send({ email: e, password: PW, fullName: 'Layla Hassan', lang: 'en', ...extra });
}
async function registerAndVerify(e: string) {
  await register(e);
  await api('/verify-email').send({ token: tokenIn(last().text, 'verify-email') });
}

describe('input rules', () => {
  it('accepts sensible emails and strong passwords only', () => {
    expect(isEmailAddress('a@b.co')).toBe(true);
    expect(isEmailAddress('a b@c.com')).toBe(false);
    expect(isEmailAddress('nope')).toBe(false);
    expect(isStrongPassword('abcdefg1')).toBe(true);
    expect(isStrongPassword('short1')).toBe(false);
    expect(isStrongPassword('allletters')).toBe(false);
    expect(isStrongPassword('12345678')).toBe(false);
    expect(isStrongPassword('a1' + 'x'.repeat(80))).toBe(false); // longer than bcrypt reads
  });
  it('rejects bad registrations with a field and sends nothing', async () => {
    expect((await register('not-an-email')).body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { field: 'email' } });
    expect((await register(email(), { fullName: 'x' })).body.error.details.field).toBe('fullName');
    expect((await register(email(), { password: 'weak' })).body.error).toMatchObject({ code: 'WEAK_PASSWORD', details: { field: 'password' } });
    expect(outbox).toHaveLength(0);
  });
});

describe('sign-up with a real email', () => {
  it('creates an unconfirmed account and mails a link; sign-in waits for the confirmation', async () => {
    const e = email();
    const res = await register(e);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: { accepted: true } }); // no token, no hint
    expect(outbox).toHaveLength(1);
    expect(last().to).toBe(e);
    expect(last().text).toMatch(/#\/verify-email\/[A-Za-z0-9_-]{43}/);
    expect(last().text).not.toContain('?token='); // the token lives in the fragment

    const before = await api('/login').send({ email: e, password: PW });
    expect(before.status).toBe(403);
    expect(before.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(before.body.data).toBeUndefined();

    const profile = await pool.query('SELECT national_id, date_of_birth, gender, phone FROM patient_profiles WHERE email = $1', [e]);
    expect(profile.rows[0]).toEqual({ national_id: null, date_of_birth: null, gender: null, phone: null }); // never invented
  });

  it('confirms with the link, once, and then signs in with a patient profile', async () => {
    const e = email();
    await register(e);
    const token = tokenIn(last().text, 'verify-email');
    expect((await api('/verify-email').send({ token })).body).toEqual({ success: true, data: { verified: true } });
    expect((await api('/verify-email').send({ token })).body.error.code).toBe('LINK_INVALID'); // single use

    const login = await api('/login').send({ email: e, password: PW });
    expect(login.status).toBe(200);
    expect(login.body.data.user.patientProfileId).toBeTruthy();
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
  });

  it('stores only a hash of each link token', async () => {
    const e = email();
    await register(e);
    const token = tokenIn(last().text, 'verify-email');
    const rows = await pool.query(`SELECT token_hash, purpose, expires_at > NOW() AS live FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = $1`, [e]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].token_hash).toHaveLength(64);
    expect(rows.rows[0].token_hash).not.toContain(token);
    expect(rows.rows[0]).toMatchObject({ purpose: 'verify_email', live: true });
  });

  it('rejects a wrong, malformed or expired link the same way', async () => {
    const e = email();
    await register(e);
    const token = tokenIn(last().text, 'verify-email');
    expect((await api('/verify-email').send({ token: 'x'.repeat(43) })).body.error.code).toBe('LINK_INVALID');
    expect((await api('/verify-email').send({ token: 'short' })).body.error.code).toBe('LINK_INVALID');
    await pool.query(`UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = (SELECT id FROM users WHERE email = $1)`, [e]);
    expect((await api('/verify-email').send({ token })).body.error.code).toBe('LINK_INVALID');
  });

  it('registering a confirmed address again changes nothing and mails the owner instead', async () => {
    const e = email();
    await registerAndVerify(e);
    clearOutbox();
    const again = await register(e, { password: 'Intruder99pw' });
    expect(again.status).toBe(202);
    expect(again.body).toEqual({ success: true, data: { accepted: true } }); // same answer as a new address
    expect(last().subject).toMatch(/already have/i);
    expect(last().text).not.toMatch(/verify-email|reset-password/); // no way in by email
    expect((await api('/login').send({ email: e, password: PW })).status).toBe(200); // the owner's password still works
    expect((await api('/login').send({ email: e, password: 'Intruder99pw' })).status).toBe(401);
  });

  it('an unconfirmed registration is replaced by the latest one, and only the newest link works', async () => {
    const e = email();
    await register(e);
    const first = tokenIn(last().text, 'verify-email');
    await register(e, { password: NEW_PW });
    const second = tokenIn(last().text, 'verify-email');
    expect(second).not.toBe(first);
    expect((await api('/verify-email').send({ token: first })).body.error.code).toBe('LINK_INVALID');
    await api('/verify-email').send({ token: second });
    expect((await api('/login').send({ email: e, password: PW })).status).toBe(401);
    expect((await api('/login').send({ email: e, password: NEW_PW })).status).toBe(200);
  });

  it('resends the confirmation only to an unconfirmed account, answering the same either way', async () => {
    const unconfirmed = email();
    await register(unconfirmed);
    clearOutbox();
    const a = await api('/resend-verification').send({ email: unconfirmed });
    expect(outbox).toHaveLength(1);
    const b = await api('/resend-verification').send({ email: email() });
    expect(outbox).toHaveLength(1);
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(b.body).toEqual(a.body);
  });

  it('writes Arabic emails when the page was in Arabic', async () => {
    await register(email(), { lang: 'ar' });
    expect(last().subject).toMatch(/[؀-ۿ]/);
    expect(last().html).toContain('dir="rtl"');
  });
});

describe('forgot and reset password', () => {
  it('answers the same for a known and an unknown address, and mails only the known one', async () => {
    const known = email();
    await registerAndVerify(known);
    clearOutbox();
    const a = await api('/forgot-password').send({ email: known, lang: 'en' });
    expect(outbox).toHaveLength(1);
    expect(last().text).toMatch(/#\/reset-password\/[A-Za-z0-9_-]{43}/);
    const b = await api('/forgot-password').send({ email: email(), lang: 'en' });
    expect(outbox).toHaveLength(1);
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(b.body).toEqual(a.body);
  });

  it('chooses a new password with the link, once, and signs out sessions that were open', async () => {
    const e = email();
    await registerAndVerify(e);
    const old = (await api('/login').send({ email: e, password: PW })).body.data.token;
    await new Promise((r) => setTimeout(r, 1100)); // tokens are dated to the second

    clearOutbox();
    await api('/forgot-password').send({ email: e, lang: 'en' });
    const token = tokenIn(last().text, 'reset-password');

    expect((await api('/reset-password').send({ token, newPassword: 'weak' })).body.error.code).toBe('WEAK_PASSWORD');
    const done = await api('/reset-password').send({ token, newPassword: NEW_PW, lang: 'en' });
    expect(done.body).toEqual({ success: true, data: { reset: true } });
    expect((await api('/reset-password').send({ token, newPassword: 'Third3Password' })).body.error.code).toBe('LINK_INVALID'); // once

    expect((await api('/login').send({ email: e, password: PW })).status).toBe(401);
    expect((await api('/login').send({ email: e, password: NEW_PW })).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${old}`)).status).toBe(401); // the earlier session is gone
    expect(outbox.some((m) => /password was changed/i.test(m.subject))).toBe(true); // and the owner is told
  });

  it('a reset link also proves the address, so an unconfirmed account can sign in afterwards', async () => {
    const e = email();
    await register(e);
    clearOutbox();
    await api('/forgot-password').send({ email: e });
    await api('/reset-password').send({ token: tokenIn(last().text, 'reset-password'), newPassword: NEW_PW });
    expect((await api('/login').send({ email: e, password: NEW_PW })).status).toBe(200);
  });

  it('a newer reset email cancels the older link; an expired link is refused', async () => {
    const e = email();
    await registerAndVerify(e);
    clearOutbox();
    await api('/forgot-password').send({ email: e });
    const older = tokenIn(last().text, 'reset-password');
    await api('/forgot-password').send({ email: e });
    const newer = tokenIn(last().text, 'reset-password');
    expect((await api('/reset-password').send({ token: older, newPassword: NEW_PW })).body.error.code).toBe('LINK_INVALID');
    await pool.query(`UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = (SELECT id FROM users WHERE email = $1)`, [e]);
    expect((await api('/reset-password').send({ token: newer, newPassword: NEW_PW })).body.error.code).toBe('LINK_INVALID');
  });

  it('limits how often one address can be asked about', async () => {
    const e = email();
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await api('/forgot-password').send({ email: e })).status);
    expect(codes).toEqual([202, 202, 202, 429]);
  });
});

describe('when email is not configured', () => {
  const saved = { env: ENV.NODE_ENV, host: ENV.SMTP_HOST };
  afterEach(() => {
    ENV.NODE_ENV = saved.env;
    ENV.SMTP_HOST = saved.host;
  });
  it('says so plainly instead of pretending, in production without SMTP', async () => {
    ENV.NODE_ENV = 'production';
    ENV.SMTP_HOST = '';
    expect(mailMode()).toBe('off');
    for (const [path, body] of [['/register', { email: email(), password: PW, fullName: 'Layla Hassan' }], ['/forgot-password', { email: email() }], ['/resend-verification', { email: email() }]] as const) {
      const res = await api(path).send(body);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('EMAIL_NOT_CONFIGURED');
    }
    const created = await pool.query(`SELECT 1 FROM users WHERE email LIKE 'access-test-%@example.test'`);
    expect(created.rowCount).toBe(0);
  });
  it('reports the mode, and uses SMTP only when it is configured', async () => {
    ENV.SMTP_HOST = '';
    expect((await request(app).get('/api/auth/access-status')).body.data.mail).toBe('dev');
    ENV.SMTP_HOST = 'smtp.example.test';
    expect(mailMode()).toBe('smtp');
  });
});

describe('existing accounts are untouched', () => {
  it('the seeded demo patient still signs in without confirming anything', async () => {
    expect((await api('/login').send({ email: 'patient@naseej.health', password: 'Password123!' })).status).toBe(200);
  });
});
