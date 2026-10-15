import { describe, it, expect } from 'vitest';
import { query } from '../src/config/db.js';
import {
  AMAL, APPROVED_VISIT_AMAL, DOCTOR_AMAL, DRAFT_VISIT_NOOR, NOOR, PATIENT_1, PATIENT_2, SEEDED_CONSENT, as, call,
} from './helpers.js';

const ids = (items: any[]) => items.map((i) => i.id);

describe('Patient timeline: own record, approved and released items only', () => {
  it('returns items with source, center, author, provenance and review status', async () => {
    const res = await call('get', '/api/portal/timeline?limit=200', await as.patient());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(3);
    for (const item of res.body.data) {
      expect(item.source.id).toBeTruthy();
      expect(item.source.resource).toBeTruthy();
      expect(item.provenance).toBeTruthy();
      expect(item.reviewStatus).toBeTruthy();
      expect(item.occurredAt).toBeTruthy();
      expect(item.isExternal).toBe(false);
    }
    // Sorted newest first.
    const times = res.body.data.map((i: any) => i.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('never contains drafts, and distinguishes who wrote each kind of item', async () => {
    const res = await call('get', '/api/portal/timeline?limit=200', await as.patient());
    expect(ids(res.body.data)).not.toContain(`visit:${DRAFT_VISIT_NOOR}`);

    for (const item of res.body.data) {
      if (item.type === 'visit') expect(item.reviewStatus).toBe('approved');
      if (item.type === 'prescription') expect(item.reviewStatus).toBe('approved');
      if (item.type === 'lab_result') expect(item.reviewStatus).toBe('approved');
      if (item.type === 'symptom_report') expect(item.provenance).toBe('patient_reported');
      if (item.type === 'document') expect(['patient_uploaded', 'clinician_uploaded', 'imported']).toContain(item.provenance);
      if (item.type === 'visit') expect(item.data).not.toHaveProperty('examinationNotes');
    }
    const docs = res.body.data.filter((i: any) => i.type === 'document');
    expect(docs.some((d: any) => d.provenance === 'patient_uploaded')).toBe(true);
    expect(docs.some((d: any) => d.provenance === 'clinician_uploaded')).toBe(true);
  });

  it('filters by type, center and date, and pages with a cursor', async () => {
    const patient = await as.patient();
    const visitsOnly = await call('get', '/api/portal/timeline?type=visit&limit=200', patient);
    expect(visitsOnly.body.data.every((i: any) => i.type === 'visit')).toBe(true);

    const atAmal = await call('get', `/api/portal/timeline?organizationId=${AMAL}&limit=200`, patient);
    expect(atAmal.body.data.every((i: any) => i.organization.id === AMAL)).toBe(true);

    const future = await call('get', '/api/portal/timeline?from=2999-01-01', patient);
    expect(future.body.data).toHaveLength(0);

    const page1 = await call('get', '/api/portal/timeline?limit=2', patient);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.hasMore).toBe(true);
    const page2 = await call('get', `/api/portal/timeline?limit=2&before=${encodeURIComponent(page1.body.meta.nextBefore)}`, patient);
    expect(page2.body.data.length).toBeGreaterThan(0);
    expect(ids(page2.body.data).some((id: string) => ids(page1.body.data).includes(id))).toBe(false);

    expect((await call('get', '/api/portal/timeline?type=nonsense', patient)).status).toBe(400);
    expect((await call('get', '/api/portal/timeline?from=yesterday-ish', patient)).status).toBe(400);
  });

  it('is available to patients only', async () => {
    for (const token of [await as.doctorNoor(), await as.receptionNoor(), await as.admin(), await as.coordinatorNoor()]) {
      expect((await call('get', '/api/portal/timeline', token, NOOR)).status).toBe(403);
    }
    expect((await call('get', '/api/portal/timeline', 'not-a-token')).status).toBe(401);
  });
});

describe('Clinician timeline: own center fully, other centers only under consent', () => {
  it('shows the doctor own-center drafts (flagged) and the consented Al-Amal visit (external, with its consent)', async () => {
    const res = await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, await as.doctorNoor(), NOOR);
    expect(res.status).toBe(200);

    const draft = res.body.data.find((i: any) => i.id === `visit:${DRAFT_VISIT_NOOR}`);
    expect(draft.reviewStatus).toBe('draft');
    expect(draft.isExternal).toBe(false);
    expect(draft.data).toHaveProperty('examinationNotes');

    const external = res.body.data.find((i: any) => i.id === `visit:${APPROVED_VISIT_AMAL}`);
    expect(external).toBeDefined();
    expect(external.isExternal).toBe(true);
    expect(external.consentId).toBe(SEEDED_CONSENT);
    expect(external.organization.id).toBe(AMAL);
    expect(external.reviewStatus).toBe('approved');
    expect(external.author.name_en).toBeTruthy();
  });

  it('writes an audit event for the cross-center read', async () => {
    await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, await as.doctorNoor(), NOOR);
    await new Promise((r) => setTimeout(r, 150));
    const rows = await query(`SELECT details FROM audit_logs WHERE action = 'CROSS_CENTER_RECORD_ACCESS' ORDER BY created_at DESC LIMIT 1`);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].details.consentIds).toContain(SEEDED_CONSENT);
    expect(rows.rows[0].details.fromOrganizationIds).toContain(AMAL);
  });

  it('never exposes another center\'s drafts, even with consent', async () => {
    const amalDoctor = await as.doctorAmal();
    const draft = await call('post', '/api/visits', amalDoctor, AMAL).send({ patient_id: PATIENT_1, chief_complaint: 'Draft at Al-Amal', diagnosis: 'Unreviewed draft' });
    expect(draft.status).toBe(201);

    const noor = await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, await as.doctorNoor(), NOOR);
    expect(ids(noor.body.data)).not.toContain(`visit:${draft.body.data.id}`);
    // The Al-Amal doctor does see it in their own center's timeline, flagged as a draft.
    const amal = await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, amalDoctor, AMAL);
    expect(amal.body.data.find((i: any) => i.id === `visit:${draft.body.data.id}`).reviewStatus).toBe('draft');
    // And the patient does not see it either.
    const patient = await call('get', '/api/portal/timeline?limit=200', await as.patient());
    expect(ids(patient.body.data)).not.toContain(`visit:${draft.body.data.id}`);
  });

  it('refuses a doctor whose center does not hold the patient, and every non-doctor role', async () => {
    expect((await call('get', `/api/patients/${PATIENT_2}/timeline`, await as.doctorAmal(), AMAL)).status).toBe(404);
    for (const token of [await as.receptionNoor(), await as.managerNoor(), await as.coordinatorNoor(), await as.patient()]) {
      expect((await call('get', `/api/patients/${PATIENT_1}/timeline`, token, NOOR)).status).toBe(403);
    }
    expect((await call('get', `/api/patients/${PATIENT_1}/timeline`, await as.admin(), NOOR)).status).toBe(403);
  });
});

