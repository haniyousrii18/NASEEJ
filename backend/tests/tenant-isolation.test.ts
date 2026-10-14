import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Tenant Isolation & Cross-Center Security (AC-04 & FR-023)', () => {
  let noorDoctorToken: string;
  let amalDoctorToken: string;
  const noorOrgId = '11111111-1111-1111-1111-111111111111';
  const amalOrgId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    // Login as Al-Noor doctor
    const noorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doctor.noor@naseej.health', password: 'Password123!' });
    noorDoctorToken = noorLogin.body.data.token;

    // Login as Al-Amal doctor
    const amalLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doctor.amal@naseej.health', password: 'Password123!' });
    amalDoctorToken = amalLogin.body.data.token;
  });

  it('should reject request when Al-Noor doctor attempts to pass Al-Amal X-Organization-Id', async () => {
    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${noorDoctorToken}`)
      .set('X-Organization-Id', amalOrgId); // Manipulated header!

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN_CROSS_TENANT');
  });

  it('should allow Al-Noor doctor to query patients in their own center', async () => {
    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${noorDoctorToken}`)
      .set('X-Organization-Id', noorOrgId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should prevent Al-Amal doctor from accessing Al-Noor clinical visits', async () => {
    // Al-Noor visit ID
    const noorVisitId = '40000000-0000-0000-0000-000000000001';

    // Doctor at Al-Amal requests this visit ID under their own tenant header
    const res = await request(app)
      .get(`/api/visits/${noorVisitId}`)
      .set('Authorization', `Bearer ${amalDoctorToken}`)
      .set('X-Organization-Id', amalOrgId);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VISIT_NOT_FOUND');
  });
});
