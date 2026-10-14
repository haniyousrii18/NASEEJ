import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db.js';

async function runSeed() {
  try {
    const seedSqlPath = path.resolve(process.cwd(), '../database/seeds/synthetic_seed.sql');
    const sql = fs.readFileSync(seedSqlPath, 'utf-8');
    console.log('[Seed] Applying synthetic seed data...');
    await pool.query(sql);
    console.log('[Seed] Synthetic seed data successfully applied.');
    await pool.end();
  } catch (err) {
    console.error('[Seed Error] Failed to run seed:', err);
    process.exit(1);
  }
}

runSeed();
