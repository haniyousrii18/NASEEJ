import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/config/db.js';
import { AMAL, DOCTOR_NOOR, NOOR, PATIENT_1, PATIENT_2, as, call, futureDate } from './helpers.js';

describe('Role boundaries on patient and appointment data', () => {
  it('refuses a center-linked patient on the staff patient list and appointment list', async () => {
    const patient = await as.patient();
    for (const path of ['/api/patients', '/api/appointments', '/api/appointments/schedules']) {
      const res = await call('get', path, patient, NOOR);
      expect(res.status, path).toBe(403);
    }
  });

  it('refuses the platform administrator on operational patient and appointment data', async () => {
    const admin = await as.admin();
    for (const path of ['/api/patients', '/api/appointments']) {
      const res = await call('get', path, admin, NOOR);
      expect(res.status, path).toBe(403);
    }
  });

  it('refuses the center manager on the patient list and gives only non-clinical appointment fields', async () => {
    const manager = await as.managerNoor();
    expect((await call('get', '/api/patients', manager, NOOR)).status).toBe(403);

    const appts = await call('get', '/api/appointments', manager, NOOR);
    expect(appts.status).toBe(200);
    expect(appts.body.data.length).toBeGreaterThan(0);
    for (const a of appts.body.data) {
      expect(a).not.toHaveProperty('reason');
      expect(a).not.toHaveProperty('patient_phone');
    }
  });

  it('gives reception identity and contact data only: no blood type, no allergies', async () => {
    const reception = await as.receptionNoor();
    const list = await call('get', '/api/patients', reception, NOOR);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    for (const p of list.body.data) expect(p).not.toHaveProperty('blood_type');

    const one = await call('get', `/api/patients/${PATIENT_1}`, reception, NOOR);
    expect(one.status).toBe(200);
    expect(one.body.data).not.toHaveProperty('allergies');
    expect(one.body.data).not.toHaveProperty('blood_type');
    expect(one.body.data.mrn).toBeDefined();

    expect((await call('get', `/api/patients/${PATIENT_1}/allergies`, reception, NOOR)).status).toBe(403);
    const post = await call('post', `/api/patients/${PATIENT_1}/allergies`, reception, NOOR).send({ allergen_ar: 'x', allergen_en: 'x', severity: 'mild' });
    expect(post.status).toBe(403);
  });

  it('keeps clinical detail for the treating doctor', async () => {
    const doctor = await as.doctorNoor();
    const one = await call('get', `/api/patients/${PATIENT_1}`, doctor, NOOR);
    expect(one.status).toBe(200);
    expect(Array.isArray(one.body.data.allergies)).toBe(true);
  });

  it('does not let a doctor read allergies of a patient who is not registered at their center', async () => {
    // Patient 2 is registered at Al-Noor only. An Al-Amal doctor knows the id but has no link.
    const amalDoctor = await as.doctorAmal();
    const res = await call('get', `/api/patients/${PATIENT_2}/allergies`, amalDoctor, AMAL);
    expect(res.status).toBe(404);
    const write = await call('post', `/api/patients/${PATIENT_2}/allergies`, amalDoctor, AMAL).send({ allergen_ar: 'x', allergen_en: 'x', severity: 'mild' });
    expect(write.status).toBe(404);
  });
});

