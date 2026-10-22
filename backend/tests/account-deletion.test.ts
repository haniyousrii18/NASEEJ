import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { deleteAccount, planAccountDeletion } from '../src/services/accountDeletion.js';
import { clearOutbox, outbox } from '../src/services/mail/mail.js';

const PW = 'Sup3rSecret1';
const api = (path: string) => request(app).post(`/api/auth${path}`);
let n = 0;
const email = () => `delete-test-${Date.now()}-${n++}@example.test`;

async function signUp(e: string) {
  await api('/register').send({ email: e, password: PW, fullName: 'Delete Me', lang: 'en' });
  const token = /#\/verify-email\/([A-Za-z0-9_-]{43})/.exec(outbox[outbox.length - 1].text)![1];
  await api('/verify-email').send({ token });
  return (await api('/login').send({ email: e, password: PW })).body.data.token as string;
}

beforeEach(() => clearOutbox());
afterAll(async () => {
  await pool.query(`DELETE FROM patient_profiles WHERE email LIKE 'delete-test-%@example.test'`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'delete-test-%@example.test'`);
});

describe('deleting a self-registered account', () => {
  it('plans first (counting what it holds) and deletes nothing until it is applied', async () => {
    const e = email();
    const token = await signUp(e);
    await request(app).post('/api/record/symptoms').set('Authorization', `Bearer ${token}`).send({ symptom_description: 'to be deleted', severity: 3, onset_date: '2026-10-20' });

    const plan = await planAccountDeletion(e);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.counts.symptoms).toBe(1);
    expect((await pool.query('SELECT 1 FROM users WHERE id = $1', [plan.userId])).rowCount).toBe(1); // still there
  });

  it('removes the account, its profile and its data, and the email can register again', async () => {
    const e = email();
    const token = await signUp(e);
    await request(app).post('/api/record/symptoms').set('Authorization', `Bearer ${token}`).send({ symptom_description: 'to be deleted', severity: 3, onset_date: '2026-10-20' });

    const plan = await planAccountDeletion(e);
    if (!plan.ok) throw new Error('expected a plan');
    await deleteAccount(plan);

    expect((await pool.query('SELECT 1 FROM users WHERE id = $1', [plan.userId])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM patient_profiles WHERE id = $1', [plan.patientId])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM symptom_reports WHERE patient_id = $1', [plan.patientId])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM auth_tokens WHERE user_id = $1', [plan.userId])).rowCount).toBe(0);
    expect((await api('/login').send({ email: e, password: PW })).status).toBe(401);

    clearOutbox();
    expect((await api('/register').send({ email: e, password: PW, fullName: 'Delete Me', lang: 'en' })).status).toBe(202);
    expect(outbox[outbox.length - 1].subject).toMatch(/confirm/i); // a brand-new account, not "you already have one"
  });

  it('refuses the demo patient and any account not made by the sign-up screen', async () => {
    expect(await planAccountDeletion('patient@naseej.health')).toEqual({ ok: false, reason: 'not_self_registered' });
    expect(await planAccountDeletion('admin@naseej.health')).toEqual({ ok: false, reason: 'not_self_registered' });
    expect((await pool.query(`SELECT 1 FROM users WHERE email = 'patient@naseej.health'`)).rowCount).toBe(1);
  });

  it('says plainly when there is no such account, whatever the letter case', async () => {
    expect(await planAccountDeletion('nobody-here@example.test')).toEqual({ ok: false, reason: 'not_found' });
    const e = email();
    await signUp(e);
    expect((await planAccountDeletion(e.toUpperCase())).ok).toBe(true);
  });
});
