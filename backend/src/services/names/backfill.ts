import { query } from '../../config/db.js';
import { completeName } from './transliterate.js';

const ARABIC = '[ء-ي]';

/**
 * Accounts whose name is stored in one script only: before names were written in both, sign-up put the typed name in both
 * columns, so an Arabic name showed in the English workspace (and the other way round). Each such row gets the missing side
 * written from the other. Rows already in both scripts are left exactly as they are. Not a name change: the 30-day wait
 * is not touched. Safe to run on every start.
 */
export async function backfillNameScripts(): Promise<number> {
  let fixed = 0;
  for (const table of ['users', 'patient_profiles'] as const) {
    const rows = (
      await query(`SELECT id, full_name_ar, full_name_en FROM ${table} WHERE full_name_en ~ $1 OR full_name_ar !~ $1`, [ARABIC])
    ).rows as Array<{ id: string; full_name_ar: string | null; full_name_en: string | null }>;
    for (const r of rows) {
      const next = completeName({ ar: r.full_name_ar, en: r.full_name_en });
      if (!next.ar || !next.en || (next.ar === r.full_name_ar && next.en === r.full_name_en)) continue;
      await query(`UPDATE ${table} SET full_name_ar = $2, full_name_en = $3 WHERE id = $1`, [r.id, next.ar, next.en]);
      fixed++;
    }
  }
  return fixed;
}
