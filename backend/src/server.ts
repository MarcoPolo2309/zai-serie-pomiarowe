import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { ensureAdmin } from './bootstrap.js';
import { pool } from './db.js';

const app = await buildApp();
if (config.runMigrations) await migrate((m) => app.log.info(m));
await ensureAdmin((m) => app.log.info(m));

await app.listen({ port: config.port, host: '0.0.0.0' });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