describe('Clinical content is limited to the treating clinician and the patient', () => {
  const clinicalReads = (patientId: string) => [
    `/api/visits?patientId=${patientId}`,
    `/api/prescriptions?patientId=${patientId}`,
    `/api/labs/orders?patientId=${patientId}`,
  ];

  it('refuses reception, the center manager and the care coordinator on every clinical read', async () => {
    const tokens = [await as.receptionNoor(), await as.managerNoor(), await as.coordinatorNoor()];
    for (const token of tokens) {
      for (const path of clinicalReads(PATIENT_1)) {
        const res = await call('get', path, token, NOOR);
        expect(res.status, path).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
      }
    }
  });

  it('records a blocked clinical read in the audit log', async () => {
    const reception = await as.receptionNoor();
    await call('get', `/api/visits?patientId=${PATIENT_1}`, reception, NOOR);
    await new Promise((r) => setTimeout(r, 150));
    const rows = await query(`SELECT 1 FROM audit_logs WHERE action = 'SECURITY_CLINICAL_READ_BLOCKED' AND actor_email = 'reception.noor@naseej.health'`);
    expect(rows.rowCount).toBeGreaterThan(0);
  });

  it('still lets the doctor read, and the patient read only their own approved records', async () => {
    const doctor = await as.doctorNoor();
    const docVisits = await call('get', `/api/visits?patientId=${PATIENT_1}`, doctor, NOOR);
    expect(docVisits.status).toBe(200);
    expect(docVisits.body.data.some((v: any) => v.status === 'draft')).toBe(true);

    const patient = await as.patient();
    const own = await call('get', '/api/visits', patient, NOOR);
    expect(own.status).toBe(200);
    expect(own.body.data.every((v: any) => v.status === 'approved')).toBe(true);
  });
});

describe('Writes are validated against the center, not just the role', () => {
  it('rejects a lab result from reception and one aimed at another center\'s order', async () => {
    const reception = await as.receptionNoor();
    const byReception = await call('post', '/api/labs/orders/60000000-0000-0000-0000-000000000001/results', reception, NOOR).send({
      parameter_name: 'X',
      value: '1',
      unit: 'u',
    });
    expect(byReception.status).toBe(403);

    // An Al-Amal doctor tries to attach a result to an Al-Noor order.
    const amalDoctor = await as.doctorAmal();
    const cross = await call('post', '/api/labs/orders/60000000-0000-0000-0000-000000000001/results', amalDoctor, AMAL).send({
      parameter_name: 'X',
      value: '1',
      unit: 'u',
    });
    expect(cross.status).toBe(404);
    expect(cross.body.error.code).toBe('LAB_ORDER_NOT_FOUND');
  });

  it('rejects a visit, prescription or lab order for a patient who is not registered at the center', async () => {
    const amalDoctor = await as.doctorAmal();
    const visit = await call('post', '/api/visits', amalDoctor, AMAL).send({ patient_id: PATIENT_2, chief_complaint: 'x', diagnosis: 'x' });
    expect(visit.status).toBe(404);
    const lab = await call('post', '/api/labs/orders', amalDoctor, AMAL).send({ patient_id: PATIENT_2, test_name_ar: 'x', test_name_en: 'x' });
    expect(lab.status).toBe(404);
    const rx = await call('post', '/api/prescriptions', amalDoctor, AMAL).send({
      patient_id: PATIENT_2,
      visit_id: '40000000-0000-0000-0000-000000000001',
      items: [{ medication_name: 'x', dosage: '1', frequency: '1', duration: '1' }],
    });
    expect(rx.status).toBe(404);
  });

  it('keeps the draft to approval flow: only the doctor approves, and only inside their center', async () => {
    const reception = await as.receptionNoor();
    const denied = await call('post', '/api/visits/40000000-0000-0000-0000-000000000002/approve', reception, NOOR);
    expect(denied.status).toBe(403);
    const amalDoctor = await as.doctorAmal();
    const otherCenter = await call('post', '/api/visits/40000000-0000-0000-0000-000000000002/approve', amalDoctor, AMAL);
    expect(otherCenter.status).toBe(404);
  });
});

