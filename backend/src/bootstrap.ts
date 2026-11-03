import { pool } from './db.js';
import { config } from './config.js';
import { hashPassword } from './crypto.js';

/** Tworzy konto administratora z ADMIN_USERNAME/ADMIN_PASSWORD tylko wtedy, gdy jeszcze nie istnieje.
 *  Istniejące hasło (np. zmienione z poziomu interfejsu) nie jest nadpisywane. */
export async function ensureAdmin(log: (m: string) => void = console.log): Promise<void> {
  if (!config.adminPassword) {
    log('ADMIN_PASSWORD nie ustawione – pomijam tworzenie konta administratora');
    return;
  }
  const exists = await pool.query('SELECT 1 FROM admins WHERE username = $1', [config.adminUsername]);
  if (exists.rows[0]) return;
  await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
    [config.adminUsername, await hashPassword(config.adminPassword)]);
  log(`utworzono konto administratora „${config.adminUsername}”`);
}
