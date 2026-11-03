import type { FastifyInstance } from 'fastify';
import { pool, tx } from '../db.js';
import { requireAdmin } from '../auth.js';
import { conflict, notFound } from '../errors.js';
import { parseId, parseSeriesInput } from '../validate.js';
import { bus } from '../bus.js';

const COLS = `id, name, min_value AS "minValue", max_value AS "maxValue", color, icon, unit`;

export async function seriesRoutes(app: FastifyInstance) {
  app.get('/api/series', async () => {
    const { rows } = await pool.query(`SELECT ${COLS} FROM series ORDER BY id`);
    return rows;
  });

  app.post('/api/series', { onRequest: [requireAdmin] }, async (req, reply) => {
    const s = parseSeriesInput(req.body);
    const { rows } = await pool.query(
      `INSERT INTO series (name, min_value, max_value, color, icon, unit) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
      [s.name.trim(), s.minValue, s.maxValue, s.color, s.icon, s.unit]);
    bus.emit('event', { type: 'series-changed', data: { id: rows[0].id } });
    return reply.code(201).header('Location', `/api/series/${rows[0].id}`).send(rows[0]);
  });

  app.get<{ Params: { id: string } }>('/api/series/:id', async (req) => {
    const id = parseId(req.params.id);
    if (id === null) throw notFound('Seria nie istnieje');
    const { rows } = await pool.query(`SELECT ${COLS} FROM series WHERE id = $1`, [id]);
    if (!rows[0]) throw notFound('Seria nie istnieje');
    return rows[0];
  });

  app.put<{ Params: { id: string } }>('/api/series/:id', { onRequest: [requireAdmin] }, async (req) => {
    const s = parseSeriesInput(req.body);
    const id = parseId(req.params.id);
    if (id === null) throw notFound('Seria nie istnieje');
    const updated = await tx(async (c) => {
      // Blokada wiersza serii: równoległy zapis wyniku (FOR SHARE) czeka na zakończenie zmiany przedziału
      const lock = await c.query('SELECT id FROM series WHERE id = $1 FOR UPDATE', [id]);
      if (!lock.rows[0]) throw notFound('Seria nie istnieje');
      const out = await c.query(
        'SELECT 1 FROM measurements WHERE series_id = $1 AND (value < $2 OR value > $3) LIMIT 1', [id, s.minValue, s.maxValue]);
      if (out.rows[0]) throw conflict('Nowy przedział wykluczałby wyniki już zapisane w tej serii');
      const { rows } = await c.query(
        `UPDATE series SET name=$2, min_value=$3, max_value=$4, color=$5, icon=$6, unit=$7 WHERE id=$1 RETURNING ${COLS}`,
        [id, s.name.trim(), s.minValue, s.maxValue, s.color, s.icon, s.unit]);
      return rows[0];
    });
    bus.emit('event', { type: 'series-changed', data: { id } });
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/series/:id', { onRequest: [requireAdmin] }, async (req, reply) => {
    const id = parseId(req.params.id);
    if (id === null) throw notFound('Seria nie istnieje');
    // ON DELETE CASCADE usuwa czujniki, wyniki i wpisy dziennika odrzuceń
    const { rowCount } = await pool.query('DELETE FROM series WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Seria nie istnieje');
    bus.emit('event', { type: 'series-changed', data: { id } });
    return reply.code(204).send();
  });
}
