import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { config } from '../config.js';
import { getDummyHash, hashPassword, randomToken, sha256Hex, verifyPassword } from '../crypto.js';
import { requireAdmin } from '../auth.js';
import { badRequest, forbidden, unauthorized, unprocessable } from '../errors.js';
import { asObject } from '../validate.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = asObject(req.body);
    const { username, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 64 || password.length > 256) {
      throw badRequest('Wymagane pola username i password', [
        ...(typeof username !== 'string' || !username ? [{ field: 'username', message: 'Wymagany napis' }] : []),
        ...(typeof password !== 'string' || !password ? [{ field: 'password', message: 'Wymagany napis' }] : []),
      ]);
    }
    const { rows } = await pool.query<{ id: number; password_hash: string }>(
      'SELECT id, password_hash FROM admins WHERE username = $1', [username]);
    const admin = rows[0];
    // Weryfikacja zawsze, także dla nieistniejącego użytkownika – brak różnicy czasu odpowiedzi
    const ok = await verifyPassword(admin?.password_hash ?? (await getDummyHash()), password);
    if (!admin || !ok) throw unauthorized('Niepoprawna nazwa użytkownika lub hasło');

    const token = randomToken();
    await pool.query(
      `INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [sha256Hex(token), admin.id, config.sessionTtlSeconds]);
    await pool.query('DELETE FROM sessions WHERE expires_at < now()'); // porządkowanie wygasłych sesji
    return reply.send({ accessToken: token, tokenType: 'Bearer', expiresIn: config.sessionTtlSeconds });
  });

  app.post('/api/auth/logout', { onRequest: [requireAdmin] }, async (req, reply) => {
    await pool.query('DELETE FROM sessions WHERE id = $1', [req.admin!.sessionId]);
    return reply.code(204).send();
  });

  // Rozszerzenie kontraktu: sprawdzenie, czy sesja jest nadal ważna (używane przez interfejs)
  app.get('/api/auth/me', { onRequest: [requireAdmin] }, async (req) => {
    const { rows } = await pool.query<{ username: string }>('SELECT username FROM admins WHERE id = $1', [req.admin!.id]);
    return { username: rows[0]?.username };
  });

  app.put('/api/auth/password', { onRequest: [requireAdmin] }, async (req, reply) => {
    const { currentPassword, newPassword } = asObject(req.body);
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword) {
      throw badRequest('Wymagane pola currentPassword i newPassword', [
        ...(typeof currentPassword !== 'string' || !currentPassword ? [{ field: 'currentPassword', message: 'Wymagany napis' }] : []),
        ...(typeof newPassword !== 'string' ? [{ field: 'newPassword', message: 'Wymagany napis' }] : []),
      ]);
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      throw unprocessable('Nowe hasło musi mieć od 8 do 128 znaków', [{ field: 'newPassword', message: 'Długość 8–128 znaków' }]);
    }
    const { rows } = await pool.query<{ password_hash: string }>('SELECT password_hash FROM admins WHERE id = $1', [req.admin!.id]);
    if (!rows[0] || !(await verifyPassword(rows[0].password_hash, currentPassword))) {
      throw forbidden('Podane bieżące hasło jest niepoprawne');
    }
    await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), req.admin!.id]);
    // Zmiana hasła kończy pozostałe sesje tego administratora
    await pool.query('DELETE FROM sessions WHERE admin_id = $1 AND id <> $2', [req.admin!.id, req.admin!.sessionId]);
    return reply.code(204).send();
  });
}
