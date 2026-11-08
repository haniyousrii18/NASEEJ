import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { hashOf } from '../src/services/translation/service.js';
import { NOOR, PATIENT_1, as, call } from './helpers.js';

/**
 * Search over the patient's own record: live freshness, ownership, bilingual aliases, typo tolerance and bounds.
 * Runs against the seeded database like the other API tests. Rows it creates are removed again.
 */
describe('record search API', () => {
  let patient: string;
  let doctor: string;
  const made: string[] = [];
  const search = (q: string, extra = '') => call('get', `/api/search?q=${encodeURIComponent(q)}${extra}`, patient);
  const titles = (res: request.Response) => (res.body.data as Array<{ title: string }>).map((h) => h.title);

  beforeAll(async () => {
    patient = await as.patient();
    doctor = await as.doctorNoor();
  });

  afterAll(async () => {
    for (const id of made) await pool.query('DELETE FROM health_entries WHERE id = $1', [id]);
    await pool.query(`DELETE FROM content_translations WHERE patient_id = $1 AND provider = 'search-test'`, [PATIENT_1]);
  });

  it('is closed to anonymous callers and to clinicians', async () => {
    expect((await request(app).get('/api/search?q=test')).status).toBe(401);
    const res = await call('get', '/api/search?q=test', doctor, NOOR);
    expect(res.status).toBe(403);
  });

  it('validates the query, the types and the limits', async () => {
    expect((await search('a')).status).toBe(400);
    expect((await search('x'.repeat(101))).status).toBe(400);
    expect((await search('test', '&types=banana')).status).toBe(400);
    const res = await search('test', '&limit=9999&offset=-5');
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(200);
    expect(res.body.meta.offset).toBe(0);
  });

  it('finds a new record at once, follows an edit, and forgets a deleted one', async () => {
    const created = await call('post', '/api/record/entries', patient).send({ kind: 'medication', title: 'Zolpitrex', dose: '10 mg', frequency: 'at night' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    made.push(id);

    expect(titles(await search('zolpitrex'))).toContain('Zolpitrex');
    expect(titles(await search('zolpitrx'))).toContain('Zolpitrex'); // one letter missing
    expect(titles(await search('zolpitrex', '&types=allergy'))).not.toContain('Zolpitrex'); // type filter

    await call('patch', `/api/record/entries/${id}`, patient).send({ title: 'Quillamet' });
    expect(titles(await search('zolpitrex'))).not.toContain('Zolpitrex');
    expect(titles(await search('quillamet'))).toContain('Quillamet');

    await call('delete', `/api/record/entries/${id}`, patient);
    expect(titles(await search('quillamet'))).not.toContain('Quillamet');
    await call('post', `/api/record/entries/${id}/restore`, patient);
    expect(titles(await search('quillamet'))).toContain('Quillamet');
  });

  it('finds Arabic through other spellings, in either interface language', async () => {
    const created = await call('post', '/api/record/entries', patient).send({ kind: 'condition', title: 'ارتفاع ضغط الدم الشرياني' });
    made.push(created.body.data.id);
    for (const q of ['ضغط', 'ضَغْط', 'الضغط الشرياني', 'ضغط الشرياين']) {
      for (const lang of ['ar', 'en']) {
        expect(titles(await search(q, `&lang=${lang}`)), `${q} / ${lang}`).toContain('ارتفاع ضغط الدم الشرياني');
      }
    }
  });

  it('finds across languages only through a stored translation, and shows the original text', async () => {
    const created = await call('post', '/api/record/entries', patient).send({ kind: 'allergy', title: 'حساسية الفستق السوداني' });
    made.push(created.body.data.id);
    expect(titles(await search('peanut'))).not.toContain('حساسية الفستق السوداني'); // no alias yet, nothing is guessed

    await pool.query(
      `INSERT INTO content_translations (patient_id, source_hash, target_lang, source_lang, translated_text, provider) VALUES ($1,$2,'en','ar',$3,'search-test') ON CONFLICT DO NOTHING`,
      [PATIENT_1, hashOf('حساسية الفستق السوداني'), 'Peanut allergy'],
    );
    const res = await search('peanut', '&lang=en');
    const hit = res.body.data.find((h: any) => h.id === created.body.data.id);
    expect(hit).toBeTruthy();
    expect(hit.title).toBe('حساسية الفستق السوداني'); // the original, not the translation
    expect(hit.matched.via).toBe('translation');
  });

  it('returns only the signed-in patient\'s records, each once', async () => {
    const mine = await call('get', '/api/record/entries?limit=200', patient);
    const ownIds = new Set((mine.body.data as Array<{ id: string }>).map((e) => e.id));
    const res = await search('طبي', '&types=condition,medication,allergy,procedure,measurement,visit');
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(ownIds.has(id)).toBe(true);
  });

  it('narrows the symptom and document lists the same way', async () => {
    const docs = await call('get', '/api/vault/documents?q=%D8%AA%D8%AD%D8%A7%D9%84%D9%8A%D9%84', patient);
    expect(docs.status).toBe(200);
    const symptoms = await call('get', '/api/record/symptoms?q=zzzzzzzz', patient);
    expect(symptoms.status).toBe(200);
    expect(symptoms.body.data).toEqual([]);
  });

  it('pages through results', async () => {
    const first = await search('a b', '&limit=1');
    expect(first.status).toBe(200);
    expect(first.body.data.length).toBeLessThanOrEqual(1);
    expect(first.body.meta).toHaveProperty('total');
  });
});
