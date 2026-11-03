import type { FastifyRequest } from 'fastify';
import { pool } from './db.js';
import { sha256Hex } from './crypto.js';
import { unauthorized } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    admin?: { id: number; sessionId: number };
    sensor?: { id: number; seriesId: number };
  }
}

/** Wyciąga token z nagłówka `Authorization: Bearer <token>`. */
function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return null;
  const m = /^Bearer\s+([\x21-\x7e]{1,512})$/i.exec(h.trim());
  return m ? m[1]! : null;
}

/** Guard (onRequest): wymaga ważnej sesji administratora. Wykonuje się przed parsowaniem treści żądania. */
export async function requireAdmin(req: FastifyRequest): Promise<void> {
  const token = bearerToken(req);
  if (!token) throw unauthorized();
  const { rows } = await pool.query<{ id: number; admin_id: number }>(
    'SELECT id, admin_id FROM sessions WHERE token_hash = $1 AND expires_at > now()',
    [sha256Hex(token)],
  );
  const s = rows[0];
  if (!s) throw unauthorized();
  req.admin = { id: s.admin_id, sessionId: s.id };
}

/** Guard (onRequest): wymaga klucza API czujnika w nagłówku X-API-Key (token administratora nie wystarcza). */
export async function requireSensor(req: FastifyRequest): Promise<void> {
  const key = req.headers['x-api-key'];
  if (typeof key !== 'string' || key.length < 1 || key.length > 256) throw unauthorized('Brak lub niepoprawny klucz API czujnika', 'ApiKey');
  const { rows } = await pool.query<{ id: number; series_id: number }>(
    'SELECT id, series_id FROM sensors WHERE api_key_hash = $1',
    [sha256Hex(key)],
  );
  const s = rows[0];
  if (!s) throw unauthorized('Brak lub niepoprawny klucz API czujnika', 'ApiKey');
  req.sensor = { id: s.id, seriesId: s.series_id };
}
