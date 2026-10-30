import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../auth/guard';
import { db, createUser, findUserByUsername } from '../db';

function publicUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    active: !!u.active,
    createdAt: u.created_at,
  };
}

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/api/users', { preHandler: requireAdmin }, async () => {
    const rows = db.prepare(`SELECT * FROM users ORDER BY username`).all() as any[];
    return rows.map(publicUser);
  });

  app.post('/api/users', { preHandler: requireAdmin }, async (req, reply) => {
    const { username, password, displayName, role } = (req.body ?? {}) as any;
    if (!username || !password || password.length < 6) {
      return reply.code(400).send({ error: 'Usuario y contraseña (mín. 6) requeridos' });
    }
    if (findUserByUsername(username)) {
      return reply.code(409).send({ error: 'El usuario ya existe' });
    }
    const u = createUser({
      username,
      password,
      role: role === 'admin' ? 'admin' : 'user',
      displayName: displayName ?? '',
    });
    return reply.code(201).send(publicUser(u));
  });

  app.put('/api/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { displayName, role, active } = (req.body ?? {}) as any;
    const exists = db.prepare(`SELECT id FROM users WHERE id=?`).get(id);
    if (!exists) return reply.code(404).send({ error: 'Usuario no encontrado' });
    if (role && !['admin', 'user'].includes(role)) {
      return reply.code(400).send({ error: 'Rol inválido' });
    }
    db.prepare(
      `UPDATE users SET display_name=COALESCE(?,display_name),
        role=COALESCE(?,role), active=COALESCE(?,active) WHERE id=?`
    ).run(displayName ?? null, role ?? null, active === undefined ? null : active ? 1 : 0, id);
    return publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(id));
  });

  app.put('/api/users/:id/password', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { password } = (req.body ?? {}) as { password?: string };
    if (!password || password.length < 6) {
      return reply.code(400).send({ error: 'Contraseña inválida (mínimo 6 caracteres)' });
    }
    const exists = db.prepare(`SELECT id FROM users WHERE id=?`).get(id);
    if (!exists) return reply.code(404).send({ error: 'Usuario no encontrado' });
    db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(bcrypt.hashSync(password, 10), id);
    return { ok: true };
  });
}
