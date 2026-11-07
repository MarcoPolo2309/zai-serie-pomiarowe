import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { ensureAdmin } from '../src/bootstrap.js';
import { pool } from '../src/db.js';

let app: FastifyInstance;
let token: string;
const created: number[] = [];

const auth = () => ({ authorization: `Bearer ${token}` });
async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({ method, url, payload: payload as object | undefined, headers });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined, headers: res.headers };
}
async function makeSeries(min = 0, max = 100) {
  const r = await call('POST', '/api/series', { name: `TEST-${Date.now()}-${created.length}`, minValue: min, maxValue: max, color: '#112233' }, auth());
  created.push(r.body.id);
  return r.body.id as number;
}
async function makeSensor(seriesId: number) {
  const r = await call('POST', '/api/sensors', { name: 'czujnik', seriesId }, auth());
  return r.body as { id: number; apiKey: string };
}

beforeAll(async () => {
  app = await buildApp();
  await migrate(() => {});
  await ensureAdmin(() => {});
  const r = await call('POST', '/api/auth/login', { username: 'admin', password: 'test-password' });
  token = r.body.accessToken;
});

afterAll(async () => {
  for (const id of created) await pool.query('DELETE FROM series WHERE id = $1', [id]);
  await app.close();
  await pool.end();
});

describe('autoryzacja', () => {
  it('odrzuca operacje administracyjne bez tokenu (401)', async () => {
    expect((await call('POST', '/api/series', { name: 'x', minValue: 0, maxValue: 1, color: '#000000' })).status).toBe(401);
    expect((await call('GET', '/api/sensors')).status).toBe(401);
    expect((await call('DELETE', '/api/series/1')).status).toBe(401);
  });

  it('odrzuca zły login i hasło (401), poprawny daje token', async () => {
    expect((await call('POST', '/api/auth/login', { username: 'admin', password: 'zle' })).status).toBe(401);
    expect(token).toBeTruthy();
  });

  it('wylogowanie unieważnia token', async () => {
    const t = (await call('POST', '/api/auth/login', { username: 'admin', password: 'test-password' })).body.accessToken;
    expect((await call('POST', '/api/auth/logout', undefined, { authorization: `Bearer ${t}` })).status).toBe(204);
    expect((await call('GET', '/api/auth/me', undefined, { authorization: `Bearer ${t}` })).status).toBe(401);
  });
});

describe('walidacja zakresu', () => {
  it('odrzuca min >= max (422) i zły kolor (400)', async () => {
    expect((await call('POST', '/api/series', { name: 'x', minValue: 5, maxValue: 5, color: '#000000' }, auth())).status).toBe(422);
    expect((await call('POST', '/api/series', { name: 'x', minValue: 0, maxValue: 5, color: 'red' }, auth())).status).toBe(400);
  });

  it('wynik spoza przedziału daje 422 i trafia do logu odrzuceń', async () => {
    const sid = await makeSeries(0, 10);
    const sensor = await makeSensor(sid);
    const key = { 'x-api-key': sensor.apiKey };
    expect((await call('POST', '/api/measurements', { value: 10 }, key)).status).toBe(201); // granica włączona
    expect((await call('POST', '/api/measurements', { value: 10.1 }, key)).status).toBe(422);
    const rej = await call('GET', '/api/rejections', undefined, auth());
    expect(rej.body.some((r: { seriesId: number; value: number }) => r.seriesId === sid && r.value === 10.1)).toBe(true);
  });

  it('odrzuca znacznik czasu z przyszłości (422), zezwala na przeszłość', async () => {
    const sensor = await makeSensor(await makeSeries());
    const key = { 'x-api-key': sensor.apiKey };
    const future = new Date(Date.now() + 3600e3).toISOString();
    expect((await call('POST', '/api/measurements', { value: 1, timestamp: future }, key)).status).toBe(422);
    expect((await call('POST', '/api/measurements', { value: 1, timestamp: '2020-01-01T00:00:00Z' }, key)).status).toBe(201);
  });

  it('zmiana przedziału wykluczająca zapisane wyniki daje 409', async () => {
    const sid = await makeSeries(0, 100);
    const sensor = await makeSensor(sid);
    await call('POST', '/api/measurements', { value: 80 }, { 'x-api-key': sensor.apiKey });
    const body = { name: 'zmieniona', minValue: 0, maxValue: 50, color: '#112233' };
    expect((await call('PUT', `/api/series/${sid}`, body, auth())).status).toBe(409);
    expect((await call('PUT', `/api/series/${sid}`, { ...body, maxValue: 90 }, auth())).status).toBe(200);
  });

  it('wyników nie można modyfikować ani usuwać', async () => {
    const sensor = await makeSensor(await makeSeries());
    const m = await call('POST', '/api/measurements', { value: 1 }, { 'x-api-key': sensor.apiKey });
    for (const method of ['PUT', 'DELETE'] as const) {
      expect([404, 405]).toContain((await call(method, `/api/measurements/${m.body.id}`, { value: 2 }, auth())).status);
    }
  });
});

describe('klucze czujników', () => {
  it('klucz ma min. 32 znaki, nie jest zwracany ponownie i nie jest zapisany jawnie', async () => {
    const sid = await makeSeries();
    const sensor = await makeSensor(sid);
    expect(sensor.apiKey.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify((await call('GET', '/api/sensors', undefined, auth())).body)).not.toContain(sensor.apiKey);
    const { rows } = await pool.query('SELECT api_key_hash FROM sensors WHERE id = $1', [sensor.id]);
    expect(rows[0].api_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].api_key_hash).not.toBe(sensor.apiKey);
  });

  it('token administratora nie wystarcza do wysłania wyniku (401)', async () => {
    expect((await call('POST', '/api/measurements', { value: 1 }, auth())).status).toBe(401);
  });

  it('po wyrejestrowaniu klucz przestaje działać, a wyniki zostają', async () => {
    const sensor = await makeSensor(await makeSeries());
    const key = { 'x-api-key': sensor.apiKey };
    const m = await call('POST', '/api/measurements', { value: 1 }, key);
    expect((await call('DELETE', `/api/sensors/${sensor.id}`, undefined, auth())).status).toBe(204);
    expect((await call('POST', '/api/measurements', { value: 1 }, key)).status).toBe(401);
    expect((await call('GET', `/api/measurements/${m.body.id}`)).status).toBe(200);
  });
});
