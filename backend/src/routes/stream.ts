import type { FastifyInstance } from 'fastify';
import { bus } from '../bus.js';

/**
 * Rozszerzenie kontraktu: GET /api/stream (Server-Sent Events).
 * Publikuje zdarzenie `measurement` przy każdym zapisanym wyniku oraz `series-changed` przy zmianie konfiguracji.
 */
export async function streamRoutes(app: FastifyInstance) {
  app.get('/api/stream', async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write('retry: 3000\n\n');
    const onEvent = (e: { type: string; data: unknown }) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
    bus.on('event', onEvent);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.raw.on('close', () => { clearInterval(ping); bus.off('event', onEvent); });
  });
}
