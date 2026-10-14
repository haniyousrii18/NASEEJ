import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Role-Based Access Control & Clinical Isolation Wall', () => {
  let adminToken: string;
  let receptionToken: string;
  const orgId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@naseej.health', password: 'Password123!' });
    adminToken = adminLogin.body.data.token;

    const receptionLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reception.noor@naseej.health', password: 'Password123!' });
    receptionToken = receptionLogin.body.data.token;
  });

  it('should block Platform Admin from accessing clinical visits (FR-133 Clinical Wall)', async () => {
    const res = await request(app)
      .get('/api/visits')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Organization-Id', orgId);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL');
  });

  it('should block Platform Admin from accessing prescriptions', async () => {
    const res = await request(app)
      .get('/api/prescriptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Organization-Id', orgId);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL');
  });

  it('should block Receptionist from creating clinical visits', async () => {
    const res = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${receptionToken}`)
      .set('X-Organization-Id', orgId)
      .send({
        patient_id: '10000000-0000-0000-0000-000000000001',
        chief_complaint: 'Headache',
        diagnosis: 'Migraine',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });
});
