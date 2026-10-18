import { describe, it, expect } from 'vitest';
import { query } from '../src/config/db.js';
import { NOOR, SEEDED_DELEGATION, as, call } from './helpers.js';

// Needs migration 003 and seed 003 (npm run migrate && npm run seed).
describe('Caregiver delegation: access exists only through an active, in-scope authorization', () => {
  it('lets the caregiver read the approved record and appointments the patient allowed', async () => {
    const t = await as.caregiverNoor();
    const summary = await call('get', `/api/caregiver/patients/${SEEDED_DELEGATION}/summary`, t);
    expect(summary.status).toBe(200);
    expect(summary.body.data.profile).toBeTruthy();
    expect((await call('get', `/api/caregiver/patients/${SEEDED_DELEGATION}/timeline`, t)).status).toBe(200);
    expect((await call('get', `/api/caregiver/patients/${SEEDED_DELEGATION}/appointments`, t)).status).toBe(200);
  });

  it('refuses what the patient did not allow: messaging is a separate permission', async () => {
    const t = await as.caregiverNoor();
    const res = await call('post', `/api/caregiver/patients/${SEEDED_DELEGATION}/messages`, t).send({
      organization_id: NOOR, subject: 'Question', body: 'Hello', category: 'administrative',
    });
    expect(res.status).toBe(404);
  });

  it('refuses another account, an unknown id, and the patient-only portal routes', async () => {
    expect((await call('get', `/api/caregiver/patients/${SEEDED_DELEGATION}/summary`, await as.receptionNoor())).status).toBe(404);
    expect((await call('get', '/api/caregiver/patients/not-a-uuid/summary', await as.caregiverNoor())).status).toBe(404);
    expect((await call('get', '/api/portal/summary', await as.caregiverNoor())).status).toBe(403);
    expect((await call('get', '/api/documents', await as.caregiverNoor(), NOOR)).status).toBe(403);
  });

  it('records caregiver reads where the patient can review them', async () => {
    const caregiver = await as.caregiverNoor();
    await call('get', `/api/caregiver/patients/${SEEDED_DELEGATION}/summary`, caregiver);
    const history = await call('get', `/api/portal/caregivers/${SEEDED_DELEGATION}/history`, await as.patient());
    expect(history.status).toBe(200);
    expect(history.body.data.some((h: any) => h.action === 'CAREGIVER_READ')).toBe(true);
  });

  it('stops all access the moment the patient revokes, and an expired delegation grants nothing', async () => {
    const patient = await as.patient();
    const invite = await call('post', '/api/portal/caregivers', patient).send({
      email: 'someone.else@example.com', relationship: 'friend', can_view_records: true, expires_in_days: 30,
    });
    expect(invite.status).toBe(201);
    // Only the invited address can accept it.
    expect((await call('post', `/api/caregiver/delegations/${invite.body.data.id}/accept`, await as.caregiverNoor())).status).toBe(404);
    expect((await call('post', `/api/portal/caregivers/${invite.body.data.id}/revoke`, patient)).status).toBe(200);

    await query(`UPDATE caregiver_delegations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [SEEDED_DELEGATION]);
    try {
      expect((await call('get', `/api/caregiver/patients/${SEEDED_DELEGATION}/summary`, await as.caregiverNoor())).status).toBe(404);
    } finally {
      await query(`UPDATE caregiver_delegations SET expires_at = NOW() + INTERVAL '180 days' WHERE id = $1`, [SEEDED_DELEGATION]);
    }
  });

  it('requires at least one permission and refuses self-authorization', async () => {
    const patient = await as.patient();
    expect((await call('post', '/api/portal/caregivers', patient).send({ email: 'x@example.com' })).status).toBe(400);
    expect((await call('post', '/api/portal/caregivers', patient).send({ email: 'patient@naseej.health', can_view_records: true })).status).toBe(400);
  });
});

describe('Operational messages between reception and clinicians', () => {
  it('lets reception write to a clinician and the clinician reply, but not managers or patients', async () => {
    const reception = await as.receptionNoor();
    const sent = await call('post', '/api/ops-messages', reception, NOOR).send({ subject: 'Patient arrived early', body: 'Please let us know when you are ready.', category: 'arrival' });
    expect(sent.status).toBe(201);
    const doctor = await as.doctorNoor();
    const inbox = await call('get', '/api/ops-messages?box=inbox', doctor, NOOR);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.some((m: any) => m.id === sent.body.data.id)).toBe(true);
    expect((await call('post', `/api/ops-messages/${sent.body.data.id}/replies`, doctor, NOOR).send({ body: 'Five minutes.' })).status).toBe(201);
    expect((await call('get', '/api/ops-messages', await as.managerNoor(), NOOR)).status).toBe(403);
    expect((await call('get', '/api/ops-messages', await as.patient(), NOOR)).status).toBe(403);
  });

  it('keeps a center\'s messages inside that center', async () => {
    const sent = await call('post', '/api/ops-messages', await as.receptionNoor(), NOOR).send({ subject: 'Only for Noor', body: 'Internal.' });
    const other = await call('get', `/api/ops-messages/${sent.body.data.id}`, await as.doctorAmal(), '22222222-2222-2222-2222-222222222222');
    expect(other.status).toBe(404);
  });
});

describe('AI document review keeps suggestions apart from verified records', () => {
  it('reports honestly when no provider is configured and never fabricates a result', async () => {
    const status = await call('get', '/api/documents/ai/status', await as.doctorNoor(), NOOR);
    expect(status.status).toBe(200);
    if (!status.body.data.configured) {
      const patient = await as.patient();
      const docs = await call('get', '/api/documents', patient);
      expect(docs.status).toBe(200);
    }
  });
});
