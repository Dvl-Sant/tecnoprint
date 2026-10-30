import { FastifyInstance } from 'fastify';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from '../auth/guard';
import { config } from '../config';
import { db } from '../db';
import { isValidPageRanges, MEDIA_SIZES, NUMBER_UP } from '../cups/lpOptions';
import type { PrintOptions } from '../cups/types';

const ALLOWED = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'txt']);

/** Extrae y valida las opciones de impresión del formulario multipart. */
function parsePrintFields(fields: Record<string, any>): { opts: PrintOptions; error?: string } {
  const num = (v: any) => parseInt(String(v ?? ''), 10);
  const opts: PrintOptions = {
    copies: Math.min(999, Math.max(1, num(fields.copies?.value) || 1)),
    sides: fields.sides?.value === 'two-sided-long-edge' ? 'two-sided-long-edge' : 'one-sided',
    color: String(fields.color?.value ?? 'false') === 'true',
    orientation: fields.orientation?.value === 'landscape' ? 'landscape' : 'portrait',
    pageSet: ['odd', 'even'].includes(fields.pageSet?.value) ? fields.pageSet.value : 'all',
    fitToPage: String(fields.fitToPage?.value ?? 'false') === 'true',
  };
  const ranges = String(fields.pageRanges?.value ?? '').trim();
  if (ranges) {
    if (!isValidPageRanges(ranges)) {
      return { opts, error: 'Rangos de páginas inválidos. Ejemplo válido: 1-3,8,10-15' };
    }
    opts.pageRanges = ranges;
  }
  const media = String(fields.media?.value ?? '');
  if (media) {
    if (!(MEDIA_SIZES as readonly string[]).includes(media)) {
      return { opts, error: 'Tamaño de papel no soportado' };
    }
    opts.media = media;
  }
  const nUp = num(fields.numberUp?.value);
  if (nUp) {
    if (!(NUMBER_UP as readonly number[]).includes(nUp)) {
      return { opts, error: 'Páginas por hoja no soportada (usa 1, 2, 4, 6, 9 o 16)' };
    }
    opts.numberUp = nUp;
  }
  return { opts };
}

export function registerPrintRoutes(app: FastifyInstance): void {
  app.post('/api/print', { preHandler: requireAuth }, async (req, reply) => {
    const data = await req.file({ limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
    if (!data) return reply.code(400).send({ error: 'Falta el archivo' });

    const fields = data.fields as Record<string, any>;
    const printer = String(fields.printer?.value ?? '');
    const { opts, error } = parsePrintFields(fields);
    if (error) return reply.code(400).send({ error });

    if (!printer) return reply.code(400).send({ error: 'Falta la impresora' });
    const printers = await app.cups.listPrinters();
    if (!printers.some((p) => p.name === printer)) {
      return reply.code(400).send({ error: 'Impresora no encontrada' });
    }

    const ext = path.extname(data.filename).replace('.', '').toLowerCase();
    if (!ALLOWED.has(ext)) {
      return reply.code(400).send({ error: `Tipo de archivo no permitido: .${ext}` });
    }

    await fsp.mkdir(config.uploadDir, { recursive: true });
    const tmpPath = path.join(config.uploadDir, `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    try {
      await fsp.writeFile(tmpPath, await data.toBuffer());
      const { jobId, pages } = await app.cups.prepareAndSubmit(tmpPath, printer, opts);
      // Registrar en la auditoría con el usuario del portal y páginas exactas
      db.prepare(
        `INSERT INTO jobs(cups_job_id, printer, username, title, pages, state, source, submitted_at, doc_available)
         VALUES(?,?,?,?,?, 'pending', 'web', datetime('now'), 1)
         ON CONFLICT(cups_job_id) DO UPDATE SET source='web'`
      ).run(jobId, printer, req.user.username, path.basename(data.filename), pages);
      return reply.code(201).send({ ok: true, jobId, pages });
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('exceeded the limit') || (e as any).code === 'FST_PART_FILE_TOO_LARGE') {
        return reply.code(413).send({ error: `El archivo supera ${config.maxUploadMb} MB` });
      }
      return reply.code(500).send({ error: msg || 'Error al imprimir' });
    } finally {
      fsp.unlink(tmpPath).catch(() => {});
    }
  });
}
