import pg from 'pg';
import { config } from './config.js';

// BIGINT (int8) jako liczba – identyfikatory wyników są małe, mieszczą się w zakresie JS
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000, // zapas na wybudzenie bazy w darmowym hostingu
  keepAlive: true,
});

// Błąd nieużywanego połączenia nie może zabić procesu
pool.on('error', (err) => console.error(JSON.stringify({ level: 'error', msg: 'pg pool error', err: err.message })));

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
