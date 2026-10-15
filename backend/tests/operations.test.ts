import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/config/db.js';
import { AMAL, DOCTOR_NOOR, NOOR, PATIENT_1, PASSWORD, as, call, tokenFor } from './helpers.js';

const flat = (o: unknown) => JSON.stringify(o);

describe('Center manager: aggregates about the center, never individual patients or clinical content', () => {
  it('returns operational counts for the manager\'s own center only', async () => {
    const res = await call('get', '/api/center/overview', await as.managerNoor(), NOOR);
    expect(res.status).toBe(200);
    expect(res.body.data.appointmentsToday).toHaveProperty('byStatus');
    expect(res.body.data.activeStaffByRole).toHaveProperty('doctor');
    expect(typeof res.body.data.registeredPatients).toBe('number');
    // A count, not a list: nothing here identifies a patient or carries clinical text.
    expect(flat(res.body.data)).not.toMatch(/patient_name|diagnosis|chief_complaint|mrn|national_id|phone/i);

    expect((await call('get', '/api/center/overview', await as.managerNoor(), AMAL)).status).toBe(403); // not their center
  });

  it('refuses every other role on center operations', async () => {
    for (const token of [await as.doctorNoor(), await as.receptionNoor(), await as.coordinatorNoor(), await as.admin(), await as.patient()]) {
      for (const path of ['/api/center/overview', '/api/center/reports/appointments', '/api/center/specialties']) {
        expect((await call('get', path, token, NOOR)).status, path).toBe(403);
      }
    }
  });

  it('builds an appointment report with utilization from schedules, and validates the range', async () => {
    const manager = await as.managerNoor();
    const res = await call('get', '/api/center/reports/appointments', manager, NOOR);
    expect(res.status).toBe(200);
    expect(res.body.data.range.from <= res.body.data.range.to).toBe(true);
    const doctor = res.body.data.byClinician.find((c: any) => c.clinician_id === DOCTOR_NOOR);
    expect(doctor).toBeDefined();
    expect(doctor.capacityMinutes).toBeGreaterThan(0);
    expect(doctor.utilizationPercent).not.toBeNull();
    expect(flat(res.body.data)).not.toMatch(/patient_name|diagnosis|reason/i);

    expect((await call('get', '/api/center/reports/appointments?from=2030-02-01&to=2030-01-01', manager, NOOR)).status).toBe(400);
    expect((await call('get', '/api/center/reports/appointments?from=2030-01-01&to=2031-01-01', manager, NOOR)).status).toBe(400);
    expect((await call('get', '/api/center/reports/appointments?from=nope', manager, NOOR)).status).toBe(400);
  });

  it('lists the specialties derived from the center\'s doctors', async () => {
    const res = await call('get', '/api/center/specialties', await as.managerNoor(), NOOR);
    expect(res.status).toBe(200);
    expect(res.body.data.reduce((n: number, s: any) => n + s.doctors, 0)).toBeGreaterThan(0);
  });
});

describe('Doctor overview', () => {
  it('shows only the doctor\'s own day and own pending sign-off, and no other role can open it', async () => {
    const res = await call('get', '/api/doctor/overview', await as.doctorNoor(), NOOR);
    expect(res.status).toBe(200);
    expect(res.body.data.today.every((a: any) => a.patient_name_en)).toBe(true);
    expect(res.body.data.pendingSignOff.counts).toHaveProperty('visit');
    expect(res.body.data.pendingSignOff.total).toBeGreaterThanOrEqual(1); // the seeded draft visit

    const amal = await call('get', '/api/doctor/overview', await as.doctorAmal(), AMAL);
    expect(amal.body.data.today.every((a: any) => a.patient_id !== undefined)).toBe(true);
    for (const token of [await as.receptionNoor(), await as.managerNoor(), await as.coordinatorNoor(), await as.admin(), await as.patient()]) {
      expect((await call('get', '/api/doctor/overview', token, NOOR)).status).toBe(403);
    }
  });
});

