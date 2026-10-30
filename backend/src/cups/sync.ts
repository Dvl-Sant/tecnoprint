import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import type { JobInfo } from './types';

function upsertJob(j: JobInfo): void {
  db.prepare(
    `INSERT INTO jobs(cups_job_id, printer, username, title, size_bytes, state, submitted_at, completed_at, doc_available)
     VALUES(@id, @printer, @user, @title, @sizeBytes, @state, @submittedAt, @completedAt, @docAvailable)
     ON CONFLICT(cups_job_id) DO UPDATE SET
       state=excluded.state,
       completed_at=COALESCE(excluded.completed_at, jobs.completed_at),
       submitted_at=COALESCE(excluded.submitted_at, jobs.submitted_at),
       size_bytes=CASE WHEN excluded.size_bytes>0 THEN excluded.size_bytes ELSE jobs.size_bytes END,
       doc_available=excluded.doc_available`
  ).run({
    id: j.id,
    printer: j.printer,
    user: j.user,
    title: j.title ?? '',
    sizeBytes: j.sizeBytes ?? 0,
    state: j.state,
    submittedAt: j.submittedAt ?? null,
    completedAt: j.completedAt ?? null,
    docAvailable: j.docAvailable ? 1 : 0,
  });
}

export class SyncService {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private app: FastifyInstance) {}

  start(intervalMs = 10000): void {
    void this.tick();
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const completed = await this.app.cups.completedJobs(200);
      for (const j of completed) upsertJob(j);

      const active = await this.app.cups.activeJobs();
      for (const j of active) upsertJob(j);

      // Páginas reales para completados que aún no la tienen
      const pending = db
        .prepare(
          `SELECT cups_job_id FROM jobs WHERE state='completed' AND pages IS NULL AND doc_available=1
           AND completed_at > datetime('now', '-7 days') LIMIT 20`
        )
        .all() as { cups_job_id: number }[];
      for (const row of pending) {
        try {
          const pages = await this.app.cups.countPages(row.cups_job_id);
          if (pages != null) {
            db.prepare(`UPDATE jobs SET pages=? WHERE cups_job_id=? AND pages IS NULL`).run(pages, row.cups_job_id);
          } else {
            // marcar intento fallido para no reintentar cada tick: pages=-1
            db.prepare(`UPDATE jobs SET pages=-1 WHERE cups_job_id=? AND pages IS NULL`).run(row.cups_job_id);
          }
        } catch {
          /* siguiente tick lo reintenta */
        }
      }
    } finally {
      this.running = false;
    }
  }
}
