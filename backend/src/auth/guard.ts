import { FastifyRequest, FastifyReply } from 'fastify';

export interface TpUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TpUser;
    user: TpUser;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'No autenticado' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (req.user?.role !== 'admin') {
    return reply.code(403).send({ error: 'Requiere rol administrador' });
  }
}
