import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db.js';

/**
 * Ordered, tracked migrations.
 *
 * - Files `database/migrations/NNN_name.sql` run in numeric order; each runs once, inside a transaction,
 *   and is recorded in `schema_migrations`.
 * - 001 begins with DROP TABLE statements (a from-scratch bootstrap). It is therefore NEVER run against a
 *   database that already has the Naseej schema: such a database is baselined (001 marked as applied) and
 *   only the newer, additive migrations are applied.
 * - `--reset` (or MIGRATE_RESET=true) deliberately re-runs 001 and everything after it. It destroys data.
 */
const migrationsDir = path.resolve(process.cwd(), '../database/migrations');

async function tableExists(name: string): Promise<boolean> {
  const res = await pool.query('SELECT to_regclass($1) AS t', [`public.${name}`]);
  return res.rows[0].t !== null;
}

async function runMigrate() {
  const reset = process.argv.includes('--reset') || process.env.MIGRATE_RESET === 'true';
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => /^\d{3}_.+\.sql$/.test(f))
      .sort();

    if (reset) {
      console.warn('[Migration] --reset: re-running every migration from 001. Existing data will be destroyed.');
      await pool.query('DELETE FROM schema_migrations');
    }

    let applied = new Set<string>((await pool.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));

    // Baseline: a database created by the old single-file runner has the schema but no history.
    if (!reset && applied.size === 0 && (await tableExists('organizations'))) {
      const baseline = files[0];
      await pool.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [baseline]);
      applied = new Set([baseline]);
      console.log(`[Migration] Existing schema detected: baselined ${baseline} without re-running it.`);
    }

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`[Migration] Applying ${file} ...`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    console.log('[Migration] Schema is up to date.');
    await pool.end();
  } catch (err) {
    console.error('[Migration Error] Failed to run migration:', err);
    process.exit(1);
  }
}

runMigrate();
