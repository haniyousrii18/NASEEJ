import { app } from './app.js';
import { ENV } from './config/env.js';
import { pool } from './config/db.js';
import { scrubDeadShares } from './routes/shareRoutes.js';

async function startServer() {
  try {
    // Verify database connectivity
    await pool.query('SELECT 1');
    console.log(`[Database] Connected to PostgreSQL on ${ENV.DB_HOST}:${ENV.DB_PORT}/${ENV.DB_NAME}`);

    const server = app.listen(ENV.PORT, () => {
      console.log(`[Naseej API] Server running in ${ENV.NODE_ENV} mode on http://localhost:${ENV.PORT}`);
    });

    // Erase the frozen copy of expired or revoked shares (data minimization); once now, then hourly.
    const scrub = () => scrubDeadShares().catch((err) => console.error('[Shares] scrub failed:', err?.message));
    void scrub();
    const scrubTimer = setInterval(scrub, 60 * 60 * 1000);
    scrubTimer.unref();

    const shutdown = async () => {
      console.log('\n[Naseej API] Gracefully shutting down...');
      server.close(async () => {
        await pool.end();
        console.log('[Database] Connection pool closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('[Startup Failure] Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
