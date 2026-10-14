import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Patient Portal Privacy & Draft Concealment (AC-03 & AC-07)', () => {
  let patientToken: string;
  const orgId = '11111111-1111-1111-1111-111111111111';

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

  it('should block patient from directly accessing unapproved visit draft', async () => {
    const draftVisitId = '40000000-0000-0000-0000-000000000002'; // Draft visit in seeds

    const res = await request(app)
      .get(`/api/visits/${draftVisitId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .set('X-Organization-Id', orgId);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VISIT_NOT_AVAILABLE');
  });

  it('should allow patient to submit a question/message to the medical center', async () => {
    const res = await request(app)
      .post('/api/portal/messages')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        organization_id: orgId,
        subject: 'Inquiry regarding blood pressure monitoring',
        body: 'Should I measure my blood pressure before or after breakfast?',
        category: 'medical',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('submitted');
  });

  it('should allow patient to log symptoms with severity score', async () => {
    const res = await request(app)
      .post('/api/portal/symptoms')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        organization_id: orgId,
        symptom_description: 'Occasional dizziness after prolonged sitting',
        severity: 4,
        onset_date: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.severity).toBe(4);
  });
});
