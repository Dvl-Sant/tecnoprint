import { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin } from '../auth/guard';
import { db } from '../db';

interface JobRow {
  id: number;
  cups_job_id: number;
  printer: string;
  username: string;
  title: string;
  pages: number | null;
  size_bytes: number;
  state: string;
  source: string;
  submitted_at: string | null;
  completed_at: string | null;
  doc_available: number;
}

function rowToJob(r: JobRow) {
  return {
    id: r.cups_job_id,
    printer: r.printer,
    username: r.username,
    title: r.title,
    pages: r.pages != null && r.pages > 0 ? r.pages : null,
    sizeBytes: r.size_bytes,
    state: r.state,
    source: r.source,
    submittedAt: r.submitted_at,
    completedAt: r.completed_at,
    docAvailable: !!r.doc_available,
  };
}

export function registerJobRoutes(app: FastifyInstance): void {
  app.get('/api/jobs', { preHandler: requireAuth }, async (req) => {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize || '50', 10)));

    const where: string[] = [];
    const params: Record<string, string | number> = {};
    if (q.user) { where.push('username = @user'); params.user = q.user; }
    if (q.printer) { where.push('printer = @printer'); params.printer = q.printer; }
    if (q.state) { where.push('state = @state'); params.state = q.state; }
    if (q.from) { where.push('COALESCE(completed_at, submitted_at) >= @from'); params.from = q.from; }
    if (q.to) { where.push('COALESCE(completed_at, submitted_at) <= @to'); params.to = q.to; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Usuarios no admin solo ven sus propios trabajos
    if (req.user.role !== 'admin') {
      params.tpUser = req.user.username;
    }
    const userSql = req.user.role !== 'admin' ? (where.length ? ' AND username = @tpUser' : 'WHERE username = @tpUser') : '';

    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM jobs ${whereSql} ${userSql}`).get(params) as any
    ).n as number;
    const rows = db
      .prepare(
        `SELECT * FROM jobs ${whereSql} ${userSql}
         ORDER BY COALESCE(completed_at, submitted_at) DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as JobRow[];

    return { total, page, pageSize, items: rows.map(rowToJob) };
  });

  app.get('/api/jobs/:id/document', { preHandler: requireAuth }, async (req, reply) => {
    const id = parseInt((req.params as any).id, 10);
    const row = db.prepare(`SELECT * FROM jobs WHERE cups_job_id=?`).get(id) as JobRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Trabajo no encontrado' });
    if (req.user.role !== 'admin' && row.username !== req.user.username) {
      return reply.code(403).send({ error: 'No puedes ver documentos de otros usuarios' });
    }
    try {
      const data = await app.cups.documentAsPdf(id);
      reply.header('Content-Type', data!.subarray(0, 5).toString('binary') === '%PDF-' ? 'application/pdf' : 'application/octet-stream');
      reply.header('Content-Disposition', `inline; filename="Trabajo_${id}.pdf"`);
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: 'El documento ya no existe (expiró o fue depurado)' });
    }
  });

  app.post('/api/jobs/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const id = parseInt((req.params as any).id, 10);
    const row = db.prepare(`SELECT * FROM jobs WHERE cups_job_id=?`).get(id) as JobRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Trabajo no encontrado' });
    if (req.user.role !== 'admin' && row.username !== req.user.username) {
      return reply.code(403).send({ error: 'Solo puedes cancelar tus propios trabajos' });
    }
    try {
      await app.cups.cancelJob(id);
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
    db.prepare(`UPDATE jobs SET state='canceled' WHERE cups_job_id=? AND state IN ('pending','processing')`).run(id);
    return { ok: true };
  });

  app.post('/api/jobs/:id/reprint', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parseInt((req.params as any).id, 10);
    const row = db.prepare(`SELECT * FROM jobs WHERE cups_job_id=?`).get(id) as JobRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Trabajo no encontrado' });
    try {
      const newId = await app.cups.reprint(id, row.printer);
      return { ok: true, newJobId: newId };
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });
}
