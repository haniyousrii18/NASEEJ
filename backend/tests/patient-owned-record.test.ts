import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { NOOR, PATIENT_1, as, call, tinyPdfBase64 } from './helpers.js';

/**
 * The patient-owned record: entries, symptoms, vault, visit summary, QR shares and the assistant boundary.
 * Runs against the seeded database like the other API tests. AI is off in CI, so the assistant tests check the honest
 * "not connected" behaviour and the fixed safety answers, which need no model.
 */
describe('patient-owned record', () => {
  let patient: string;
  let doctor: string;

  beforeAll(async () => {
    patient = await as.patient();
    doctor = await as.doctorNoor();
  });

  describe('access control', () => {
    it('refuses unauthenticated callers on every new surface', async () => {
      for (const path of ['/api/record/entries', '/api/record/symptoms', '/api/vault/documents', '/api/prep', '/api/shares', '/api/assistant/status']) {
        const res = await request(app).get(path);
        expect(res.status, path).toBe(401);
      }
    });

    it('refuses a clinician: these routes are for the patient who owns the record', async () => {
      for (const path of ['/api/record/entries', '/api/record/symptoms', '/api/vault/documents', '/api/prep', '/api/shares']) {
        const res = await call('get', path, doctor, NOOR);
        expect(res.status, path).toBe(403);
        expect(res.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
      }
    });

    it('reports an unknown or foreign id as not found, never as forbidden', async () => {
      const ghost = '99999999-9999-4999-8999-999999999999';
      expect((await call('patch', `/api/record/entries/${ghost}`, patient).send({ title: 'x' })).status).toBe(404);
      expect((await call('delete', `/api/record/symptoms/${ghost}`, patient)).status).toBe(404);
      expect((await call('get', `/api/vault/documents/${ghost}`, patient)).status).toBe(404);
      expect((await call('get', `/api/prep/${ghost}`, patient)).status).toBe(404);
      expect((await call('post', `/api/shares/${ghost}/revoke`, patient)).status).toBe(404);
      expect((await call('get', '/api/prep/not-a-uuid', patient)).status).toBe(404);
    });
  });

  describe('health entries', () => {
    it('creates, corrects, deletes and restores an entry, keeping its source', async () => {
      const created = await call('post', '/api/record/entries', patient).send({ kind: 'medication', title: 'Metformin', dose: '500 mg', frequency: 'twice daily' });
      expect(created.status).toBe(201);
      expect(created.body.data.source).toBe('patient');
      expect(created.body.data.reviewStatus).toBe('confirmed');
      const id = created.body.data.id;

      const patched = await call('patch', `/api/record/entries/${id}`, patient).send({ dose: '850 mg' });
      expect(patched.status).toBe(200);
      expect(patched.body.data.dose).toBe('850 mg');

      expect((await call('delete', `/api/record/entries/${id}`, patient)).status).toBe(200);
      const live = await call('get', '/api/record/entries?kind=medication', patient);
      expect(live.body.data.some((e: any) => e.id === id)).toBe(false);
      expect((await call('patch', `/api/record/entries/${id}`, patient).send({ dose: '1' })).status).toBe(404);

      expect((await call('post', `/api/record/entries/${id}/restore`, patient)).status).toBe(200);
      const again = await call('get', '/api/record/entries?kind=medication', patient);
      expect(again.body.data.some((e: any) => e.id === id)).toBe(true);
    });

    it('rejects invalid input with a consistent error shape', async () => {
      for (const body of [{ kind: 'nope', title: 'x' }, { kind: 'condition' }, { kind: 'measurement', title: 'Weight', value: '70' }, { kind: 'condition', title: 'x', start_date: '2020-02-31' }]) {
        const res = await call('post', '/api/record/entries', patient).send(body);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
      }
    });

    it('records an assistant-drafted entry as such, only because the patient posted it', async () => {
      const res = await call('post', '/api/record/entries', patient).send({ kind: 'allergy', title: 'Penicillin', reaction: 'rash', severity: 'moderate', captured_via: 'assistant' });
      expect(res.status).toBe(201);
      expect(res.body.data.source).toBe('assistant');
    });
  });

  describe('symptoms and timeline', () => {
    it('saves the full symptom, shows it on the timeline, and hides it after delete until restored', async () => {
      const created = await call('post', '/api/record/symptoms', patient).send({
        symptom_description: 'Headache on the right side',
        severity: 6,
        onset_date: '2026-01-10',
        duration_text: 'three days',
        frequency: 'intermittent',
        better_factors: 'rest',
        worse_factors: 'bright light',
      });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect(created.body.data.frequency).toBe('intermittent');

      const timeline = await call('get', '/api/portal/timeline?type=symptom_report&limit=100', patient);
      const item = timeline.body.data.find((i: any) => i.source.id === id);
      expect(item.data.betterFactors).toBe('rest');

      expect((await call('delete', `/api/record/symptoms/${id}`, patient)).status).toBe(200);
      const after = await call('get', '/api/portal/timeline?type=symptom_report&limit=100', patient);
      expect(after.body.data.some((i: any) => i.source.id === id)).toBe(false);
      expect((await call('post', `/api/record/symptoms/${id}/restore`, patient)).status).toBe(200);
    });

    it('rejects a future start date and an out-of-range severity', async () => {
      expect((await call('post', '/api/record/symptoms', patient).send({ symptom_description: 'x', severity: 5, onset_date: '2999-01-01' })).status).toBe(400);
      expect((await call('post', '/api/record/symptoms', patient).send({ symptom_description: 'x', severity: 11 })).status).toBe(400);
    });

    it('does not let a symptom link a document that is not in the patient vault', async () => {
      const res = await call('post', '/api/record/symptoms', patient).send({ symptom_description: 'x', severity: 3, document_ids: ['99999999-9999-4999-8999-999999999999'] });
      expect(res.status).toBe(400);
    });

    it('lists patient-recorded visits on the patient timeline only', async () => {
      const visit = await call('post', '/api/record/entries', patient).send({ kind: 'visit', title: 'Private clinic', event_date: '2026-02-01' });
      expect(visit.status).toBe(201);
      const tl = await call('get', '/api/portal/timeline?type=patient_entry&limit=50', patient);
      expect(tl.body.data.some((i: any) => i.source.id === visit.body.data.id && i.provenance === 'patient_reported')).toBe(true);
      const clinician = await call('get', `/api/patients/${PATIENT_1}/timeline?type=patient_entry`, doctor, NOOR);
      expect((clinician.body.data ?? []).some((i: any) => i.type === 'patient_entry')).toBe(false);
    });
  });

  describe('document vault', () => {
    let docId: string;

    it('stores a document with no center and keeps the original retrievable', async () => {
      const up = await call('post', '/api/vault/documents', patient).send({ file_name: 'blood.pdf', content_base64: tinyPdfBase64, title: 'Blood test', doc_type: 'lab_report', document_date: '2026-01-05', provider_name: 'City Lab' });
      expect(up.status).toBe(201);
      docId = up.body.data.id;
      expect(up.body.data.center).toBeNull();
      expect(up.body.data.docType).toBe('lab_report');

      const list = await call('get', '/api/vault/documents?q=blood&type=lab_report', patient);
      expect(list.body.data.some((d: any) => d.id === docId)).toBe(true);

      const file = await call('get', `/api/documents/${docId}/download`, patient);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('application/pdf');
    });

    it('is invisible to center staff', async () => {
      const res = await call('get', `/api/documents?patientId=${PATIENT_1}`, doctor, NOOR);
      expect((res.body.data ?? []).some((d: any) => d.source?.id === docId)).toBe(false);
      expect((await call('get', `/api/documents/${docId}/download`, doctor, NOOR)).status).toBe(404);
    });

    it('rejects files that are not PDF, PNG or JPEG, whatever their name says', async () => {
      const res = await call('post', '/api/vault/documents', patient).send({ file_name: 'x.pdf', content_base64: Buffer.from('<html>').toString('base64') });
      expect(res.status).toBe(415);
    });

    it('requires an explicit confirmation before a file is sent for AI reading, and is honest when AI is off', async () => {
      expect((await call('post', `/api/vault/documents/${docId}/analyze`, patient).send({})).status).toBe(400);
      const res = await call('post', `/api/vault/documents/${docId}/analyze`, patient).send({ confirm: true });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    });

    it('moves a document to the trash and back, and keeps it out of shares while deleted', async () => {
      expect((await call('delete', `/api/vault/documents/${docId}`, patient)).status).toBe(200);
      const live = await call('get', '/api/vault/documents', patient);
      expect(live.body.data.some((d: any) => d.id === docId)).toBe(false);
      const trash = await call('get', '/api/vault/documents?trash=1', patient);
      expect(trash.body.data.some((d: any) => d.id === docId)).toBe(true);
      expect((await call('get', `/api/documents/${docId}/download`, patient)).status).toBe(404);
      expect((await call('post', `/api/vault/documents/${docId}/restore`, patient)).status).toBe(200);
    });

    it('turns a machine-read suggestion into a record entry only when the patient confirms it', async () => {
      // A name unique to this run, so the test can be repeated on the same database.
      const drug = `Amlodipine-${Date.now()}`;
      const doc = await call('post', '/api/vault/documents', patient).send({ file_name: 'rx.pdf', content_base64: tinyPdfBase64, title: 'Rx' });
      const id = doc.body.data.id;
      const fact = await pool.query(
        `INSERT INTO document_facts (document_id, organization_id, patient_id, kind, label, value, unit, source_page, source_passage, original)
         VALUES ($1, NULL, $2, 'medication', $3, '5', 'mg', 1, 'Amlodipine 5 mg', '{}') RETURNING id`,
        [id, PATIENT_1, drug]
      );
      const factId = fact.rows[0].id;

      const before = await call('get', '/api/record/entries?kind=medication', patient);
      expect(before.body.data.some((e: any) => e.title === drug)).toBe(false);

      const sug = await call('get', `/api/vault/documents/${id}/suggestions`, patient);
      expect(sug.body.data.facts.map((f: any) => f.id)).toContain(factId);

      const ok = await call('post', `/api/vault/documents/${id}/suggestions/${factId}/confirm`, patient).send({ title: drug, dose: '5 mg' });
      expect(ok.status).toBe(201);
      const after = await call('get', '/api/record/entries?kind=medication', patient);
      const entry = after.body.data.find((e: any) => e.id === ok.body.data.entryId);
      expect(entry.source).toBe('document');
      expect(entry.sourceDocumentId).toBe(id);
      // Deciding twice is refused.
      expect((await call('post', `/api/vault/documents/${id}/suggestions/${factId}/dismiss`, patient)).status).toBe(404);
    });
  });

  describe('visit summary and QR sharing', () => {
    let prepId: string;
    let shareId: string;
    let token: string;
    let docId: string;

    beforeAll(async () => {
      const symptom = await call('post', '/api/record/symptoms', patient).send({ symptom_description: 'Cough for a week', severity: 3 });
      expect(symptom.status).toBe(201);
      const doc = await call('post', '/api/vault/documents', patient).send({ file_name: 'scan.pdf', content_base64: tinyPdfBase64, title: 'Chest scan' });
      docId = doc.body.data.id;
    });

    it('builds a draft from the record, with a source on every item, and does not let it be shared before approval', async () => {
      const res = await call('post', '/api/prep', patient).send({ reason: 'Persistent cough', lang: 'en' });
      expect(res.status).toBe(201);
      prepId = res.body.data.id;
      expect(res.body.data.status).toBe('draft');
      const sections = res.body.data.content.sections as any[];
      const items = sections.flatMap((s) => s.items);
      expect(items.length).toBeGreaterThan(0);
      for (const it of items) expect(it.source.label).toBeTruthy();

      const early = await call('post', '/api/shares', patient).send({ confirm: true, prep_id: prepId, expires_in_hours: 24 });
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('PREP_NOT_APPROVED');
    });

    it('rejects an edit that points at a record that is not the patient’s', async () => {
      const cur = (await call('get', `/api/prep/${prepId}`, patient)).body.data.content;
      cur.sections[0].items.push({ id: '11111111-1111-4111-8111-111111111111', text: 'forged', date: null, source: { kind: 'symptom', ref: '99999999-9999-4999-8999-999999999999', label: 'x' } });
      const res = await call('put', `/api/prep/${prepId}`, patient).send({ content: cur });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SOURCE');
    });

    it('needs an explicit approval, then creates a share with the token shown once', async () => {
      const content = (await call('get', `/api/prep/${prepId}`, patient)).body.data.content;
      content.sections.find((s: any) => s.key === 'questions').items.push({ id: '22222222-2222-4222-8222-222222222222', text: 'Do I need a scan?', date: null, source: { kind: 'patient', ref: null, label: 'Entered by me' } });
      content.sections.find((s: any) => s.key === 'questions').included = true;
      expect((await call('put', `/api/prep/${prepId}`, patient).send({ content })).status).toBe(200);

      expect((await call('post', `/api/prep/${prepId}/approve`, patient).send({})).status).toBe(400);
      const ok = await call('post', `/api/prep/${prepId}/approve`, patient).send({ confirm: true });
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('approved');

      expect((await call('post', '/api/shares', patient).send({ prep_id: prepId, expires_in_hours: 24 })).status).toBe(400); // no confirm
      expect((await call('post', '/api/shares', patient).send({ confirm: true, prep_id: prepId, expires_in_hours: 99999 })).status).toBe(400);

      const created = await call('post', '/api/shares', patient).send({ confirm: true, prep_id: prepId, expires_in_hours: 24, document_ids: [docId], include_identity: false, label: 'Dr Saad' });
      expect(created.status).toBe(201);
      token = created.body.data.token;
      shareId = created.body.data.id;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      // Only a hash is stored, never the token.
      const row = await pool.query('SELECT token_hash FROM record_shares WHERE id = $1', [shareId]);
      expect(row.rows[0].token_hash).not.toContain(token);
      expect(row.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);

      const list = await call('get', '/api/shares', patient);
      const mine = list.body.data.find((s: any) => s.id === shareId);
      expect(mine.state).toBe('active');
      expect(JSON.stringify(list.body)).not.toContain(token);
    });

    it('lets a clinician open it with no account, read-only, showing only what was approved', async () => {
      const res = await request(app).post('/api/share-view/view').send({ token });
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      const snap = res.body.data.snapshot;
      expect(snap.patient).toBeNull(); // identity switched off
      expect(snap.reason).toBe('Persistent cough');
      expect(snap.documents.map((d: any) => d.id)).toEqual([docId]);
      expect(JSON.stringify(snap)).not.toMatch(/national_id|storage_path|token/i);

      const file = await request(app).post('/api/share-view/document').send({ token, document_id: docId });
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('application/pdf');
      // A document of the same patient that was not selected stays closed.
      const other = await call('post', '/api/vault/documents', patient).send({ file_name: 'other.pdf', content_base64: tinyPdfBase64, title: 'Not shared' });
      const denied = await request(app).post('/api/share-view/document').send({ token, document_id: other.body.data.id });
      expect(denied.status).toBe(404);

      // Read-only: the public surface has no write verbs.
      expect((await request(app).put('/api/share-view/view').send({ token })).status).toBe(404);
    });

    it('records access events without addresses, and shows them to the patient', async () => {
      const events = await call('get', `/api/shares/${shareId}/events`, patient);
      expect(events.status).toBe(200);
      expect(events.body.data.map((e: any) => e.event)).toEqual(expect.arrayContaining(['view', 'document']));
      expect(JSON.stringify(events.body)).not.toMatch(/127\.0\.0\.1|::1/);
    });

    it('gives the same “not valid” answer for guesses and malformed tokens', async () => {
      const guess = await request(app).post('/api/share-view/view').send({ token: 'A'.repeat(43) });
      expect(guess.status).toBe(404);
      expect(guess.body.error.code).toBe('SHARE_NOT_FOUND');
      expect((await request(app).post('/api/share-view/view').send({ token: "' OR 1=1 --" })).status).toBe(404);
      expect((await request(app).post('/api/share-view/view').send({})).status).toBe(404);
    });

    it('stops working the moment it expires', async () => {
      await pool.query(`UPDATE record_shares SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [shareId]);
      const res = await request(app).post('/api/share-view/view').send({ token });
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('SHARE_EXPIRED');
      expect(JSON.stringify(res.body)).not.toContain('Persistent cough');
    });

    it('stops working the moment it is revoked, and only its owner can revoke', async () => {
      const fresh = await call('post', '/api/shares', patient).send({ confirm: true, prep_id: prepId, expires_in_hours: 1 });
      expect(fresh.status).toBe(201);
      const t = fresh.body.data.token;
      expect((await request(app).post('/api/share-view/view').send({ token: t })).status).toBe(200);
      expect((await call('post', `/api/shares/${fresh.body.data.id}/revoke`, doctor, NOOR)).status).toBe(403);
      expect((await call('post', `/api/shares/${fresh.body.data.id}/revoke`, patient)).status).toBe(200);
      const after = await request(app).post('/api/share-view/view').send({ token: t });
      expect(after.status).toBe(410);
      expect(after.body.error.code).toBe('SHARE_REVOKED');
    });

    it('cuts a document off from a share as soon as it is deleted', async () => {
      const d = await call('post', '/api/vault/documents', patient).send({ file_name: 'x.pdf', content_base64: tinyPdfBase64, title: 'Temp' });
      const s = await call('post', '/api/shares', patient).send({ confirm: true, prep_id: prepId, expires_in_hours: 1, document_ids: [d.body.data.id] });
      const t = s.body.data.token;
      expect((await request(app).post('/api/share-view/document').send({ token: t, document_id: d.body.data.id })).status).toBe(200);
      await call('delete', `/api/vault/documents/${d.body.data.id}`, patient);
      expect((await request(app).post('/api/share-view/document').send({ token: t, document_id: d.body.data.id })).status).toBe(404);
    });
  });

  describe('assistant boundary', () => {
    it('says honestly that no provider is connected', async () => {
      const res = await call('get', '/api/assistant/status', patient);
      expect(res.status).toBe(200);
      expect(res.body.data.configured).toBe(false);
      expect(res.body.data.provider).toBeNull();
    });

    it('answers an emergency description with the fixed message even when AI is off', async () => {
      const res = await call('post', '/api/assistant/chat', patient).send({ messages: [{ role: 'user', content: 'I have chest pain and cannot breathe' }], lang: 'en' });
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe('urgent');
      expect(res.body.data.message).toMatch(/emergency/i);
    });

    it('refuses diagnosis and medicine-change requests with fixed text', async () => {
      const res = await call('post', '/api/assistant/chat', patient).send({ messages: [{ role: 'user', content: 'Should I stop taking my pills?' }], lang: 'en' });
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe('refused');
    });

    it('does not pretend to answer an ordinary question when no provider is configured', async () => {
      const res = await call('post', '/api/assistant/chat', patient).send({ messages: [{ role: 'user', content: 'When was my last blood test?' }], lang: 'en' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    });

    it('validates the conversation', async () => {
      expect((await call('post', '/api/assistant/chat', patient).send({ messages: [] })).status).toBe(400);
      expect((await call('post', '/api/assistant/chat', patient).send({ messages: [{ role: 'assistant', content: 'hi' }] })).status).toBe(400);
    });

    it('offers the emergency check to the forms and plain record search with no AI', async () => {
      const safe = await call('post', '/api/assistant/safety', patient).send({ text: 'ألم في الصدر', lang: 'ar' });
      expect(safe.body.data.urgent).toBe(true);
      const calm = await call('post', '/api/assistant/safety', patient).send({ text: 'mild cough', lang: 'en' });
      expect(calm.body.data.urgent).toBe(false);
      const search = await call('get', '/api/record/search?q=cough', patient);
      expect(search.status).toBe(200);
      expect(Array.isArray(search.body.data)).toBe(true);
    });

    it('records interaction metadata only, never the question', async () => {
      const rows = await pool.query(`SELECT * FROM ai_interactions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 5`, [PATIENT_1]);
      expect(rows.rowCount).toBeGreaterThan(0);
      expect(Object.keys(rows.rows[0]).sort()).toEqual(['created_at', 'id', 'kind', 'latency_ms', 'model', 'outcome', 'patient_id', 'provider']);
    });

    it('needs the patient’s own switch before any record text could be sent to a provider', async () => {
      const on = await call('post', '/api/assistant/consent', patient).send({ allowed: true });
      expect(on.body.data.consent).toBe(true);
      expect((await call('get', '/api/assistant/status', patient)).body.data.consent).toBe(true);
      const off = await call('post', '/api/assistant/consent', patient).send({ allowed: false });
      expect(off.body.data.consent).toBe(false);
      expect((await call('post', '/api/assistant/consent', patient).send({ allowed: 'yes' })).status).toBe(400);
    });
  });

  describe('audit trail', () => {
    it('logs sensitive writes with ids and kinds, never with health content', async () => {
      const rows = await pool.query(`SELECT action, details FROM audit_logs WHERE actor_role = 'patient' AND action IN ('SHARE_CREATE','HEALTH_ENTRY_CREATE','SYMPTOM_CREATE') ORDER BY created_at DESC LIMIT 20`);
      expect(rows.rowCount).toBeGreaterThan(0);
      const blob = JSON.stringify(rows.rows);
      expect(blob).not.toMatch(/Metformin|Headache|Persistent cough|Penicillin/);
    });
  });
});
