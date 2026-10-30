import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guard';
import { db } from '../db';

export function registerStatsRoutes(app: FastifyInstance): void {
  app.get('/api/stats/summary', { preHandler: requireAuth }, async () => {
    const printers = await app.cups.listPrinters();
    const jobsToday = (
      db.prepare(
        `SELECT COUNT(*) AS n FROM jobs WHERE date(COALESCE(completed_at, submitted_at)) = date('now')`
      ).get() as any
    ).n as number;
    const pagesMonth = (
      db.prepare(
        `SELECT COALESCE(SUM(pages),0) AS n FROM jobs
         WHERE pages > 0 AND strftime('%Y-%m', COALESCE(completed_at, submitted_at)) = strftime('%Y-%m','now')`
      ).get() as any
    ).n as number;
    const queued = printers.reduce((acc, p) => acc + p.queuedJobs, 0);
    return {
      printers: { total: printers.length, ok: printers.filter((p) => p.status !== 'stopped').length },
      queued,
      jobsToday,
      pagesMonth,
    };
  });

  app.get('/api/stats/timeseries', { preHandler: requireAuth }, async (req) => {
    const days = Math.min(90, Math.max(1, parseInt((req.query as any).days || '14', 10)));
    const rows = db
      .prepare(
        `SELECT date(COALESCE(completed_at, submitted_at)) AS d, COUNT(*) AS jobs, COALESCE(SUM(pages),0) AS pages
         FROM jobs
         WHERE COALESCE(completed_at, submitted_at) >= datetime('now', ?)
         GROUP BY d ORDER BY d`
      )
      .all(`-${days} days`) as { d: string; jobs: number; pages: number }[];
    return rows.map((r) => ({ date: r.d, jobs: r.jobs, pages: r.pages }));
  });
}
