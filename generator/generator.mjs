#!/usr/bin/env node
// Generator danych (emulator czujnika) – wysyła wyniki do POST /api/measurements.
// Bez zależności zewnętrznych; wymaga Node.js 20+ (wbudowany fetch).
import { parseArgs } from 'node:util';

const HELP = `Generator danych – emulator czujnika

Użycie:
  node generator.mjs --api <URL> --key <KLUCZ> [opcje]
  ZAI_API_KEY=<KLUCZ> node generator.mjs --api <URL> --count 48 --start "2026-11-01T00:00:00Z" --interval 3600

Parametry:
  --api <URL>        adres aplikacji/API, np. https://moja-app.example.com   (lub zmienna ZAI_API_URL)
  --key <klucz>      klucz API czujnika                                       (lub zmienna ZAI_API_KEY)
  --count <n>        liczba wyników do wysłania (domyślnie 20; w trybie --live: bez limitu, gdy nie podano)
  --interval <s>     odstęp między wynikami w sekundach (domyślnie 60)
                     tryb historyczny: odstęp między ZNACZNIKAMI CZASU kolejnych wyników
                     tryb --live: rzeczywista przerwa między wysyłkami
  --mode <tryb>      sine | random | walk | range   (domyślnie sine)
                     sine   – przebieg sinusoidalny między --min a --max (okres: --period)
                     random – losowa wartość równomierna z [--min, --max]
                     walk   – błądzenie losowe w [--min, --max]
                     range  – kolejne wartości równomiernie od --min do --max
  --min <x>          dolna granica generowanych wartości (domyślnie 0)
  --max <x>          górna granica generowanych wartości (domyślnie 100)
  --noise <x>        amplituda szumu dodawanego do sinusa, jako ułamek zakresu (domyślnie 0.05)
  --period <n>       okres sinusa w liczbie wyników (domyślnie 24)
  --start <ISO>      znacznik czasu pierwszego wyniku (tryb historyczny); domyślnie: teraz − (count−1)·interval
  --live             wysyłaj bieżące wyniki (znacznik = chwila wysłania) co --interval sekund
  --force-value <x>  wyślij podaną wartość zamiast wygenerowanej (np. poza zakresem, by pokazać odrzucenie)
  --dry-run          tylko wypisz wyniki, niczego nie wysyłaj
  --help             ta pomoc
`;

const { values: o } = parseArgs({
  options: {
    api: { type: 'string' }, key: { type: 'string' }, count: { type: 'string' }, interval: { type: 'string', default: '60' },
    mode: { type: 'string', default: 'sine' }, min: { type: 'string', default: '0' }, max: { type: 'string', default: '100' },
    noise: { type: 'string', default: '0.05' }, period: { type: 'string', default: '24' }, start: { type: 'string' },
    live: { type: 'boolean', default: false }, 'force-value': { type: 'string' }, 'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});
if (o.help) { console.log(HELP); process.exit(0); }

const fail = (msg) => { console.error(`Błąd: ${msg}\n(użyj --help, aby zobaczyć parametry)`); process.exit(2); };
const num = (name, v) => { const n = Number(v); if (!Number.isFinite(n)) fail(`parametr --${name} musi być liczbą`); return n; };

const api = (o.api ?? process.env.ZAI_API_URL ?? '').replace(/\/+$/, '');
const key = o.key ?? process.env.ZAI_API_KEY;
if (!api) fail('podaj adres API: --api <URL> (lub ZAI_API_URL)');
if (!key && !o['dry-run']) fail('podaj klucz API czujnika: --key <KLUCZ> (lub ZAI_API_KEY)');
if (!['sine', 'random', 'walk', 'range'].includes(o.mode)) fail('--mode: sine | random | walk | range');
const min = num('min', o.min), max = num('max', o.max), intervalS = num('interval', o.interval);
const noise = num('noise', o.noise), period = Math.max(2, num('period', o.period));
if (min >= max) fail('--min musi być mniejsze od --max');
if (intervalS <= 0) fail('--interval musi być dodatnie');
const count = o.count !== undefined ? Math.floor(num('count', o.count)) : (o.live ? Infinity : 20);
if (!(count >= 1)) fail('--count musi być co najmniej 1');
let startMs;
if (o.start) { startMs = Date.parse(o.start); if (Number.isNaN(startMs)) fail('--start musi być datą ISO 8601, np. 2026-11-01T00:00:00Z'); }
if (o.live && o.start) fail('--live i --start wykluczają się');
const forced = o['force-value'] !== undefined ? num('force-value', o['force-value']) : undefined;

// --- generowanie wartości ---
let walk = (min + max) / 2;
function nextValue(i) {
  if (forced !== undefined) return forced;
  const span = max - min;
  let v;
  switch (o.mode) {
    case 'random': v = min + Math.random() * span; break;
    case 'walk': walk = Math.min(max, Math.max(min, walk + (Math.random() - 0.5) * span * 0.1)); v = walk; break;
    case 'range': v = count > 1 && Number.isFinite(count) ? min + (span * i) / (count - 1) : min; break;
    default: { // sine
      const base = (Math.sin((2 * Math.PI * i) / period) + 1) / 2;
      v = min + span * (0.1 + 0.8 * base) + (Math.random() - 0.5) * span * noise;
      v = Math.min(max, Math.max(min, v));
    }
  }
  return Math.round(v * 100) / 100;
}

async function post(body) {
  const res = await fetch(`${api}/api/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000), // zapas na wybudzenie darmowego hostingu
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { /* ignoruj */ }
  return { status: res.status, json };
}

const stats = { sent: 0, rejected: 0, failed: 0 };
async function sendOne(i, timestamp) {
  const value = nextValue(i);
  const body = timestamp ? { value, timestamp: new Date(timestamp).toISOString() } : { value };
  const label = `#${i + 1} ${body.timestamp ?? 'teraz'} wartość=${value}`;
  if (o['dry-run']) { console.log(`[dry-run] ${label}`); return; }
  try {
    const r = await post(body);
    if (r.status === 201) { stats.sent++; console.log(`✔ wysłano  ${label}  (id=${r.json?.id})`); }
    else if (r.status === 422) { stats.rejected++; console.error(`✘ ODRZUCONO ${label}\n    powód: ${r.json?.detail ?? 'wartość lub czas poza dozwolonym zakresem'}`); }
    else if (r.status === 401) { console.error('✘ Klucz API jest niepoprawny albo czujnik został wyrejestrowany (401). Przerywam.'); process.exit(1); }
    else { stats.failed++; console.error(`✘ Błąd ${r.status} ${label}: ${r.json?.detail ?? r.json?.title ?? ''}`); }
  } catch (e) { stats.failed++; console.error(`✘ Błąd połączenia ${label}: ${e.message}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stop = false;
process.on('SIGINT', () => { stop = true; });

console.log(`Generator: api=${api} tryb=${o.mode} zakres=[${min}, ${max}] ${o.live ? `LIVE co ${intervalS}s` : 'historyczny'}`);
if (o.live) {
  for (let i = 0; i < count && !stop; i++) { await sendOne(i); if (i < count - 1 && !stop) await sleep(intervalS * 1000); }
} else {
  const t0 = startMs ?? Date.now() - (count - 1) * intervalS * 1000;
  for (let i = 0; i < count && !stop; i++) await sendOne(i, t0 + i * intervalS * 1000);
}
console.log(`\nPodsumowanie: wysłano ${stats.sent}, odrzucono ${stats.rejected}, błędy ${stats.failed}`);
process.exit(stats.rejected || stats.failed ? 1 : 0);
