import fs from 'fs';
import { pool } from '../config/db.js';
import { resolveStoredPath } from './storageService.js';

/**
 * Removes an account that someone created themselves by email, together with everything they stored: their record, documents (and
 * the files on disk), shares, translations, sign-in links and notifications. There is no delete button in the site yet, so this is
 * how a developer or an administrator does it.
 *
 * It refuses anything that did not come from the sign-up screen (the demo patient, accounts made by the seed or by an
 * administrator), so the wrong account can never be removed by a typo.
 */
export type DeletionPlan =
  | { ok: false; reason: 'not_found' | 'not_self_registered' }
  | { ok: true; userId: string; patientId: string | null; email: string; counts: Record<string, number>; files: string[] };

const COUNTED: Array<[string, string]> = [
  ['symptoms', 'SELECT count(*)::int AS n FROM symptom_reports WHERE patient_id = $1'],
  ['record entries', 'SELECT count(*)::int AS n FROM health_entries WHERE patient_id = $1'],
  ['documents', 'SELECT count(*)::int AS n FROM documents WHERE patient_id = $1'],
  ['visit summaries', 'SELECT count(*)::int AS n FROM visit_preps WHERE patient_id = $1'],
  ['shares', 'SELECT count(*)::int AS n FROM record_shares WHERE patient_id = $1'],
  ['translations', 'SELECT count(*)::int AS n FROM content_translations WHERE patient_id = $1'],
];

export async function planAccountDeletion(email: string): Promise<DeletionPlan> {
  const u = await pool.query('SELECT id, email, auth_provider_id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  const user = u.rows[0];
  if (!user) return { ok: false, reason: 'not_found' };
  if (!String(user.auth_provider_id).startsWith('local_signup_')) return { ok: false, reason: 'not_self_registered' };

  const p = await pool.query('SELECT id FROM patient_profiles WHERE user_id = $1', [user.id]);
  const patientId: string | null = p.rows[0]?.id ?? null;
  const counts: Record<string, number> = {};
  let files: string[] = [];
  if (patientId) {
    for (const [label, sql] of COUNTED) {
      try {
        counts[label] = (await pool.query(sql, [patientId])).rows[0].n;
      } catch {
        /* a table this database does not have (an older schema): nothing to count */
      }
    }
    files = (await pool.query('SELECT storage_path FROM documents WHERE patient_id = $1', [patientId])).rows.map((r) => r.storage_path).filter(Boolean);
  }
  return { ok: true, userId: user.id, patientId, email: user.email, counts, files };
}

/** Deletes the planned account. Database first, in one transaction; the files only after it has committed. */
export async function deleteAccount(plan: Extract<DeletionPlan, { ok: true }>): Promise<{ filesRemoved: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The profile first: its record, documents, shares and translations go with it, which frees the user row to be deleted.
    if (plan.patientId) await client.query('DELETE FROM patient_profiles WHERE id = $1', [plan.patientId]);
    await client.query('DELETE FROM users WHERE id = $1', [plan.userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  let filesRemoved = 0;
  for (const rel of plan.files) {
    const full = resolveStoredPath(rel);
    if (!full) continue;
    try {
      await fs.promises.unlink(full);
      filesRemoved++;
    } catch {
      /* already gone */
    }
  }
  return { filesRemoved };
}
