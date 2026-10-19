import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db.js';

/**
 * Database health checks, run by CI after the migrations are applied.
 *
 *   tsx scripts/check-database.ts schema     structure checks on the migrated database
 *   tsx scripts/check-database.ts rollback   applies every rollback file newest-first, then confirms only 001 is left
 *
 * CI migrates again after `rollback`, which proves the up -> down -> up cycle works. Never point this at a
 * database that holds real data: `rollback` drops tables.
 */
const root = path.resolve(process.cwd(), '../database/migrations');
const migrationFiles = () => fs.readdirSync(root).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

async function schema() {
  const applied = (await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version);
  for (const file of migrationFiles()) check(applied.includes(file), `migration ${file} is recorded as applied`);

  const noPk = await pool.query<{ table_name: string }>(`
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')`);
  check(noPk.rowCount === 0, `every table has a primary key${noPk.rowCount ? ` (missing: ${noPk.rows.map((r) => r.table_name).join(', ')})` : ''}`);

  const badIdx = await pool.query<{ indexrelid: string }>(
    `SELECT indexrelid::regclass::text AS indexrelid FROM pg_index i JOIN pg_namespace n ON n.oid = (SELECT relnamespace FROM pg_class WHERE oid = i.indrelid)
     WHERE n.nspname = 'public' AND NOT i.indisvalid`
  );
  check(badIdx.rowCount === 0, `no invalid indexes${badIdx.rowCount ? ` (${badIdx.rows.map((r) => r.indexrelid).join(', ')})` : ''}`);

  // A foreign key column without an index makes deletes and joins scan the whole child table.
  const unindexed = await pool.query<{ t: string; col: string }>(`
    SELECT c.conrelid::regclass::text AS t, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])`);
  if (unindexed.rowCount) {
    console.log(`warn ${unindexed.rowCount} foreign key column(s) have no leading index (informational): ${unindexed.rows.map((r) => `${r.t}.${r.col}`).join(', ')}`);
  }

  const tables = (await pool.query('SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = $1', ['public'])).rows[0].n;
  check(tables > 10, `schema has its tables (${tables})`);
}

async function rollback() {
  const down = fs.readdirSync(path.join(root, 'rollback')).filter((f) => /^\d{3}_down\.sql$/.test(f)).sort().reverse();
  check(down.length > 0, `found ${down.length} rollback file(s)`);
  for (const file of down) {
    const prefix = file.slice(0, 3);
    const sql = fs.readFileSync(path.join(root, 'rollback', file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE version LIKE $1', [`${prefix}\_%`]);
      await client.query('COMMIT');
      check(true, `rollback ${file} applies cleanly`);
    } catch (err) {
      await client.query('ROLLBACK');
      check(false, `rollback ${file} applies cleanly: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  const left = (await pool.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
  check(left.length === 1 && left[0] === migrationFiles()[0], `only the base migration remains (${left.join(', ')})`);
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'schema') await schema();
  else if (mode === 'rollback') await rollback();
  else {
    console.error('usage: check-database.ts schema|rollback');
    process.exit(2);
  }
  await pool.end();
  if (failures.length) {
    console.error(`\n${failures.length} database check(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
