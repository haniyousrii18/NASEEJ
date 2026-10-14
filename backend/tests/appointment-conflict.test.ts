import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Appointment Booking & Server-Side Conflict Prevention (AC-02 & FR-042)', () => {
  let receptionToken: string;
  const orgId = '11111111-1111-1111-1111-111111111111';
  const clinicianId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const patientId = '10000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    const receptionLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reception.noor@naseej.health', password: 'Password123!' });
    receptionToken = receptionLogin.body.data.token;
  });

  const testDate = `2026-12-${String(Math.floor(Math.random() * 25) + 1).padStart(2, '0')}`;

  it('should successfully book an appointment for an open slot', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${receptionToken}`)
      .set('X-Organization-Id', orgId)
      .send({
        patient_id: patientId,
        clinician_id: clinicianId,
        appointment_date: testDate,
        start_time: '14:00',
        end_time: '14:30',
        reason: 'Follow-up consultation',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('confirmed');
  });

  it('should reject double-booking the same clinician at overlapping time slot', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${receptionToken}`)
      .set('X-Organization-Id', orgId)
      .send({
        patient_id: '10000000-0000-0000-0000-000000000002',
        clinician_id: clinicianId,
        appointment_date: testDate,
        start_time: '14:15', // Overlaps with 14:00-14:30!
        end_time: '14:45',
        reason: 'Conflicting appointment attempt',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('APPOINTMENT_CONFLICT');
  });

  it('should allow reception staff to record patient check-in', async () => {
    const appointmentId = '30000000-0000-0000-0000-000000000002'; // existing confirmed appointment

    const res = await request(app)
      .patch(`/api/appointments/${appointmentId}/check-in`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .set('X-Organization-Id', orgId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('checked_in');
    expect(res.body.data.check_in_time).toBeDefined();
  });
});
