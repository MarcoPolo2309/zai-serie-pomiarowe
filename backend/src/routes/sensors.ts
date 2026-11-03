import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { FieldError, badRequest, notFound, unprocessable } from '../errors.js';
import { asObject, parseId } from '../validate.js';

const SELECT = `
  SELECT s.id, s.name, s.series_id AS "seriesId", s.created_at AS "createdAt",
         (SELECT max(m.ts) FROM measurements m WHERE m.sensor_id = s.id) AS "lastMeasurementAt"
  FROM sensors s`;

export async function sensorRoutes(app: FastifyInstance) {
  app.get('/api/sensors', { onRequest: [requireAdmin] }, async () => {
    const { rows } = await pool.query(`${SELECT} ORDER BY s.id`);
    return rows;
  });

  app.post('/api/sensors', { onRequest: [requireAdmin] }, async (req, reply) => {
    const { name, seriesId } = asObject(req.body);
    const errors: FieldError[] = [];
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      errors.push({ field: 'name', message: 'Wymagany napis o długości 1–100 znaków' });
    }
    const sid = typeof seriesId === 'number' && Number.isInteger(seriesId) ? seriesId
      : typeof seriesId === 'string' ? parseId(seriesId) : null;
    if (sid === null) errors.push({ field: 'seriesId', message: 'Wymagany identyfikator serii' });
    if (errors.length) throw badRequest('Niepoprawne dane czujnika', errors);

    const exists = sid! >= 1 && sid! <= 2_147_483_647
      && (await pool.query('SELECT 1 FROM series WHERE id = $1', [sid])).rows[0];
    if (!exists) throw unprocessable('Seria o podanym identyfikatorze nie istnieje', [{ field: 'seriesId', message: 'Seria nie istnieje' }]);

    // Klucz: 256 bitów losowości (43 znaki base64url); w bazie tylko skrót SHA-256
    const apiKey = randomToken();
    let row;
    try {
      ({ rows: [row] } = await pool.query(
        `INSERT INTO sensors (name, series_id, api_key_hash) VALUES ($1,$2,$3)
         RETURNING id, name, series_id AS "seriesId", created_at AS "createdAt", NULL::timestamptz AS "lastMeasurementAt"`,
        [(name as string).trim(), sid, sha256Hex(apiKey)]));
    } catch (e) {
      if ((e as { code?: string }).code === '23503') { // seria usunięta w międzyczasie
        throw unprocessable('Seria o podanym identyfikatorze nie istnieje', [{ field: 'seriesId', message: 'Seria nie istnieje' }]);
      }
      throw e;
    }
    return reply.code(201).header('Location', `/api/sensors/${row.id}`).send({ ...row, apiKey });
  });

  app.get<{ Params: { id: string } }>('/api/sensors/:id', { onRequest: [requireAdmin] }, async (req) => {
    const id = parseId(req.params.id);
    if (id === null) throw notFound('Czujnik nie istnieje');
    const { rows } = await pool.query(`${SELECT} WHERE s.id = $1`, [id]);
    if (!rows[0]) throw notFound('Czujnik nie istnieje');
    return rows[0];
  });

  app.delete<{ Params: { id: string } }>('/api/sensors/:id', { onRequest: [requireAdmin] }, async (req, reply) => {
    const id = parseId(req.params.id);
    if (id === null) throw notFound('Czujnik nie istnieje');
    // Wyniki zostają (measurements.sensor_id ON DELETE SET NULL); klucz przestaje działać od razu
    const { rowCount } = await pool.query('DELETE FROM sensors WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Czujnik nie istnieje');
    return reply.code(204).send();
  });
}
