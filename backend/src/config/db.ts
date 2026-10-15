import pg from 'pg';
import { ENV } from './env.js';

const { Pool } = pg;

// A calendar DATE (appointment day, birth date) has no time zone. Returned as the plain "YYYY-MM-DD" text instead of a
// JavaScript Date, it cannot shift by a day when the server and the browser sit in different zones.
pg.types.setTypeParser(1082, (value: string) => value);

export const pool = new Pool({
  host: ENV.DB_HOST,
  port: ENV.DB_PORT,
  database: ENV.DB_NAME,
  user: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  ssl: ENV.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Error] Unexpected error on idle client:', err);
});

/**
 * Runs `work` inside one database transaction (BEGIN / COMMIT, ROLLBACK on error).
 * Use it for multi-step changes that must stay consistent, e.g. check-then-insert under an advisory lock.
 */
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the original error is the useful one */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (ENV.NODE_ENV === 'development' && duration > 500) {
    console.warn(`[Slow Query] ${duration}ms: ${text.substring(0, 100)}...`);
  }
  return res;
}