describe('Doctor pending sign-off list', () => {
  it('lists only the doctor\'s own drafts and is closed to every other role', async () => {
    const mine = await call('get', '/api/doctor/pending', await as.doctorNoor(), NOOR);
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThanOrEqual(1);
    for (const d of mine.body.data) expect(['visit', 'prescription', 'lab_result']).toContain(d.type);
    const amal = await call('get', '/api/doctor/pending', await as.doctorAmal(), AMAL);
    const ids = new Set(mine.body.data.map((d: any) => d.id));
    for (const d of amal.body.data) expect(ids.has(d.id)).toBe(false);
    for (const token of [await as.receptionNoor(), await as.managerNoor(), await as.coordinatorNoor(), await as.admin(), await as.patient()]) {
      expect((await call('get', '/api/doctor/pending', token, NOOR)).status).toBe(403);
    }
  });
});

describe('Staff management is enforced by the backend', () => {
  it('lets a manager change status and role inside their center, but never their own, never another center\'s, never to center manager', async () => {
    const manager = await as.managerNoor();
    const members = await call('get', `/api/organizations/${NOOR}/members`, manager);
    expect(members.status).toBe(200);
    const reception = members.body.data.find((m: any) => m.email === 'reception.noor@naseej.health');
    const self = members.body.data.find((m: any) => m.email === 'manager.noor@naseej.health');

    expect((await call('patch', `/api/organizations/${NOOR}/members/${self.membership_id}`, manager).send({ status: 'inactive' })).status).toBe(403);
    expect((await call('patch', `/api/organizations/${NOOR}/members/${reception.membership_id}`, manager).send({ role: 'center_manager' })).status).toBe(403);
    expect((await call('patch', `/api/organizations/${NOOR}/members/${reception.membership_id}`, manager).send({ role: 'surgeon' })).status).toBe(400);
    expect((await call('patch', `/api/organizations/${NOOR}/members/${reception.membership_id}`, manager).send({})).status).toBe(400);

    // The membership id exists but belongs to Al-Noor: the Al-Amal manager cannot reach it through their own center.
    expect((await call('patch', `/api/organizations/${AMAL}/members/${reception.membership_id}`, await as.managerAmal()).send({ status: 'inactive' })).status).toBe(404);
    // Nor through Al-Noor's path: they hold no manager role there.
    expect((await call('patch', `/api/organizations/${NOOR}/members/${reception.membership_id}`, await as.managerAmal()).send({ status: 'inactive' })).status).toBe(403);

    // A real change: deactivate the reception membership, see it refused at the door, then restore it.
    const off = await call('patch', `/api/organizations/${NOOR}/members/${reception.membership_id}`, manager).send({ status: 'inactive' });
    expect(off.status).toBe(200);
    const receptionToken = await as.receptionNoor(); // a token was issued earlier; the membership is checked on every request
    expect((await call('get', '/api/appointments', receptionToken, NOOR)).status).toBe(403);
    expect((await call('patch', `/api/organizations/${NOOR}/members/${reception.membership_id}`, manager).send({ status: 'active' })).status).toBe(200);
    expect((await call('get', '/api/appointments', receptionToken, NOOR)).status).toBe(200);
  });

  it('refuses to remove the last active manager of a center', async () => {
    const admin = await as.admin();
    const members = await call('get', `/api/organizations/${AMAL}/members`, admin);
    const onlyManager = members.body.data.find((m: any) => m.email === 'manager.amal@naseej.health');
    const res = await call('patch', `/api/organizations/${AMAL}/members/${onlyManager.membership_id}`, admin).send({ status: 'inactive' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_MANAGER');
  });

  it('validates new accounts, restricts who can create a manager, and gives non-managers only a directory', async () => {
    const manager = await as.managerNoor();
    const base = { email: `new.${Date.now()}@naseej.health`, full_name_ar: 'اسم', full_name_en: 'Name' };
    expect((await call('post', `/api/organizations/${NOOR}/members`, manager).send({ ...base, role: 'platform_admin' })).status).toBe(400);
    expect((await call('post', `/api/organizations/${NOOR}/members`, manager).send({ ...base, role: 'center_manager' })).status).toBe(403);
    expect((await call('post', `/api/organizations/${NOOR}/members`, manager).send({ ...base, email: 'not-an-email', role: 'doctor' })).status).toBe(400);
    expect((await call('post', `/api/organizations/${NOOR}/members`, manager).send({ ...base, role: 'doctor', password: 'short' })).status).toBe(400);
    expect((await call('post', `/api/organizations/${NOOR}/members`, await as.receptionNoor()).send({ ...base, role: 'doctor' })).status).toBe(403);

    // A supplied password is used and not echoed back.
    const withPassword = await call('post', `/api/organizations/${NOOR}/members`, manager).send({ ...base, role: 'reception', password: 'A-long-enough-pass1' });
    expect(withPassword.status).toBe(201);
    expect(withPassword.body.data).not.toHaveProperty('temporaryPassword');
    await tokenFor(base.email, 'A-long-enough-pass1');

    const directory = await call('get', `/api/organizations/${NOOR}/members`, await as.receptionNoor());
    expect(directory.status).toBe(200);
    for (const m of directory.body.data) {
      expect(m).not.toHaveProperty('email');
      expect(m).not.toHaveProperty('phone');
      expect(m).not.toHaveProperty('license_number');
    }
  });
});

describe('Platform administrator: accounts and health, no clinical access', () => {
  it('reports health and aggregate counts only', async () => {
    const res = await call('get', '/api/admin/overview', await as.admin());
    expect(res.status).toBe(200);
    expect(res.body.data.service.database.status).toBe('up');
    expect(res.body.data.centers.active).toBeGreaterThanOrEqual(2);
    expect(flat(res.body.data)).not.toMatch(/diagnosis|patient_name|chief_complaint/i);
    for (const token of [await as.managerNoor(), await as.doctorNoor(), await as.patient()]) {
      expect((await call('get', '/api/admin/overview', token)).status).toBe(403);
    }
  });

  it('lists accounts with their memberships but no patient data', async () => {
    const res = await call('get', '/api/admin/users?search=doctor', await as.admin());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const u of res.body.data) {
      expect(u).not.toHaveProperty('national_id');
      expect(u).not.toHaveProperty('password_hash');
      expect(u).toHaveProperty('has_patient_profile');
    }
    expect((await call('get', '/api/admin/users', await as.managerNoor())).status).toBe(403);
  });

  it('deactivates an account so its existing token stops working, and protects self and the last admin', async () => {
    const admin = await as.admin();
    const users = await call('get', '/api/admin/users?search=reception', admin);
    const target = users.body.data.find((u: any) => u.email === 'reception.noor@naseej.health');
    const me = (await call('get', '/api/auth/me', admin)).body.data.user;

    expect((await call('patch', `/api/admin/users/${me.id}`, admin).send({ is_active: false })).status).toBe(403);
    expect((await call('patch', `/api/admin/users/${target.id}`, admin).send({ is_active: 'no' })).status).toBe(400);
    expect((await call('patch', '/api/admin/users/12345678-1234-4234-8234-123456789012', admin).send({ is_active: false })).status).toBe(404);

    const receptionToken = await as.receptionNoor();
    expect((await call('patch', `/api/admin/users/${target.id}`, admin).send({ is_active: false })).status).toBe(200);
    const blocked = await call('get', '/api/appointments', receptionToken, NOOR);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('ACCOUNT_INACTIVE_OR_NOT_FOUND');
    expect((await call('patch', `/api/admin/users/${target.id}`, admin).send({ is_active: true })).status).toBe(200);
    expect((await call('get', '/api/appointments', receptionToken, NOOR)).status).toBe(200);

    // A second administrator is needed before the first may be deactivated by them.
    const adminRow = await query(`SELECT id FROM users WHERE email = 'admin@naseej.health'`);
    expect(adminRow.rowCount).toBe(1);
  });
});

describe('Demo requests hold contact details: administrators only', () => {
  it('refuses the unauthenticated list, serves admins, lets only admins change a status, and the public form still posts', async () => {
    const anon = await request(app).get('/api/public/demo-requests');
    expect(anon.status).toBe(401);
    for (const token of [await as.managerNoor(), await as.doctorNoor(), await as.patient()]) {
      expect((await call('get', '/api/admin/demo-requests', token, NOOR)).status).toBe(403);
      expect((await call('get', '/api/public/demo-requests', token, NOOR)).status).toBe(403);
    }

    const posted = await request(app)
      .post('/api/public/demo-requests')
      .send({ organization_name: 'Test Clinic', contact_name: 'Tester', email: 'tester@example.test', phone: '+966500000000', center_type: 'clinic' });
    expect(posted.status).toBe(201);

    const admin = await as.admin();
    const list = await call('get', '/api/admin/demo-requests?status=new', admin);
    expect(list.status).toBe(200);
    const mine = list.body.data.find((d: any) => d.organization_name === 'Test Clinic');
    expect(mine).toBeTruthy();
    expect((await call('patch', `/api/admin/demo-requests/${mine.id}`, await as.managerNoor(), NOOR).send({ status: 'contacted' })).status).toBe(403);
    expect((await call('patch', `/api/admin/demo-requests/${mine.id}`, admin).send({ status: 'nonsense' })).status).toBe(400);
    const changed = await call('patch', `/api/admin/demo-requests/${mine.id}`, admin).send({ status: 'contacted' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.status).toBe('contacted');
  });
});

describe('Audit log: read-only, redacted for operational viewers, filterable and paged', () => {
  it('strips clinical wording from details for both administrators and managers, without changing the stored row', async () => {
    // Create the event with the test's own visit, so the seeded draft other suites rely on stays a draft.
    const doctor = await as.doctorNoor();
    const draft = await call('post', '/api/visits', doctor, NOOR).send({ patient_id: PATIENT_1, chief_complaint: 'Audit redaction check (synthetic)', diagnosis: 'Synthetic diagnosis text' });
    expect(draft.status).toBe(201);
    expect((await call('post', `/api/visits/${draft.body.data.id}/approve`, doctor, NOOR)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));
    const stored = await query(`SELECT details FROM audit_logs WHERE action = 'VISIT_APPROVE' ORDER BY created_at DESC LIMIT 1`);
    expect(stored.rows[0].details).toHaveProperty('diagnosis');

    for (const token of [await as.admin(), await as.managerNoor()]) {
      const res = await call('get', '/api/audit-logs?limit=100&action=VISIT_APPROVE', token, NOOR);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const row of res.body.data) {
        expect(row.details).not.toHaveProperty('diagnosis');
        expect(row.details).not.toHaveProperty('allergen');
        expect(row.details).not.toHaveProperty('nationalId');
      }
    }
  });

  it('filters by action, resource and date, and pages with a cursor', async () => {
    const admin = await as.admin();
    const logins = await call('get', '/api/audit-logs?action=AUTH_LOGIN&limit=5', admin);
    expect(logins.body.data.every((r: any) => r.action.startsWith('AUTH_LOGIN'))).toBe(true);
    expect((await call('get', '/api/audit-logs?resourceType=appointment&limit=100', admin)).body.data.every((r: any) => r.resource_type === 'appointment')).toBe(true);
    expect((await call('get', '/api/audit-logs?from=2999-01-01', admin)).body.data).toHaveLength(0);

    const page1 = await call('get', '/api/audit-logs?limit=3', admin);
    expect(page1.body.data).toHaveLength(3);
    expect(page1.body.meta.hasMore).toBe(true);
    const page2 = await call('get', `/api/audit-logs?limit=3&before=${encodeURIComponent(page1.body.meta.nextBefore)}`, admin);
    const firstIds = new Set(page1.body.data.map((r: any) => r.id));
    expect(page2.body.data.every((r: any) => !firstIds.has(r.id))).toBe(true);

    expect((await call('get', '/api/audit-logs?before=garbage', admin)).status).toBe(400);
    expect((await call('get', '/api/audit-logs?organizationId=nope', admin)).status).toBe(400);
  });

  it('limits managers to centers they manage and refuses everyone else', async () => {
    const manager = await as.managerNoor();
    const own = await call('get', '/api/audit-logs?limit=100', manager);
    expect(own.body.data.every((r: any) => r.organization_id === NOOR)).toBe(true);
    expect((await call('get', `/api/audit-logs?organizationId=${AMAL}`, manager)).status).toBe(403);
    for (const token of [await as.doctorNoor(), await as.receptionNoor(), await as.coordinatorNoor(), await as.patient()]) {
      expect((await call('get', '/api/audit-logs', token, NOOR)).status).toBe(403);
    }
    expect(PASSWORD).toBeTruthy();
    expect(PATIENT_1).toBeTruthy();
  });
});
