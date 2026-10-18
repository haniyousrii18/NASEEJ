import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db.js';
import { resolveStoredPath } from '../src/services/storageService.js';

const seedsDir = path.resolve(process.cwd(), '../database/seeds');

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

async function runSeed() {
  try {
    console.log('[Seed] Applying synthetic seed data...');
    await pool.query(fs.readFileSync(path.join(seedsDir, 'synthetic_seed.sql'), 'utf-8'));

    // Seed 002 needs migration 002 (care coordination, document provenance). Skip it cleanly when absent.
    const has002 = (await pool.query("SELECT to_regclass('public.care_cases') AS t")).rows[0].t !== null;
    if (has002) {
      await pool.query(fs.readFileSync(path.join(seedsDir, 'synthetic_seed_002.sql'), 'utf-8'));
      const docs = await pool.query("SELECT id, storage_path, title FROM documents WHERE storage_path LIKE 'demo/%'");
      for (const doc of docs.rows) {
        const full = resolveStoredPath(doc.storage_path);
        if (!full) continue;
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        const pdf = syntheticPdf(doc.title);
        await fs.promises.writeFile(full, pdf);
        await pool.query('UPDATE documents SET file_size = $1 WHERE id = $2', [pdf.length, doc.id]);
      }
      console.log('[Seed] Synthetic seed 002 (longitudinal record + coordination demo) applied.');
    } else {
      console.log('[Seed] Migration 002 not applied: skipped seed 002. Run `npm run migrate` first.');
    }

    // Seed 003 needs migration 003 (caregiver delegations, operational messages, AI review).
    const has003 = (await pool.query("SELECT to_regclass('public.caregiver_delegations') AS t")).rows[0].t !== null;
    if (has003) {
      await pool.query(fs.readFileSync(path.join(seedsDir, 'synthetic_seed_003.sql'), 'utf-8'));
      console.log('[Seed] Synthetic seed 003 (caregiver demo account and delegation) applied.');
    } else {
      console.log('[Seed] Migration 003 not applied: skipped seed 003. Run `npm run migrate` first.');
    }

    console.log('[Seed] Synthetic seed data successfully applied.');
    await pool.end();
  } catch (err) {
    console.error('[Seed Error] Failed to run seed:', err);
    process.exit(1);
  }
}

runSeed();