describe('Consent: scope, revocation and expiry decide what crosses a center boundary', () => {
  it('validates, lists, and refuses everyone but the patient', async () => {
    const patient = await as.patient();
    const list = await call('get', '/api/portal/consents', patient);
    expect(list.status).toBe(200);
    const seeded = list.body.data.find((c: any) => c.id === SEEDED_CONSENT);
    expect(seeded.state).toBe('active');
    expect(seeded.from_name_en).toBeTruthy();

    const bad = (body: any) => call('post', '/api/portal/consents', patient).send(body);
    expect((await bad({ from_organization_id: NOOR, to_organization_id: NOOR, scope: 'all' })).status).toBe(400);
    expect((await bad({ from_organization_id: AMAL, to_organization_id: NOOR, scope: 'everything' })).status).toBe(400);
    expect((await bad({ from_organization_id: AMAL, to_organization_id: '33333333-3333-3333-3333-333333333333', scope: 'all' })).status).toBe(400);
    // Duplicate of the seeded active consent.
    expect((await bad({ from_organization_id: AMAL, to_organization_id: NOOR, scope: 'all' })).status).toBe(409);

    for (const token of [await as.doctorNoor(), await as.receptionNoor(), await as.managerNoor(), await as.admin()]) {
      expect((await call('get', '/api/portal/consents', token, NOOR)).status).toBe(403);
      expect((await call('post', `/api/portal/consents/${SEEDED_CONSENT}/revoke`, token, NOOR)).status).toBe(403);
    }
  });

  it('applies a scope-limited consent: labs only means only lab results cross over', async () => {
    const patient = await as.patient();
    const doctor = await as.doctorNoor();

    // Make sure Al-Amal has an approved lab result to share.
    const amalDoctor = await as.doctorAmal();
    const order = await call('post', '/api/labs/orders', amalDoctor, AMAL).send({ patient_id: PATIENT_1, test_name_ar: 'اختبار', test_name_en: 'Scoped consent test' });
    const result = await call('post', `/api/labs/orders/${order.body.data.id}/results`, amalDoctor, AMAL).send({ parameter_name: 'Synthetic', value: '5', unit: 'u' });
    await call('post', `/api/labs/results/${result.body.data.id}/approve`, amalDoctor, AMAL);

    // Replace the broad seeded consent with a labs-only one.
    expect((await call('post', `/api/portal/consents/${SEEDED_CONSENT}/revoke`, patient)).status).toBe(200);
    const labsOnly = await call('post', '/api/portal/consents', patient).send({ from_organization_id: AMAL, to_organization_id: NOOR, scope: 'labs', expires_in_days: 30 });
    expect(labsOnly.status).toBe(201);

    const scoped = await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, doctor, NOOR);
    const external = scoped.body.data.filter((i: any) => i.isExternal);
    expect(external.length).toBeGreaterThan(0);
    expect(external.every((i: any) => i.type === 'lab_result')).toBe(true);
    expect(ids(scoped.body.data)).not.toContain(`visit:${APPROVED_VISIT_AMAL}`);

    // Revoking takes effect on the very next request.
    expect((await call('post', `/api/portal/consents/${labsOnly.body.data.id}/revoke`, patient)).status).toBe(200);
    const revoked = await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, doctor, NOOR);
    expect(revoked.body.data.some((i: any) => i.isExternal)).toBe(false);
  });

  it('treats an expired consent as no consent, and rejects revoking twice or someone else\'s', async () => {
    const patient = await as.patient();
    const created = await call('post', '/api/portal/consents', patient).send({ from_organization_id: AMAL, to_organization_id: NOOR, scope: 'all', expires_in_days: 30 });
    expect(created.status).toBe(201);

    // Force expiry directly in the database (the API cannot create a past expiry).
    await query(`UPDATE patient_consents SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [created.body.data.id]);
    const afterExpiry = await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, await as.doctorNoor(), NOOR);
    expect(afterExpiry.body.data.some((i: any) => i.isExternal)).toBe(false);
    const listed = await call('get', '/api/portal/consents', patient);
    expect(listed.body.data.find((c: any) => c.id === created.body.data.id).state).toBe('expired');

    expect((await call('post', `/api/portal/consents/${SEEDED_CONSENT}/revoke`, patient)).status).toBe(409); // already revoked above
    expect((await call('post', '/api/portal/consents/ffffffff-ffff-ffff-ffff-ffffffffffff/revoke', patient)).status).toBe(404);

    // Leave a consent in place for later suites.
    const restored = await call('post', '/api/portal/consents', patient).send({ from_organization_id: AMAL, to_organization_id: NOOR, scope: 'all', expires_in_days: 365 });
    // An expired consent must not block granting the same consent again.
    expect(restored.status).toBe(201);
  });

  it('does not let consent flow the other way', async () => {
    // Consent covers Al-Amal -> Al-Noor. An Al-Amal doctor must not receive Al-Noor records through it.
    const res = await call('get', `/api/patients/${PATIENT_1}/timeline?limit=200`, await as.doctorAmal(), AMAL);
    expect(res.status).toBe(200);
    expect(res.body.data.some((i: any) => i.isExternal)).toBe(false);
    expect(res.body.data.every((i: any) => i.organization.id === AMAL)).toBe(true);
  });
});

describe('Documents: provenance, release and access', () => {
  it('lets the patient upload their own file and labels it patient-provided and unreviewed', async () => {
    const patient = await as.patient();
    const { tinyPdfBase64 } = await import('./helpers.js');
    const up = await call('post', '/api/documents', patient).send({
      file_name: 'my-home-readings.pdf',
      content_base64: tinyPdfBase64,
      title: 'Home readings',
      organization_id: NOOR,
    });
    expect(up.status).toBe(201);
    expect(up.body.data.sourceType).toBe('patient_uploaded');
    expect(up.body.data.reviewStatus).toBe('unreviewed');
    expect(up.body.data.visibleToPatient).toBe(true);
    expect(up.body.data).not.toHaveProperty('storage_path');

    const dl = await call('get', `/api/documents/${up.body.data.id}/download`, patient);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toContain('application/pdf');
    expect(dl.headers['cache-control']).toContain('no-store');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
  });

  it('checks the real file type and size, not the declared ones', async () => {
    const patient = await as.patient();
    const text = Buffer.from('this is plain text, not a PDF').toString('base64');
    const wrongType = await call('post', '/api/documents', patient).send({ file_name: 'fake.pdf', content_base64: text, organization_id: NOOR });
    expect(wrongType.status).toBe(415);

    const huge = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(4 * 1024 * 1024 + 10)]).toString('base64');
    const tooBig = await call('post', '/api/documents', patient).send({ file_name: 'big.pdf', content_base64: huge, organization_id: NOOR });
    expect(tooBig.status).toBe(413);

    expect((await call('post', '/api/documents', patient).send({ file_name: 'x.pdf' })).status).toBe(400);
    const { tinyPdfBase64 } = await import('./helpers.js');
    // A center where the patient is not registered.
    expect((await call('post', '/api/documents', patient).send({ file_name: 'x.pdf', content_base64: tinyPdfBase64, organization_id: '33333333-3333-3333-3333-333333333333' })).status).toBe(400);
  });

  it('keeps a clinician\'s document from the patient until a doctor reviews and releases it', async () => {
    const { tinyPdfBase64 } = await import('./helpers.js');
    const doctor = await as.doctorNoor();
    const patient = await as.patient();

    const up = await call('post', '/api/documents', doctor, NOOR).send({ patient_id: PATIENT_1, file_name: 'discharge-summary.pdf', content_base64: tinyPdfBase64, title: 'Discharge summary (synthetic)' });
    expect(up.status).toBe(201);
    expect(up.body.data.sourceType).toBe('clinician_uploaded');
    expect(up.body.data.visibleToPatient).toBe(false);
    const id = up.body.data.id;

    // Hidden from the patient: metadata, download and timeline all say "not found".
    expect((await call('get', `/api/documents/${id}`, patient)).status).toBe(404);
    expect((await call('get', `/api/documents/${id}/download`, patient)).status).toBe(404);
    const hidden = await call('get', '/api/portal/timeline?type=document&limit=200', patient);
    expect(ids(hidden.body.data)).not.toContain(`document:${id}`);

    // Reviewing without releasing keeps it hidden; releasing makes it visible, labelled reviewed.
    expect((await call('post', `/api/documents/${id}/review`, doctor, NOOR).send({ release: false })).status).toBe(200);
    expect((await call('get', `/api/documents/${id}`, patient)).status).toBe(404);
    const released = await call('post', `/api/documents/${id}/review`, doctor, NOOR).send({ release: true });
    expect(released.status).toBe(200);
    expect(released.body.data.reviewStatus).toBe('reviewed');
    const visible = await call('get', `/api/documents/${id}`, patient);
    expect(visible.status).toBe(200);
    expect(visible.body.data.sourceType).toBe('clinician_uploaded');

    // Only a doctor reviews; reception and the patient cannot.
    expect((await call('post', `/api/documents/${id}/review`, patient).send({ release: true })).status).toBe(403);
    expect((await call('post', `/api/documents/${id}/review`, await as.receptionNoor(), NOOR).send({ release: true })).status).toBe(403);
  });

  it('refuses reception, managers, coordinators and administrators', async () => {
    for (const token of [await as.receptionNoor(), await as.managerNoor(), await as.coordinatorNoor(), await as.admin()]) {
      expect((await call('get', `/api/documents?patientId=${PATIENT_1}`, token, NOOR)).status).toBe(403);
      expect((await call('get', '/api/documents/80000000-0000-0000-0000-000000000001/download', token, NOOR)).status).toBe(403);
    }
  });

  it('shares another center\'s released document only while consent is effective', async () => {
    const { tinyPdfBase64 } = await import('./helpers.js');
    const amalDoctor = await as.doctorAmal();
    const noorDoctor = await as.doctorNoor();
    const patient = await as.patient();

    const up = await call('post', '/api/documents', amalDoctor, AMAL).send({ patient_id: PATIENT_1, file_name: 'amal-report.pdf', content_base64: tinyPdfBase64, title: 'Amal report (synthetic)' });
    const id = up.body.data.id;

    // Unreleased: Al-Noor cannot see it even though a consent exists.
    expect((await call('get', `/api/documents/${id}`, noorDoctor, NOOR)).status).toBe(404);

    await call('post', `/api/documents/${id}/review`, amalDoctor, AMAL).send({ release: true });
    const shared = await call('get', `/api/documents/${id}`, noorDoctor, NOOR);
    expect(shared.status).toBe(200);
    expect(shared.body.data.isExternal).toBe(true);
    expect((await call('get', `/api/documents/${id}/download`, noorDoctor, NOOR)).status).toBe(200);

    // Revoke every active Al-Amal -> Al-Noor consent: access stops immediately.
    const consents = await call('get', '/api/portal/consents', patient);
    for (const c of consents.body.data.filter((x: any) => x.state === 'active' && x.from_organization_id === AMAL && x.to_organization_id === NOOR)) {
      await call('post', `/api/portal/consents/${c.id}/revoke`, patient);
    }
    expect((await call('get', `/api/documents/${id}`, noorDoctor, NOOR)).status).toBe(404);
    expect((await call('get', `/api/documents/${id}/download`, noorDoctor, NOOR)).status).toBe(404);

    // Restore the consent for any later suite.
    await call('post', '/api/portal/consents', patient).send({ from_organization_id: AMAL, to_organization_id: NOOR, scope: 'all', expires_in_days: 365 });
  });

  it('does not let a doctor reach a document of a patient at a center that does not hold them', async () => {
    // Patient 2 is only at Al-Noor. An Al-Amal doctor cannot list their documents.
    expect((await call('get', `/api/documents?patientId=${PATIENT_2}`, await as.doctorAmal(), AMAL)).status).toBe(404);
    expect((await call('get', '/api/documents/not-a-uuid', await as.doctorNoor(), NOOR)).status).toBe(404);
    expect(DOCTOR_AMAL).toBeTruthy();
  });
});
