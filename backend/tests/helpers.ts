import request from 'supertest';
import { app } from '../src/app.js';

/** The one seeded center and the staff accounts exist only to prove staff cannot use the patient API. */
export const NOOR = '11111111-1111-1111-1111-111111111111';
export const PATIENT_1 = '10000000-0000-0000-0000-000000000001'; // Mohammed Al-Mansoor, the demo patient
export const DOCTOR_NOOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
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
  doctorNoor: () => tokenFor('doctor.noor@naseej.health'),
  receptionNoor: () => tokenFor('reception.noor@naseej.health'),
  patient: () => tokenFor('patient@naseej.health'),
};

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** A supertest call carrying the bearer token and, when given, the active-center header. */
export function call(method: Method, path: string, token: string, orgId?: string) {
  let r = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  if (orgId) r = r.set('X-Organization-Id', orgId);
  return r;
}

/** Smallest valid PDF-looking buffer (the server checks magic bytes, not content). */
export const tinyPdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n').toString('base64');
export const tinyPngBase64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');
