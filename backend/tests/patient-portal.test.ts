import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Patient Portal Privacy & Draft Concealment (AC-03 & AC-07)', () => {
  let patientToken: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient@naseej.health', password: 'Password123!' });
    patientToken = loginRes.body.data.token;
  });

  it('should return longitudinal health summary containing only APPROVED clinical records', async () => {
    const res = await request(app)
      .get('/api/portal/summary')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile).toBeDefined();

    // Verify all returned visits have status = 'approved'
    const visits = res.body.data.visits;
    expect(visits.length).toBeGreaterThan(0);
    visits.forEach((v: any) => {
      expect(v.status).toBe('approved');
    });

    // Verify all returned lab results have status = 'approved'
    const labs = res.body.data.labResults;
    expect(labs.length).toBeGreaterThan(0);
    labs.forEach((l: any) => {
      expect(l.status).toBe('approved');
    });
  });

  it('no longer exposes the retired clinic-platform endpoints', async () => {
    for (const [method, path] of [['get', '/api/visits'], ['get', '/api/appointments'], ['get', '/api/portal/messages'], ['post', '/api/portal/appointments'], ['get', '/api/admin/centers'], ['get', '/api/doctor/queue'], ['get', '/api/portal/consents']] as const) {
      const res = await request(app)[method](path).set('Authorization', `Bearer ${patientToken}`);
      expect(res.status, path).toBe(404);
    }
  });
});
