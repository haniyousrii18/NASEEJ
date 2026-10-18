import { describe, expect, it } from 'vitest';
import { AMAL, NOOR, as, call } from './helpers.js';

/** A national ID no earlier run has used: repeated runs on one database never meet the same profile. */
const freshNationalId = () => `29${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 14);

const registration = (nationalId: string, over: Record<string, unknown> = {}) => ({
  national_id: nationalId,
  full_name_ar: 'سلمى حسن',
  full_name_en: 'Salma Hassan',
  date_of_birth: '1990-04-12',
  gender: 'female',
  phone: '+201000000000',
  ...over,
});

describe('Patient registration: validation, duplicates and cross-center linking', () => {
  it('registers a patient once per center and refuses a second registration with the existing patient', async () => {
    const reception = await as.receptionNoor();
    const nationalId = freshNationalId();

    const first = await call('post', '/api/patients', reception, NOOR).send(registration(nationalId));
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ isNewProfile: true });
    expect(first.body.data.mrn).toMatch(/^MRN-\d+$/);

    const again = await call('post', '/api/patients', reception, NOOR).send(registration(nationalId));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PATIENT_ALREADY_REGISTERED');
    expect(again.body.error.details).toEqual({ patientId: first.body.data.patientId, mrn: first.body.data.mrn });

    // Each registration at one center gets its own MRN.
    const other = await call('post', '/api/patients', reception, NOOR).send(registration(freshNationalId()));
    expect(other.status).toBe(201);
    expect(other.body.data.mrn).not.toBe(first.body.data.mrn);
  });

  it('links an existing profile to another center only when the date of birth matches, and says nothing about the profile otherwise', async () => {
    const reception = await as.receptionNoor();
    const doctorAmal = await as.doctorAmal();
    const nationalId = freshNationalId();
    expect((await call('post', '/api/patients', reception, NOOR).send(registration(nationalId))).status).toBe(201);

    const wrong = await call('post', '/api/patients', doctorAmal, AMAL).send(registration(nationalId, { date_of_birth: '1991-04-12', full_name_en: 'Someone Else' }));
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe('IDENTITY_MISMATCH');
    expect(JSON.stringify(wrong.body)).not.toMatch(/Salma|سلمى|1990/);

    const linked = await call('post', '/api/patients', doctorAmal, AMAL).send(registration(nationalId));
    expect(linked.status).toBe(201);
    expect(linked.body.data.isNewProfile).toBe(false);
    expect((await call('get', `/api/patients/${linked.body.data.patientId}`, doctorAmal, AMAL)).status).toBe(200);
  });

  it('validates what it is given', async () => {
    const reception = await as.receptionNoor();
    const bad = (over: Record<string, unknown>) => call('post', '/api/patients', reception, NOOR).send(registration(freshNationalId(), over));
    expect((await bad({ gender: 'other' })).status).toBe(400);
    expect((await bad({ date_of_birth: '2999-01-01' })).status).toBe(400);
    expect((await bad({ date_of_birth: '12/04/1990' })).status).toBe(400);
    expect((await bad({ email: 'not-an-email' })).status).toBe(400);
    expect((await bad({ phone: '123' })).status).toBe(400);
    expect((await bad({ full_name_en: 'x' })).status).toBe(400);
    expect((await bad({ national_id: 'a b' })).status).toBe(400);
    expect((await bad({ full_name_ar: 'ا'.repeat(300) })).status).toBe(400);
  });

  it('searches for what was typed, not for wildcards', async () => {
    const reception = await as.receptionNoor();
    const everyone = await call('get', '/api/patients', reception, NOOR);
    expect(everyone.body.data.length).toBeGreaterThan(0);
    for (const term of ['%', '_', '%25%25']) {
      const res = await call('get', `/api/patients?search=${encodeURIComponent(term)}`, reception, NOOR);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
  });
});

describe('Patient contact details: what reception may change', () => {
  it('updates contact details only, validates them, and keeps identity details locked', async () => {
    const reception = await as.receptionNoor();
    const created = await call('post', '/api/patients', reception, NOOR).send(registration(freshNationalId(), { email: 'before@example.com' }));
    const id = created.body.data.patientId;
    const patch = (body: Record<string, unknown>, who = reception, org = NOOR) => call('patch', `/api/patients/${id}`, who, org).send(body);

    const ok = await patch({ phone: '+201111111111', emergency_contact_name: 'Ali Hassan', email: '' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ phone: '+201111111111', emergency_contact_name: 'Ali Hassan', email: null, full_name_en: 'Salma Hassan' });

    // Identity belongs to the shared profile; nothing clinical is touched or returned.
    for (const field of ['full_name_en', 'full_name_ar', 'date_of_birth', 'gender', 'national_id', 'blood_type']) {
      const locked = await patch({ [field]: 'x' });
      expect(locked.status).toBe(400);
      expect(locked.body.error.code).toBe('FIELD_NOT_EDITABLE');
    }
    expect(ok.body.data).not.toHaveProperty('blood_type');

    expect((await patch({})).status).toBe(400);
    expect((await patch({ email: 'nope' })).status).toBe(400);
    expect((await patch({ phone: '12' })).status).toBe(400);
    expect((await patch({ phone: null })).status).toBe(400);
  });

  it('is for reception of the patient’s own center only', async () => {
    const reception = await as.receptionNoor();
    const doctorAmal = await as.doctorAmal();
    const created = await call('post', '/api/patients', doctorAmal, AMAL).send(registration(freshNationalId()));
    const amalOnly = created.body.data.patientId;

    // Not linked to Al-Noor: indistinguishable from a patient that does not exist.
    expect((await call('patch', `/api/patients/${amalOnly}`, reception, NOOR).send({ phone: '+201222222222' })).status).toBe(404);
    expect((await call('patch', '/api/patients/not-an-id', reception, NOOR).send({ phone: '+201222222222' })).status).toBe(404);
    // Doctors and managers do not edit contact details at the front desk.
    expect((await call('patch', `/api/patients/${amalOnly}`, doctorAmal, AMAL).send({ phone: '+201222222222' })).status).toBe(403);
    expect((await call('patch', `/api/patients/${amalOnly}`, await as.managerNoor(), NOOR).send({ phone: '+201222222222' })).status).toBe(403);
  });
});
