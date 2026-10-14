import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db.js';

async function runMigrate() {
  try {
    const migrationSqlPath = path.resolve(process.cwd(), '../database/migrations/001_initial_schema.sql');
    const sql = fs.readFileSync(migrationSqlPath, 'utf-8');
    console.log('[Migration] Applying initial schema migration...');
    await pool.query(sql);
    console.log('[Migration] Schema migration completed successfully.');
    await pool.end();
  } catch (err) {
    console.error('[Migration Error] Failed to run migration:', err);
    process.exit(1);
  }
}

runMigrate();