describe('Appointments: validation, state machine, availability and concurrency', () => {
  it('validates the booking payload and ties it to the center', async () => {
    const reception = await as.receptionNoor();
    const day = futureDate();
    const base = { patient_id: PATIENT_1, clinician_id: DOCTOR_NOOR, appointment_date: day, start_time: '09:00', end_time: '09:30' };

    expect((await call('post', '/api/appointments', reception, NOOR).send({ ...base, end_time: '08:30' })).status).toBe(400);
    expect((await call('post', '/api/appointments', reception, NOOR).send({ ...base, appointment_date: '2026-13-45' })).status).toBe(400);
    expect((await call('post', '/api/appointments', reception, NOOR).send({ ...base, patient_id: 'not-a-uuid' })).status).toBe(400);

    // A patient who is not registered here, and a "clinician" who is not a doctor of this center.
    const unlinked = await call('post', '/api/appointments', await as.doctorAmal(), AMAL).send({ ...base, patient_id: PATIENT_2, clinician_id: '99999999-9999-9999-9999-999999999999' });
    expect(unlinked.status).toBe(404);
    const notDoctor = await call('post', '/api/appointments', reception, NOOR).send({ ...base, clinician_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' });
    expect(notDoctor.status).toBe(400);
    expect(notDoctor.body.error.code).toBe('INVALID_CLINICIAN');
  });

  it('lets exactly one of two simultaneous bookings for the same slot succeed', async () => {
    const reception = await as.receptionNoor();
    const body = { patient_id: PATIENT_1, clinician_id: DOCTOR_NOOR, appointment_date: futureDate(), start_time: '13:00', end_time: '13:30' };
    const results = await Promise.all([
      call('post', '/api/appointments', reception, NOOR).send(body),
      call('post', '/api/appointments', reception, NOOR).send({ ...body, patient_id: PATIENT_2 }),
      call('post', '/api/appointments', reception, NOOR).send({ ...body, start_time: '13:10', end_time: '13:40' }),
    ]);
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(2);
  });

  it('reports slots confirmed by the server, marking booked ones unavailable', async () => {
    const reception = await as.receptionNoor();
    // Pick a weekday the seeded schedule covers (Sunday to Thursday, 09:00 to 15:00, 30-minute slots).
    let day = futureDate();
    while ([5, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) day = futureDate();

    const before = await call('get', `/api/appointments/availability?clinicianId=${DOCTOR_NOOR}&date=${day}`, reception, NOOR);
    expect(before.status).toBe(200);
    expect(before.body.data.working).toBe(true);
    const slot = before.body.data.slots.find((s: any) => s.start_time === '10:00');
    expect(slot.available).toBe(true);

    const book = await call('post', '/api/appointments', reception, NOOR).send({
      patient_id: PATIENT_1,
      clinician_id: DOCTOR_NOOR,
      appointment_date: day,
      start_time: '10:00',
      end_time: '10:30',
    });
    expect(book.status).toBe(201);

    const after = await call('get', `/api/appointments/availability?clinicianId=${DOCTOR_NOOR}&date=${day}`, reception, NOOR);
    expect(after.body.data.slots.find((s: any) => s.start_time === '10:00').available).toBe(false);
    expect(after.body.data.slots.find((s: any) => s.start_time === '10:30').available).toBe(true);

    expect((await call('get', `/api/appointments/availability?clinicianId=${DOCTOR_NOOR}&date=garbage`, reception, NOOR)).status).toBe(400);
  });

  it('enforces transitions and which role may make them', async () => {
    const reception = await as.receptionNoor();
    const doctor = await as.doctorNoor();
    const created = await call('post', '/api/appointments', reception, NOOR).send({
      patient_id: PATIENT_1,
      clinician_id: DOCTOR_NOOR,
      appointment_date: futureDate(),
      start_time: '14:00',
      end_time: '14:30',
    });
    const id = created.body.data.id;

    // Reception cannot start a consultation; a confirmed appointment cannot jump to completed.
    expect((await call('patch', `/api/appointments/${id}/status`, reception, NOOR).send({ status: 'in_consultation' })).status).toBe(403);
    expect((await call('patch', `/api/appointments/${id}/status`, doctor, NOOR).send({ status: 'completed' })).status).toBe(409);

    expect((await call('patch', `/api/appointments/${id}/check-in`, reception, NOOR)).status).toBe(200);
    // Checking in twice is an invalid transition, not a silent overwrite.
    expect((await call('patch', `/api/appointments/${id}/check-in`, reception, NOOR)).status).toBe(409);
    expect((await call('patch', `/api/appointments/${id}/status`, doctor, NOOR).send({ status: 'in_consultation' })).status).toBe(200);
    expect((await call('patch', `/api/appointments/${id}/status`, doctor, NOOR).send({ status: 'completed' })).status).toBe(200);
    expect((await call('patch', `/api/appointments/${id}/status`, reception, NOOR).send({ status: 'cancelled' })).status).toBe(409);
    expect((await call('patch', `/api/appointments/${id}/status`, reception, NOOR).send({ status: 'bogus' })).status).toBe(400);
  });

  it('shows a doctor only their own appointments and blocks cross-center changes', async () => {
    const doctor = await as.doctorNoor();
    const res = await call('get', '/api/appointments?clinicianId=99999999-9999-9999-9999-999999999999', doctor, NOOR);
    expect(res.status).toBe(200);
    expect(res.body.data.every((a: any) => a.clinician_id === DOCTOR_NOOR)).toBe(true);

    const amalReception = await as.managerAmal();
    const cross = await call('patch', '/api/appointments/30000000-0000-0000-0000-000000000001/status', amalReception, AMAL).send({ status: 'cancelled' });
    expect(cross.status).toBe(404);
  });

  it('lets only a center manager manage schedules, and rejects overlapping windows', async () => {
    const manager = await as.managerNoor();
    const reception = await as.receptionNoor();
    const window = { clinician_id: DOCTOR_NOOR, day_of_week: 5, start_time: '09:00', end_time: '12:00', slot_duration_minutes: 30 };

    expect((await call('post', '/api/appointments/schedules', reception, NOOR).send(window)).status).toBe(403);
    const created = await call('post', '/api/appointments/schedules', manager, NOOR).send(window);
    expect(created.status).toBe(201);
    expect((await call('post', '/api/appointments/schedules', manager, NOOR).send({ ...window, start_time: '11:00', end_time: '13:00' })).status).toBe(409);
    expect((await call('post', '/api/appointments/schedules', manager, NOOR).send({ ...window, clinician_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' })).status).toBe(400);

    const off = await call('patch', `/api/appointments/schedules/${created.body.data.id}`, manager, NOOR).send({ is_active: false });
    expect(off.status).toBe(200);
    // Another center's manager cannot reach it.
    expect((await call('patch', `/api/appointments/schedules/${created.body.data.id}`, await as.managerAmal(), AMAL).send({ is_active: true })).status).toBe(404);
  });
});

describe('A suspended center is closed to its staff and patients', () => {
  it('blocks the center on its next request and reopens when reactivated', async () => {
    const admin = await as.admin();
    const doctor = await as.doctorAmal();
    expect((await call('get', '/api/patients', doctor, AMAL)).status).toBe(200);

    const suspend = await call('patch', `/api/organizations/${AMAL}`, admin).send({ status: 'suspended' });
    expect(suspend.status).toBe(200);
    const blocked = await call('get', '/api/patients', doctor, AMAL);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ORGANIZATION_SUSPENDED');

    expect((await call('patch', `/api/organizations/${AMAL}`, admin).send({ status: 'active' })).status).toBe(200);
    expect((await call('get', '/api/patients', doctor, AMAL)).status).toBe(200);

    expect((await call('patch', `/api/organizations/${AMAL}`, doctor).send({ status: 'suspended' })).status).toBe(403);
    expect((await call('patch', `/api/organizations/${AMAL}`, admin).send({ status: 'nonsense' })).status).toBe(400);
  });
});

describe('Request handling', () => {
  it('answers malformed JSON with a client error, not a server error', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
