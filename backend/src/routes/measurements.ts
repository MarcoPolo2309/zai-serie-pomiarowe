import type { FastifyInstance } from 'fastify';
import { pool, tx } from '../db.js';
import { requireAdmin, requireSensor } from '../auth.js';
import { badRequest, notFound, unauthorized, unprocessable } from '../errors.js';
import { asObject, parseId, parseIso } from '../validate.js';
import { bus } from '../bus.js';

const FUTURE_TOLERANCE_MS = 5 * 60_000;

const COLS = `id, series_id AS "seriesId", sensor_id AS "sensorId", value, ts AS timestamp`;

type Reject = { reason: string; detail: string; field: string };

export async function measurementRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Record<string, string | string[] | undefined> }>('/api/measurements', async (req) => {
    const q = req.query;
    const one = (k: string): string | undefined => {
      const v = q[k];
      if (Array.isArray(v)) throw badRequest(`Parametr ${k} podano wielokrotnie`);
      return v;
    };
    let seriesIds: number[] | null = null;
    const seriesParam = one('series');
    if (seriesParam !== undefined && seriesParam !== '') {
      const parts = seriesParam.split(',').map((x) => x.trim());
      const ids = parts.map((p) => parseId(p));
      if (ids.some((x) => x === null) || ids.length > 200) throw badRequest('Parametr series musi być listą identyfikatorów rozdzielonych przecinkami');
      seriesIds = ids as number[];
    }
    const parseTs = (k: string): Date | null => {
      const v = one(k);
      if (v === undefined) return null;
      const d = parseIso(v);
      if (!d) throw badRequest(`Parametr ${k} musi być datą ISO 8601 ze strefą czasową`);
      return d;
    };
    const from = parseTs('from');
    const to = parseTs('to');
    const sort = one('sort') ?? 'timestamp';
    if (sort !== 'timestamp' && sort !== '-timestamp') throw badRequest('Parametr sort przyjmuje wartości timestamp lub -timestamp');
    const limitParam = one('limit');
    let limit = 1000;
    if (limitParam !== undefined) {
      if (!/^\d{1,6}$/.test(limitParam) || Number(limitParam) < 1 || Number(limitParam) > 10000) {
        throw badRequest('Parametr limit musi być liczbą całkowitą od 1 do 10000');
      }
      limit = Number(limitParam);
    }
    const dir = sort === 'timestamp' ? 'ASC' : 'DESC'; // wartość z białej listy, nie od użytkownika
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM measurements
       WHERE ($1::int[] IS NULL OR series_id = ANY($1))
         AND ($2::timestamptz IS NULL OR ts >= $2)
         AND ($3::timestamptz IS NULL OR ts <= $3)
       ORDER BY ts ${dir}, id ${dir} LIMIT $4`,
      [seriesIds, from, to, limit]);
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/measurements/:id', async (req) => {
    const id = parseId(req.params.id, Number.MAX_SAFE_INTEGER);
    if (id === null) throw notFound('Wynik nie istnieje');
    const { rows } = await pool.query(`SELECT ${COLS} FROM measurements WHERE id = $1`, [id]);
    if (!rows[0]) throw notFound('Wynik nie istnieje');
    return rows[0];
  });

  // Jedyna droga zapisu wyników: czujnik z kluczem API. Seria wynika z klucza.
  app.post('/api/measurements', { onRequest: [requireSensor] }, async (req, reply) => {
    const { value, timestamp } = asObject(req.body);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw badRequest('Pole value jest wymagane i musi być liczbą', [{ field: 'value', message: 'Wymagana liczba' }]);
    }
    let ts = new Date();
    if (timestamp !== undefined && timestamp !== null) {
      const parsed = typeof timestamp === 'string' ? parseIso(timestamp) : null;
      if (!parsed) throw badRequest('Pole timestamp musi być datą ISO 8601 ze strefą czasową', [{ field: 'timestamp', message: 'Niepoprawna data' }]);
      ts = parsed;
    }
    const sensor = req.sensor!;

    const outcome = await tx<{ row?: Record<string, unknown>; reject?: Reject; range?: [number, number] }>(async (c) => {
      // FOR SHARE: równoległa zmiana przedziału serii (FOR UPDATE) poczeka na ten zapis
      const s = await c.query<{ min_value: number; max_value: number }>(
        `SELECT s.min_value, s.max_value FROM sensors k JOIN series s ON s.id = k.series_id
         WHERE k.id = $1 FOR SHARE OF s`, [sensor.id]);
      if (!s.rows[0]) throw unauthorized('Brak lub niepoprawny klucz API czujnika', 'ApiKey');
      const { min_value: min, max_value: max } = s.rows[0];

      let reject: Reject | undefined;
      if (value < min || value > max) {
        reject = { reason: 'out_of_range', field: 'value', detail: `Wartość ${value} jest poza dopuszczalnym przedziałem serii [${min}, ${max}]` };
      } else if (ts.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
        reject = { reason: 'future_timestamp', field: 'timestamp', detail: 'Znacznik czasu wybiega więcej niż 5 minut w przyszłość' };
      }
      if (reject) {
        await c.query(
          'INSERT INTO rejected_measurements (series_id, sensor_id, value, ts, reason) VALUES ($1,$2,$3,$4,$5)',
          [sensor.seriesId, sensor.id, value, ts, reject.reason]);
        return { reject, range: [min, max] };
      }
      const ins = await c.query(
        `INSERT INTO measurements (series_id, sensor_id, value, ts) VALUES ($1,$2,$3,$4) RETURNING ${COLS}`,
        [sensor.seriesId, sensor.id, value, ts]);
      return { row: ins.rows[0] };
    });

    if (outcome.reject) {
      req.log.warn({ event: 'measurement_rejected', sensorId: sensor.id, seriesId: sensor.seriesId, value, reason: outcome.reject.reason },
        'Odrzucono wynik pomiaru');
      throw unprocessable(outcome.reject.detail, [{ field: outcome.reject.field, message: outcome.reject.detail }]);
    }
    bus.emit('event', { type: 'measurement', data: outcome.row });
    return reply.code(201).header('Location', `/api/measurements/${outcome.row!.id}`).send(outcome.row);
  });

  // Rozszerzenie kontraktu: dziennik odrzuconych wyników (administrator)
  app.get<{ Querystring: { limit?: string } }>('/api/rejections', { onRequest: [requireAdmin] }, async (req) => {
    const limit = req.query.limit && /^\d{1,3}$/.test(req.query.limit) ? Math.min(Math.max(Number(req.query.limit), 1), 500) : 100;
    const { rows } = await pool.query(
      `SELECT r.id, r.series_id AS "seriesId", s.name AS "seriesName", r.sensor_id AS "sensorId", k.name AS "sensorName",
              r.value, r.ts AS timestamp, r.reason, r.created_at AS "createdAt"
       FROM rejected_measurements r
       JOIN series s ON s.id = r.series_id
       LEFT JOIN sensors k ON k.id = r.sensor_id
       ORDER BY r.created_at DESC, r.id DESC LIMIT $1`, [limit]);
    return rows;
  });
}
