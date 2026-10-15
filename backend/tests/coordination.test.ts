import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '../src/config/db.js';
import { AMAL, NOOR, PATIENT_1, PATIENT_2, SEEDED_CASE, as, call, tokenFor } from './helpers.js';

let secondCoordinatorToken = '';
let secondCoordinatorId = '';
let firstCoordinatorId = '';

describe('Care coordinator: scope and what the role cannot reach', () => {
  beforeAll(async () => {
    const me = await call('get', '/api/auth/me', await as.coordinatorNoor());
    firstCoordinatorId = me.body.data.user.id;
    expect(me.body.data.user.memberships[0].role).toBe('care_coordinator');
  });

  it('is a new role: existing staff were not silently given it', async () => {
    const rows = await query(`SELECT u.email FROM organization_memberships m JOIN users u ON u.id = m.user_id WHERE m.role = 'care_coordinator'`);
    expect(rows.rows.map((r) => r.email)).toEqual(['coordinator.noor@naseej.health']);
  });

  it('sees the seeded case and a dashboard of operational counts only', async () => {
    const coordinator = await as.coordinatorNoor();
    const dash = await call('get', '/api/coordination/dashboard', coordinator, NOOR);
    expect(dash.status).toBe(200);
    expect(dash.body.data.openCases).toBeGreaterThanOrEqual(1);
    expect(dash.body.data).toHaveProperty('overdueTasks');
    expect(dash.body.data).toHaveProperty('upcomingTasks');

    const cases = await call('get', '/api/coordination/cases', coordinator, NOOR);
    expect(cases.status).toBe(200);
    const seeded = cases.body.data.find((c: any) => c.id === SEEDED_CASE);
    expect(seeded.patient_name_en).toBeTruthy();
    expect(seeded.mrn).toBeTruthy();
    // Operational projection only: no clinical or demographic detail beyond name, MRN, phone, next appointment.
    for (const forbidden of ['diagnosis', 'allergies', 'blood_type', 'date_of_birth', 'national_id', 'treatment_plan']) {
      expect(seeded).not.toHaveProperty(forbidden);
    }
  });

  it('lists the other active centers by name only as referral destinations', async () => {
    const res = await call('get', '/api/coordination/destinations', await as.coordinatorNoor(), NOOR);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    for (const o of res.body.data) {
      expect(Object.keys(o).sort()).toEqual(['id', 'name_ar', 'name_en']);
      expect(o.id).not.toBe(NOOR);
    }
    expect((await call('get', '/api/coordination/destinations', await as.doctorNoor(), NOOR)).status).toBe(403);
  });

  it('is refused on clinical, patient, document and other roles\' routes', async () => {
    const coordinator = await as.coordinatorNoor();
    for (const path of ['/api/visits', '/api/prescriptions', '/api/labs/orders', '/api/patients', '/api/appointments', `/api/documents?patientId=${PATIENT_1}`, '/api/center/overview', '/api/doctor/overview', '/api/admin/overview']) {
      expect((await call('get', path, coordinator, NOOR)).status, path).toBe(403);
    }
    const lookup = await call('get', '/api/coordination/patients?search=moh', coordinator, NOOR);
    expect(lookup.status).toBe(200);
    for (const p of lookup.body.data) expect(Object.keys(p).sort()).toEqual(['full_name_ar', 'full_name_en', 'id', 'mrn']);
  });

  it('is unreachable for doctors, reception and administrators', async () => {
    for (const token of [await as.doctorNoor(), await as.receptionNoor(), await as.admin(), await as.patient()]) {
      for (const path of ['/api/coordination/cases', '/api/coordination/tasks', '/api/coordination/dashboard', '/api/coordination/followup-log']) {
        expect((await call('get', path, token, NOOR)).status, path).toBe(403);
      }
    }
  });

  it('lets a manager add a second coordinator, who then cannot see the first one\'s case', async () => {
    const manager = await as.managerNoor();
    const email = `coord2.${Date.now()}@naseej.health`;
    const created = await call('post', `/api/organizations/${NOOR}/members`, manager).send({
      email,
      full_name_ar: 'منسق تجريبي',
      full_name_en: 'Second Coordinator',
      role: 'care_coordinator',
    });
    expect(created.status).toBe(201);
    // No password was supplied, so the server generated a one-time temporary one and returned it once.
    expect(created.body.data.temporaryPassword).toBeTruthy();
    expect(created.body.data.temporaryPassword).not.toBe('Password123!');

    secondCoordinatorToken = await tokenFor(email, created.body.data.temporaryPassword);
    const me = await call('get', '/api/auth/me', secondCoordinatorToken);
    secondCoordinatorId = me.body.data.user.id;

    const list = await call('get', '/api/coordination/cases', secondCoordinatorToken, NOOR);
    expect(list.status).toBe(200);
    expect(list.body.data.find((c: any) => c.id === SEEDED_CASE)).toBeUndefined();
    expect((await call('get', `/api/coordination/cases/${SEEDED_CASE}`, secondCoordinatorToken, NOOR)).status).toBe(404);
    expect((await call('get', `/api/coordination/tasks`, secondCoordinatorToken, NOOR)).body.data).toHaveLength(0);
  });
});

