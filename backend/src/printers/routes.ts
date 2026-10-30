import { FastifyInstance } from 'fastify';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { requireAuth, requireAdmin } from '../auth/guard';
import { config } from '../config';
import type { PrinterAction } from '../cups/types';

const ACTIONS: PrinterAction[] = ['pause', 'resume', 'accept', 'reject', 'purge', 'testpage'];
// CUPS solo acepta nombres sin espacios ni caracteres especiales
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const URI_SCHEMES = ['socket', 'ipp', 'ipps', 'lpd', 'http', 'https', 'usb', 'dnssd'];
const PPD_EXT_RE = /\.ppd(\.gz)?$/i;

function validUri(uri: string): boolean {
  const m = uri.match(/^([a-z][a-z0-9+.-]+):\/\//);
  return !!m && URI_SCHEMES.includes(m[1]);
}

export function registerPrinterRoutes(app: FastifyInstance): void {
  app.get('/api/printers', { preHandler: requireAuth }, async () => {
    return app.cups.listPrinters();
  });

  // Dispositivos descubiertos en la red (para el formulario de alta)
  app.get('/api/cups/devices', { preHandler: requireAdmin }, async () => {
    return app.cups.listDevices();
  });

  app.post('/api/printers', { preHandler: requireAdmin }, async (req, reply) => {
    let name = '', uri = '', location = '', description = '', model: 'everywhere' | 'raw' = 'everywhere';
    let ppdTmpPath: string | undefined;

    try {
      const isMultipart = (req.headers['content-type'] || '').includes('multipart');
      if (isMultipart) {
        const data = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
        if (!data) return reply.code(400).send({ error: 'Formulario inválido' });
        const f = data.fields as Record<string, any>;
        name = String(f.name?.value ?? '');
        uri = String(f.uri?.value ?? '');
        location = String(f.location?.value ?? '');
        description = String(f.description?.value ?? '');
        model = f.model?.value === 'raw' ? 'raw' : 'everywhere';
        if (data.filename && PPD_EXT_RE.test(data.filename)) {
          await fsp.mkdir(config.uploadDir, { recursive: true });
          ppdTmpPath = path.join(config.uploadDir, `ppd-${Date.now()}.ppd`);
          await fsp.writeFile(ppdTmpPath, await data.toBuffer());
        }
      } else {
        const b = (req.body ?? {}) as Record<string, string>;
        name = String(b.name ?? '');
        uri = String(b.uri ?? '');
        location = String(b.location ?? '');
        description = String(b.description ?? '');
        model = b.model === 'raw' ? 'raw' : 'everywhere';
      }

      if (!NAME_RE.test(name)) {
        return reply.code(400).send({ error: 'Nombre inválido: usa letras, números, guiones o puntos (sin espacios)' });
      }
      if (!validUri(uri)) {
        return reply.code(400).send({ error: `URI inválida. Esquemas permitidos: ${URI_SCHEMES.join(', ')}` });
      }
      if (model === 'everywhere' && !/^(ipp|ipps|dnssd):\/\//.test(uri)) {
        return reply.code(400).send({
          error: 'El driver Everywhere (driverless) requiere una URI IPP (ipp://, ipps:// o dnssd://). Para socket:// usa Raw o sube un PPD.',
        });
      }
      try {
        await app.cups.addPrinter({ name, uri, location, description, model, ppdPath: ppdTmpPath });
      } catch (e) {
        return reply.code(500).send({ error: (e as Error).message });
      }
      return reply.code(201).send({ ok: true, name });
    } finally {
      if (ppdTmpPath) fsp.unlink(ppdTmpPath).catch(() => {});
    }
  });

  app.put('/api/printers/:name', { preHandler: requireAdmin }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const patch = (req.body ?? {}) as { uri?: string; location?: string; description?: string };
    if (patch.uri !== undefined && !validUri(patch.uri)) {
      return reply.code(400).send({ error: 'URI inválida' });
    }
    const printers = await app.cups.listPrinters();
    if (!printers.some((p) => p.name === name)) {
      return reply.code(404).send({ error: 'Impresora no encontrada' });
    }
    try {
      await app.cups.modifyPrinter(name, patch);
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
    return { ok: true };
  });

  app.delete('/api/printers/:name', { preHandler: requireAdmin }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const printers = await app.cups.listPrinters();
    if (!printers.some((p) => p.name === name)) {
      return reply.code(404).send({ error: 'Impresora no encontrada' });
    }
    try {
      await app.cups.deletePrinter(name);
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
    return { ok: true };
  });

  app.post('/api/printers/:name/:action', { preHandler: requireAdmin }, async (req, reply) => {
    const { name, action } = req.params as { name: string; action: string };
    if (!ACTIONS.includes(action as PrinterAction)) {
      return reply.code(400).send({ error: `Acción inválida: ${action}` });
    }
    const printers = await app.cups.listPrinters();
    if (!printers.some((p) => p.name === name)) {
      return reply.code(404).send({ error: 'Impresora no encontrada' });
    }
    try {
      await app.cups.controlPrinter(name, action as PrinterAction);
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
    return { ok: true };
  });
}
