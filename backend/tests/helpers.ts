import request from 'supertest';
import { app } from '../src/app.js';

export const NOOR = '11111111-1111-1111-1111-111111111111';
export const AMAL = '22222222-2222-2222-2222-222222222222';
export const PATIENT_1 = '10000000-0000-0000-0000-000000000001'; // registered at Al-Noor and Al-Amal
export const PATIENT_2 = '10000000-0000-0000-0000-000000000002'; // registered at Al-Noor only
export const DOCTOR_NOOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
export const DOCTOR_AMAL = '99999999-9999-9999-9999-999999999999';
export const DRAFT_VISIT_NOOR = '40000000-0000-0000-0000-000000000002';
export const APPROVED_VISIT_NOOR = '40000000-0000-0000-0000-000000000001';
export const APPROVED_VISIT_AMAL = '40000000-0000-0000-0000-0000000000a1';
export const SEEDED_CONSENT = '70000000-0000-0000-0000-000000000001';
export const SEEDED_CASE = '90000000-0000-0000-0000-000000000001';
export const PASSWORD = 'Password123!';

const tokens = new Map<string, string>();

/** Logs a synthetic demo account in once per test file and caches the token. */
export async function tokenFor(email: string, password = PASSWORD): Promise<string> {
  const key = `${email}|${password}`;
  const cached = tokens.get(key);
  if (cached) return cached;
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  tokens.set(key, res.body.data.token);
  return res.body.data.token;
}

export const as = {
  admin: () => tokenFor('admin@naseej.health'),
  managerNoor: () => tokenFor('manager.noor@naseej.health'),
  managerAmal: () => tokenFor('manager.amal@naseej.health'),
  doctorNoor: () => tokenFor('doctor.noor@naseej.health'),
  doctorAmal: () => tokenFor('doctor.amal@naseej.health'),
  receptionNoor: () => tokenFor('reception.noor@naseej.health'),
  coordinatorNoor: () => tokenFor('coordinator.noor@naseej.health'),
  patient: () => tokenFor('patient@naseej.health'),
};

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** A supertest call carrying the bearer token and, when given, the active-center header. */
export function call(method: Method, path: string, token: string, orgId?: string) {
  let r = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  if (orgId) r = r.set('X-Organization-Id', orgId);
  return r;
}

/** A future date that varies per run, so repeated runs on one database do not collide on booked slots. */
export function futureDate(offsetDays = 40): string {
  const d = new Date(Date.now() + (offsetDays + Math.floor(Math.random() * 300)) * 86400000);
  return d.toISOString().slice(0, 10);
}

/** A calendar day safely in the past, randomised so repeated runs do not collide on the same slot. */
export function pastDate(offsetDays = 30): string {
  const d = new Date(Date.now() - (offsetDays + Math.floor(Math.random() * 300)) * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Smallest valid PDF-looking buffer (the server checks magic bytes, not content). */
export const tinyPdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n').toString('base64');
export const tinyPngBase64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');
