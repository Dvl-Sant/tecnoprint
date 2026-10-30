import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { requireAuth } from './guard';
import { db, verifyUserPassword, getUserById } from '../db';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
      if (!username || !password) {
        return reply.code(400).send({ error: 'Usuario y contraseña requeridos' });
      }
      const u = verifyUserPassword(username, password);
      if (!u) return reply.code(401).send({ error: 'Credenciales inválidas' });
      const token = app.jwt.sign(
        { id: u.id, username: u.username, role: u.role },
        { expiresIn: '12h' }
      );
      return { token, user: { id: u.id, username: u.username, displayName: u.display_name, role: u.role } };
    }
  );

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    const u = getUserById(req.user.id);
    if (!u) return { id: req.user.id, username: req.user.username, role: req.user.role };
    return { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
  });

  app.put('/api/auth/password', { preHandler: requireAuth }, async (req, reply) => {
    const { current, next } = (req.body ?? {}) as { current?: string; next?: string };
    if (!current || !next || next.length < 6) {
      return reply.code(400).send({ error: 'Contraseña nueva inválida (mínimo 6 caracteres)' });
    }
    const u = getUserById(req.user.id)!;
    if (!bcrypt.compareSync(current, u.password_hash)) {
      return reply.code(401).send({ error: 'Contraseña actual incorrecta' });
    }
    db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(bcrypt.hashSync(next, 10), u.id);
    return { ok: true };
  });
}
