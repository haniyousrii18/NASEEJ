import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db.js';
import { resolveStoredPath } from '../src/services/storageService.js';
import { buildDraft } from '../src/services/health/prep.js';
import { generateToken, hashToken } from '../src/services/health/shareToken.js';

const seedsDir = path.resolve(process.cwd(), '../database/seeds');
const PATIENT = '10000000-0000-0000-0000-000000000001';

// A tiny, valid, text-only PDF so the synthetic document records have a real file behind them.
function syntheticPdf(title: string): Buffer {
  const body = `BT /F1 14 Tf 72 720 Td (${title} - synthetic demonstration document, no real patient data.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += `${String(o).padStart(10, '0')} 00000 n \n`));
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Empties every table except the migration log, so the seed always leaves the same small demo. */
async function resetData() {
  const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'")).rows.map((r) => `"${r.tablename}"`);
  if (tables.length) await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}

/** Two visit summaries (one approved and shared, one draft) built from the seeded record, and one active share. */
async function seedPrepsAndShare() {
  const approvedContent = await buildDraft(PATIENT, 'ar', 'متابعة ضغط الدم والصداع المتكرر');
  const draftContent = await buildDraft(PATIENT, 'ar', 'فحص دوري');

  const approved = (await pool.query(
    `INSERT INTO visit_preps (patient_id, visit_date, status, content, approved_at) VALUES ($1, CURRENT_DATE + 5, 'approved', $2, NOW() - INTERVAL '1 hour') RETURNING id, to_char(visit_date,'YYYY-MM-DD') AS visit_date`,
    [PATIENT, JSON.stringify(approvedContent)]
  )).rows[0];
  await pool.query(`INSERT INTO visit_preps (patient_id, visit_date, status, content) VALUES ($1, CURRENT_DATE + 25, 'draft', $2)`, [PATIENT, JSON.stringify(draftContent)]);

  const doc = (await pool.query(`SELECT id, COALESCE(title, file_name) AS title, doc_type, provider_name, mime_type, file_size, to_char(document_date,'YYYY-MM-DD') AS document_date FROM documents WHERE id = '80000000-0000-0000-0000-000000000001'`)).rows[0];
  const patient = (await pool.query(`SELECT full_name_ar, to_char(date_of_birth,'YYYY-MM-DD') AS dob FROM patient_profiles WHERE id = $1`, [PATIENT])).rows[0];
  const label = 'زيارة د. فيصل';
  const snapshot = {
    v: 1,
    lang: approvedContent.lang,
    createdAt: new Date().toISOString(),
    label,
    patient: { name: patient.full_name_ar, dateOfBirth: patient.dob },
    visitDate: approved.visit_date,
    reason: approvedContent.reason,
    overview: approvedContent.overview,
    sections: approvedContent.sections
      .filter((s) => s.included && s.items.length > 0 && s.key !== 'documents')
      .map((s) => ({ key: s.key, items: s.items.map((i) => ({ text: i.text, date: i.date, source: i.source.label })) })),
    documents: [{ id: doc.id, title: doc.title, docType: doc.doc_type, providerName: doc.provider_name, mimeType: doc.mime_type, fileSize: Number(doc.file_size), documentDate: doc.document_date }],
  };
  // The token is not kept anywhere: this demo share can be listed and revoked but its QR cannot be shown again.
  const share = (await pool.query(
    `INSERT INTO record_shares (patient_id, prep_id, token_hash, label, snapshot, expires_at, view_count, last_viewed_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '20 hours', 1, NOW() - INTERVAL '30 minutes') RETURNING id`,
    [PATIENT, approved.id, hashToken(generateToken()), label, JSON.stringify(snapshot)]
  )).rows[0];
  await pool.query('INSERT INTO share_documents (share_id, document_id) VALUES ($1, $2)', [share.id, doc.id]);
  await pool.query(`INSERT INTO share_access_events (share_id, event, device, occurred_at) VALUES ($1, 'view', 'mobile', NOW() - INTERVAL '30 minutes')`, [share.id]);
}

async function runSeed() {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
      throw new Error('Refusing to empty a production database. Set SEED_FORCE=true only if that is really what you want.');
    }
    const has005 = (await pool.query("SELECT to_regclass('public.health_entries') AS t")).rows[0].t !== null;
    if (!has005) throw new Error('Migrations are not applied. Run `npm --prefix backend run migrate` first.');

    console.log('[Seed] Emptying every table and applying the small synthetic demo...');
    await resetData();
    await pool.query(fs.readFileSync(path.join(seedsDir, 'synthetic_seed.sql'), 'utf-8'));

    // The demo files: replace the previous ones so no stale demo document remains on disk.
    const first = resolveStoredPath('demo/x.pdf');
    if (first) await fs.promises.rm(path.dirname(first), { recursive: true, force: true });
    const docs = await pool.query("SELECT id, storage_path, title FROM documents WHERE storage_path LIKE 'demo/%'");
    for (const doc of docs.rows) {
      const full = resolveStoredPath(doc.storage_path);
      if (!full) continue;
      await fs.promises.mkdir(path.dirname(full), { recursive: true });
      const pdf = syntheticPdf(doc.title.replace(/[^\x20-\x7e]/g, '') || 'Document');
      await fs.promises.writeFile(full, pdf);
      await pool.query('UPDATE documents SET file_size = $1 WHERE id = $2', [pdf.length, doc.id]);
    }

    await seedPrepsAndShare();
    console.log('[Seed] Done. Sign in as patient@naseej.health / Password123!');
    await pool.end();
  } catch (err) {
    console.error('[Seed Error] Failed to run seed:', err);
    process.exit(1);
  }
}

runSeed();
