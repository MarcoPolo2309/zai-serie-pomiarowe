#!/usr/bin/env node
// Dane przykładowe (F11): wszystko przez publiczne API.
// 1) loguje się jako administrator, 2) zakłada brakujące serie i czujniki, 3) uruchamia generator z kluczem czujnika.
// Nic nie trafia do bazy bezpośrednio. Klucze czujników żyją tylko w pamięci i zmiennej środowiskowej procesu potomnego.
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { values: o } = parseArgs({
  options: {
    api: { type: 'string' }, user: { type: 'string', default: 'admin' }, pass: { type: 'string' },
    hours: { type: 'string', default: '48' }, help: { type: 'boolean', default: false },
  },
});
const api = (o.api ?? process.env.ZAI_API_URL ?? '').replace(/\/+$/, '');
const pass = o.pass ?? process.env.ZAI_ADMIN_PASSWORD;
if (o.help || !api || !pass) {
  console.log('Użycie: node scripts/seed.mjs --api <URL> --user admin --pass <hasło> [--hours 48]\n' +
    '(hasło można podać też zmienną ZAI_ADMIN_PASSWORD)');
  process.exit(o.help ? 0 : 2);
}
const hours = Math.max(15, Number(o.hours) || 48);
const generator = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../generator/generator.mjs');

// Domena: monitoring środowiska w Warszawie
const SERIES = [
  { name: 'Temperatura', unit: '°C', minValue: -40, maxValue: 50, color: '#d62728', icon: 'circle', sensor: 'Czujnik temperatury – Mokotów', gen: { mode: 'sine', min: 6, max: 20 } },
  { name: 'Wilgotność', unit: '%', minValue: 0, maxValue: 100, color: '#1f5fbf', icon: 'square', sensor: 'Czujnik wilgotności – Mokotów', gen: { mode: 'walk', min: 45, max: 85 } },
  { name: 'PM2.5', unit: 'µg/m³', minValue: 0, maxValue: 500, color: '#7a4a00', icon: 'triangle', sensor: 'Miernik PM2.5 – Ursynów', gen: { mode: 'walk', min: 8, max: 55 } },
  { name: 'Ciśnienie', unit: 'hPa', minValue: 900, maxValue: 1100, color: '#2a7a2a', icon: 'diamond', sensor: 'Barometr – Śródmieście', gen: { mode: 'sine', min: 1002, max: 1024, noise: 0.02, period: 36 } },
];

async function call(method, p, { body, token } = {}) {
  const res = await fetch(api + p, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : undefined; } catch { /* brak JSON */ }
  return { status: res.status, json };
}

const login = await call('POST', '/api/auth/login', { body: { username: o.user, password: pass } });
if (login.status !== 200) { console.error(`Logowanie nie powiodło się (HTTP ${login.status})`); process.exit(1); }
const token = login.json.accessToken;

const existing = (await call('GET', '/api/series')).json ?? [];
let failures = 0;
for (const spec of SERIES) {
  let series = existing.find((s) => s.name === spec.name);
  if (series) {
    const n = (await call('GET', `/api/measurements?series=${series.id}&limit=10000`)).json?.length ?? 0;
    if (n >= 15) { console.log(`= seria „${spec.name}” już ma ${n} wyników – pomijam`); continue; }
  } else {
    const r = await call('POST', '/api/series', { token, body: { name: spec.name, minValue: spec.minValue, maxValue: spec.maxValue, color: spec.color, icon: spec.icon, unit: spec.unit } });
    if (r.status !== 201) { console.error(`Nie udało się utworzyć serii ${spec.name}: HTTP ${r.status}`); process.exit(1); }
    series = r.json;
    console.log(`+ utworzono serię „${spec.name}” (id=${series.id})`);
  }
  const s = await call('POST', '/api/sensors', { token, body: { name: spec.sensor, seriesId: series.id } });
  if (s.status !== 201) { console.error(`Nie udało się zarejestrować czujnika: HTTP ${s.status}`); process.exit(1); }
  console.log(`+ zarejestrowano czujnik „${spec.sensor}”, wysyłam ${hours} wyników generatorem...`);
  const args = [generator, '--api', api, '--count', String(hours), '--interval', '3600', '--mode', spec.gen.mode, '--min', String(spec.gen.min), '--max', String(spec.gen.max)];
  if (spec.gen.noise !== undefined) args.push('--noise', String(spec.gen.noise));
  if (spec.gen.period !== undefined) args.push('--period', String(spec.gen.period));
  const run = spawnSync(process.execPath, args, { env: { ...process.env, ZAI_API_KEY: s.json.apiKey }, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const tail = (run.stdout ?? '').trim().split('\n').pop();
  console.log(`  ${tail}`);
  if (run.status !== 0) failures++;
}
await call('POST', '/api/auth/logout', { token });
console.log(failures ? `\nZakończono z błędami (${failures})` : '\nGotowe: dane przykładowe wprowadzone przez API.');
process.exit(failures ? 1 : 0);