describe('Cases and tasks', () => {
  let caseId = '';
  let taskId = '';

  it('opens a case only for a patient registered at the center, once per coordinator and patient', async () => {
    const coordinator = await as.coordinatorNoor();
    const missing = await call('post', '/api/coordination/cases', coordinator, NOOR).send({ patient_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', reason: 'x' });
    expect(missing.status).toBe(404);
    expect((await call('post', '/api/coordination/cases', coordinator, NOOR).send({ patient_id: PATIENT_2 })).status).toBe(400);

    const opened = await call('post', '/api/coordination/cases', coordinator, NOOR).send({ patient_id: PATIENT_2, reason: 'Arrange follow-up call (synthetic)' });
    expect(opened.status).toBe(201);
    expect(opened.body.data.coordinator_id).toBe(firstCoordinatorId);
    caseId = opened.body.data.id;
    expect((await call('post', '/api/coordination/cases', coordinator, NOOR).send({ patient_id: PATIENT_2, reason: 'again' })).status).toBe(409);
  });

  it('creates tasks, requires a note to finish one, and refuses edits on a finished task', async () => {
    const coordinator = await as.coordinatorNoor();
    const bad = await call('post', '/api/coordination/tasks', coordinator, NOOR).send({ case_id: caseId, title: 'x', task_type: 'diagnose' });
    expect(bad.status).toBe(400);
    expect((await call('post', '/api/coordination/tasks', coordinator, NOOR).send({ case_id: caseId, title: 'x', due_date: '31/12/2030' })).status).toBe(400);

    const created = await call('post', '/api/coordination/tasks', coordinator, NOOR).send({ case_id: caseId, title: 'Call patient to confirm visit', task_type: 'appointment_coordination', due_date: '2020-01-01' });
    expect(created.status).toBe(201);
    taskId = created.body.data.id;
    expect(created.body.data.version).toBe(1);

    // Overdue shows up in the dashboard and in the overdue filter.
    const overdue = await call('get', '/api/coordination/tasks?overdue=1', coordinator, NOOR);
    expect(overdue.body.data.some((t: any) => t.id === taskId && t.is_overdue)).toBe(true);

    const noNote = await call('patch', `/api/coordination/tasks/${taskId}`, coordinator, NOOR).send({ status: 'done', version: 1 });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.code).toBe('COMPLETION_NOTE_REQUIRED');

    // Closing the case with an open task is refused.
    const early = await call('patch', `/api/coordination/cases/${caseId}`, coordinator, NOOR).send({ action: 'close', version: 1 });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('OPEN_TASKS_REMAIN');

    const started = await call('patch', `/api/coordination/tasks/${taskId}`, coordinator, NOOR).send({ status: 'in_progress', version: 1 });
    expect(started.status).toBe(200);
    expect(started.body.data.version).toBe(2);

    // A stale write (still holding version 1) is rejected instead of overwriting.
    const stale = await call('patch', `/api/coordination/tasks/${taskId}`, coordinator, NOOR).send({ status: 'cancelled', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
    expect(stale.body.error.details.currentVersion).toBe(2);

    const done = await call('patch', `/api/coordination/tasks/${taskId}`, coordinator, NOOR).send({ status: 'done', completion_note: 'Patient confirmed by phone.', version: 2 });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('done');
    expect(done.body.data.completed_at).toBeTruthy();

    const again = await call('patch', `/api/coordination/tasks/${taskId}`, coordinator, NOOR).send({ status: 'open', version: 3 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TASK_FINISHED');
  });

  it('keeps one coordinator out of another\'s tasks, and lets a manager reassign but not a coordinator', async () => {
    expect((await call('patch', `/api/coordination/tasks/${taskId}`, secondCoordinatorToken, NOOR).send({ status: 'open', version: 4 })).status).toBe(404);
    expect((await call('post', '/api/coordination/tasks', secondCoordinatorToken, NOOR).send({ case_id: caseId, title: 'sneak' })).status).toBe(404);

    const coordinator = await as.coordinatorNoor();
    const forbidden = await call('patch', `/api/coordination/cases/${caseId}`, coordinator, NOOR).send({ action: 'reassign', coordinator_id: secondCoordinatorId, version: 1 });
    expect(forbidden.status).toBe(403);

    const manager = await as.managerNoor();
    const invalid = await call('patch', `/api/coordination/cases/${caseId}`, manager, NOOR).send({ action: 'reassign', coordinator_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', version: 1 });
    expect(invalid.status).toBe(400);
    const reassigned = await call('patch', `/api/coordination/cases/${caseId}`, manager, NOOR).send({ action: 'reassign', coordinator_id: secondCoordinatorId, version: 1 });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.data.coordinator_id).toBe(secondCoordinatorId);

    // The first coordinator has lost it; the second now has it. The manager can see everything in the center.
    expect((await call('get', `/api/coordination/cases/${caseId}`, coordinator, NOOR)).status).toBe(404);
    expect((await call('get', `/api/coordination/cases/${caseId}`, secondCoordinatorToken, NOOR)).status).toBe(200);
    expect((await call('get', '/api/coordination/cases?status=all', manager, NOOR)).body.data.some((c: any) => c.id === caseId)).toBe(true);
  });

  it('closes a case once its tasks are finished', async () => {
    const closed = await call('patch', `/api/coordination/cases/${caseId}`, secondCoordinatorToken, NOOR).send({ action: 'close', version: 2 });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('closed');
    expect((await call('patch', `/api/coordination/cases/${caseId}`, secondCoordinatorToken, NOOR).send({ action: 'close', version: 3 })).status).toBe(409);
    expect((await call('post', '/api/coordination/tasks', secondCoordinatorToken, NOOR).send({ case_id: caseId, title: 'late' })).status).toBe(409);
  });
});

describe('Referral tracking depends on the patient\'s consent and never implies clinical completion', () => {
  let referralId = '';
  let version = 1;

  it('creates a referral, but cannot send it without an effective consent from this center to the other', async () => {
    const coordinator = await as.coordinatorNoor();
    const created = await call('post', '/api/coordination/referrals', coordinator, NOOR).send({
      case_id: SEEDED_CASE,
      to_organization_id: AMAL,
      reason: 'Specialist visit arrangement (synthetic)',
    });
    expect(created.status).toBe(201);
    referralId = created.body.data.id;
    expect((await call('post', '/api/coordination/referrals', coordinator, NOOR).send({ case_id: SEEDED_CASE, to_organization_id: NOOR, reason: 'x' })).status).toBe(400);

    // The seeded consent runs Al-Amal -> Al-Noor, the wrong direction for a referral from Al-Noor.
    const blocked = await call('patch', `/api/coordination/referrals/${referralId}`, coordinator, NOOR).send({ action: 'send', version });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('sends once the patient consents, and the receiving center sees only name, reason and status', async () => {
    const patient = await as.patient();
    const consent = await call('post', '/api/portal/consents', patient).send({ from_organization_id: NOOR, to_organization_id: AMAL, scope: 'all', expires_in_days: 30 });
    expect(consent.status).toBe(201);

    const coordinator = await as.coordinatorNoor();
    const sent = await call('patch', `/api/coordination/referrals/${referralId}`, coordinator, NOOR).send({ action: 'send', version });
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe('sent');
    version = sent.body.data.version;

    const amalManager = await as.managerAmal();
    const incoming = await call('get', '/api/coordination/referrals?direction=incoming', amalManager, AMAL);
    expect(incoming.status).toBe(200);
    const row = incoming.body.data.find((r: any) => r.id === referralId);
    expect(row.patient_name_en).toBeTruthy();
    expect(row.other_name_en).toBeTruthy();
    for (const forbidden of ['mrn', 'patient_phone', 'diagnosis', 'case_id', 'national_id']) expect(row).not.toHaveProperty(forbidden);
    // Al-Noor's own coordinators do not appear as the destination.
    expect((await call('get', '/api/coordination/referrals?direction=incoming', coordinator, NOOR)).body.data.find((r: any) => r.id === referralId)).toBeUndefined();
  });

  it('confirms receipt from the destination side only, and says nothing about clinical completion', async () => {
    const coordinator = await as.coordinatorNoor();
    const originConfirm = await call('patch', `/api/coordination/referrals/${referralId}`, coordinator, NOOR).send({ action: 'confirm_receipt', version });
    expect(originConfirm.status).toBe(403);

    const amalManager = await as.managerAmal();
    const stale = await call('patch', `/api/coordination/referrals/${referralId}`, amalManager, AMAL).send({ action: 'confirm_receipt', version: version - 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');

    const confirmed = await call('patch', `/api/coordination/referrals/${referralId}`, amalManager, AMAL).send({ action: 'confirm_receipt', version });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('receipt_confirmed');
    // There is no "completed" state anywhere in the model.
    const states = await query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname LIKE 'care_referrals_status_check'`);
    expect(JSON.stringify(states.rows)).not.toMatch(/complete/i);
  });

  it('stops listing the referral to the destination as soon as the consent is revoked', async () => {
    const patient = await as.patient();
    const consents = await call('get', '/api/portal/consents', patient);
    for (const c of consents.body.data.filter((x: any) => x.state === 'active' && x.from_organization_id === NOOR && x.to_organization_id === AMAL)) {
      await call('post', `/api/portal/consents/${c.id}/revoke`, patient);
    }
    const amalManager = await as.managerAmal();
    const incoming = await call('get', '/api/coordination/referrals?direction=incoming', amalManager, AMAL);
    expect(incoming.body.data.find((r: any) => r.id === referralId)).toBeUndefined();
  });

  it('rejects an action by a center that is neither side of the referral', async () => {
    const res = await call('patch', `/api/coordination/referrals/${referralId}`, await as.managerAmal(), '22222222-2222-2222-2222-222222222222').send({ action: 'cancel', version: 1 });
    expect(res.status).toBe(403); // destination may only confirm receipt
    expect((await call('patch', '/api/coordination/referrals/ffffffff-ffff-ffff-ffff-ffffffffffff', await as.managerAmal(), AMAL).send({ action: 'cancel', version: 1 })).status).toBe(404);
  });
});

describe('Follow-up log and audit trail are append-only', () => {
  it('records coordination events with actor and time, readable but not editable', async () => {
    const coordinator = await as.coordinatorNoor();
    const log = await call('get', `/api/coordination/followup-log?caseId=${SEEDED_CASE}`, coordinator, NOOR);
    expect(log.status).toBe(200);
    expect(log.body.data.length).toBeGreaterThan(1);
    for (const e of log.body.data) {
      expect(e.actor_name_en).toBeTruthy();
      expect(e.created_at).toBeTruthy();
      expect(e.event_type).toBeTruthy();
    }
    expect(log.body.data.some((e: any) => e.event_type === 'referral_created')).toBe(true);
  });

  it('is enforced by the database, not only by the API', async () => {
    await expect(query(`UPDATE care_followup_log SET note = 'edited'`)).rejects.toThrow(/append-only/);
    await expect(query(`DELETE FROM care_followup_log`)).rejects.toThrow(/append-only/);
    await expect(query(`UPDATE audit_logs SET action = 'EDITED'`)).rejects.toThrow(/append-only/);
    await expect(query(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
    // Operational audit events exist for the actions above.
    const audit = await query(`SELECT 1 FROM audit_logs WHERE action IN ('CARE_CASE_OPEN','CARE_REFERRAL_SENT','CARE_REFERRAL_RECEIPT_CONFIRMED') LIMIT 1`);
    expect(audit.rowCount).toBe(1);
  });
});
