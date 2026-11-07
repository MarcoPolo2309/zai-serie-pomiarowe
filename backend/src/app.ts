import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError, STATUS_TITLES } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { seriesRoutes } from './routes/series.js';
import { sensorRoutes } from './routes/sensors.js';
import { measurementRoutes } from './routes/measurements.js';
import { streamRoutes } from './routes/stream.js';

const PROBLEM = 'application/problem+json; charset=utf-8';

// Polityka CSP: tylko zasoby z własnego origin, bez inline skryptów
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

// Czy nagłówek Accept dopuszcza odpowiedź JSON (application/json, problem+json, wildcardy typu „*" + „/*" lub „application/*")
function acceptsJson(accept: string): boolean {
  return accept.split(',').some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    if (params.some((p) => /^\s*q\s*=\s*0(\.0*)?\s*$/.test(p))) return false;
    return ['*/*', 'application/*', 'application/json', 'application/problem+json'].includes(type!.trim()) || /^application\/.+\+json$/.test(type!.trim());
  });
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    trustProxy: true, // za reverse proxy hostingu (X-Forwarded-Proto/For)
    bodyLimit: 100 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
  });

  // Domyślny parser text/plain wyłączony: treść inna niż JSON → 415
  app.removeContentTypeParser('text/plain');

  // --- Wspólne nagłówki bezpieczeństwa + przekierowanie na HTTPS ---
  app.addHook('onRequest', async (req, reply) => {
    if (config.forceHttps && req.protocol !== 'https') {
      const host = req.headers.host ?? '';
      return reply.code(308).header('Location', `https://${host}${req.url}`).send();
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', CSP);
    if (config.isProd) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      // Negocjacja treści: 406, gdy klient nie akceptuje JSON (przed uwierzytelnianiem)
      const accept = req.headers.accept;
      if (req.url !== '/api/stream' && typeof accept === 'string' && accept.trim() !== '' && !acceptsJson(accept)) {
        throw new HttpError(406, 'Not Acceptable', 'API zwraca wyłącznie application/json');
      }
    }
  });

  // --- Błędy → application/problem+json (RFC 9457), bez śladów stosu ---
  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    let status = 500;
    let title = STATUS_TITLES[500]!;
    let detail: string | undefined;
    let errors: HttpError['errors'];

    if (err instanceof HttpError) {
      ({ status, title, errors } = err);
      detail = err.detail;
      for (const [k, v] of Object.entries(err.headers ?? {})) reply.header(k, v);
    } else if (typeof (err as FastifyError).statusCode === 'number' && (err as FastifyError).statusCode! < 500) {
      status = (err as FastifyError).statusCode!;
      title = STATUS_TITLES[status] ?? 'Bad Request';
      const code = (err as FastifyError).code;
      if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') { status = 415; title = STATUS_TITLES[415]!; detail = 'Obsługiwany format treści: application/json'; }
      else if (code === 'FST_ERR_CTP_EMPTY_JSON_BODY') { status = 400; title = STATUS_TITLES[400]!; detail = 'Treść żądania jest pusta'; }
      else if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || err instanceof SyntaxError) { status = 400; title = STATUS_TITLES[400]!; detail = 'Niepoprawny JSON'; }
      else if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') { status = 413; title = STATUS_TITLES[413]!; detail = 'Treść żądania jest zbyt duża'; }
      else detail = 'Niepoprawne żądanie';
    } else {
      req.log.error({ err }, 'Nieobsłużony błąd');
      detail = 'Wystąpił błąd wewnętrzny serwera';
    }
    const body: Record<string, unknown> = { type: 'about:blank', title, status, instance: req.url.split('?')[0] };
    if (detail) body.detail = detail;
    if (errors?.length) body.errors = errors;
    return reply.code(status).header('Content-Type', PROBLEM).send(JSON.stringify(body));
  });

  // --- Trasy API ---
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/health/db', async () => { await pool.query('SELECT 1'); return { status: 'ok' }; });
  await app.register(authRoutes);
  await app.register(seriesRoutes);
  await app.register(sensorRoutes);
  await app.register(measurementRoutes);
  await app.register(streamRoutes);

  // --- Frontend (SPA), jeśli zbudowany ---
  const dir = config.frontendDir ? path.resolve(config.frontendDir) : undefined;
  const hasFrontend = !!dir && fs.existsSync(path.join(dir, 'index.html'));
  if (hasFrontend) {
    await app.register(fastifyStatic, { root: dir!, wildcard: false, index: ['index.html'] });
  }

  app.setNotFoundHandler((req, reply) => {
    const isApi = req.url.startsWith('/api/') || req.url === '/api';
    if (!isApi && req.method === 'GET' && hasFrontend && (req.headers.accept ?? '').includes('text/html')) {
      return reply.sendFile('index.html'); // fallback routingu po stronie klienta
    }
    if (!isApi && req.method === 'GET' && !hasFrontend && req.url.split('?')[0] === '/') {
      return reply.type('text/plain; charset=utf-8').send('Serie pomiarowe – API działa. Interfejs użytkownika nie jest zbudowany.\n');
    }
    return reply.code(404).header('Content-Type', PROBLEM).send(JSON.stringify({
      type: 'about:blank', title: 'Not Found', status: 404, detail: 'Zasób nie istnieje', instance: req.url.split('?')[0],
    }));
  });

  return app;
}
