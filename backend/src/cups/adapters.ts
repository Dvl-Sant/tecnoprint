import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { config, spoolFileForServerPath } from '../config';
import { run, runBinary, scpToServer, withTarget, adminArgs } from './runner';
import { pagesFromPdfInfo } from './pages';
import { buildLpOptions } from './lpOptions';
import {
  parseLpstatPrinters,
  parseLpstatAccepting,
  parseLpstatJobs,
  parsePrintersConf,
  parseLpinfoDevices,
  dedupeDevices,
  parseCapabilities,
} from './parsers';
import type {
  CupsAdapter, CupDevice, JobInfo, NewPrinter, PrinterAction, PrinterCapabilities,
  PrinterInfo, PrinterPatch, PrintOptions, SubmitResult,
} from './types';

const OFFICE_EXTS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt']);
const REMOTE_TMP_DIR = '/tmp/tecnoprint-uploads';

/** Ruta al ejecutable de LibreOffice (en Windows busca la instalación estándar). */
function sofficeCmd(): string {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
  }
  return 'soffice';
}

/** Convierte Office→PDF en la máquina local (modo dev). */
function convertLocalToPdf(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const converted = input.replace(/\.[^.]+$/, '.pdf');
    execFile(
      sofficeCmd(),
      ['--headless', '--convert-to', 'pdf', '--outdir', path.dirname(input), input],
      { timeout: 120000 },
      (err) => {
        if (!err && fs.existsSync(converted)) resolve(converted);
        else reject(new Error(`La conversión local a PDF falló (¿LibreOffice instalado en tu PC?). ${err?.message ?? ''}`));
      }
    );
  });
}

/** Lee un archivo que vive "en el servidor" (local: disco; ssh: cat remoto). */
export async function readServerFile(serverPath: string): Promise<Buffer | null> {
  if (config.cupsMode === 'local') {
    try {
      return await fsp.readFile(serverPath);
    } catch {
      return null;
    }
  }
  const r = await runBinary(['cat', serverPath]);
  return r.code === 0 && r.data.length > 0 ? r.data : null;
}

export class CupsCommandAdapter implements CupsAdapter {
  /** Caché de capacidades por impresora (lpoptions es lento por SSH). */
  private capsCache = new Map<string, { data: PrinterCapabilities; ts: number }>();
  private static CAPS_TTL_MS = 5 * 60 * 1000;

  private async capabilitiesFor(name: string): Promise<PrinterCapabilities | null> {
    const hit = this.capsCache.get(name);
    if (hit && Date.now() - hit.ts < CupsCommandAdapter.CAPS_TTL_MS) return hit.data;
    const r = await run(adminArgs(['lpoptions', '-p', name, '-l']));
    if (r.code !== 0 || !r.stdout.trim()) return null;
    const caps = parseCapabilities(r.stdout);
    this.capsCache.set(name, { data: caps, ts: Date.now() });
    return caps;
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    const [p, a, o, confRaw] = await Promise.all([
      run(withTarget(['lpstat', '-p'])),
      run(withTarget(['lpstat', '-a'])),
      run(withTarget(['lpstat', '-o'])),
      readServerFile(config.printersConf),
    ]);
    const states = parseLpstatPrinters(p.stdout);
    const accepting = parseLpstatAccepting(a.stdout);
    const conf = confRaw ? parsePrintersConf(confRaw.toString('utf8')) : {};
    const activeCounts: Record<string, number> = {};
    for (const j of parseLpstatJobs(o.stdout, 'pending')) {
      activeCounts[j.printer] = (activeCounts[j.printer] ?? 0) + 1;
    }
    const printers: PrinterInfo[] = states.map((s) => ({
      name: s.name,
      status: s.status,
      accepting: accepting[s.name] ?? true,
      model: conf[s.name]?.model ?? '',
      location: conf[s.name]?.location ?? '',
      uri: conf[s.name]?.uri ?? '',
      queuedJobs: activeCounts[s.name] ?? 0,
    }));
    // Capacidades reales (color/dúplex) con caché — en paralelo
    await Promise.all(
      printers.map(async (pr) => {
        pr.capabilities = await this.capabilitiesFor(pr.name).catch(() => null);
      })
    );
    return printers;
  }

  private async jobsFromLpstat(args: string[], state: JobInfo['state']): Promise<JobInfo[]> {
    const r = await run(withTarget(args));
    const jobs = parseLpstatJobs(r.stdout, state);
    await Promise.all(
      jobs.map(async (j) => {
        const doc = await readServerFile(spoolFileForServerPath(j.id));
        j.docAvailable = doc !== null && doc.length > 0;
        if (doc && j.sizeBytes === 0) j.sizeBytes = doc.length;
      })
    );
    return jobs;
  }

  async activeJobs(printer?: string): Promise<JobInfo[]> {
    const jobs = await this.jobsFromLpstat(['lpstat', '-o'], 'pending');
    return printer ? jobs.filter((j) => j.printer === printer) : jobs;
  }

  async completedJobs(limit: number): Promise<JobInfo[]> {
    const jobs = await this.jobsFromLpstat(['lpstat', '-W', 'completed', '-o'], 'completed');
    return jobs.slice(0, limit);
  }

  /**
   * Copia el archivo al servidor si hace falta, lo convierte a PDF si es de
   * Office, cuenta sus páginas con pdfinfo y lo manda a la cola.
   *
   * Conversión de Office: en modo dev (ssh) se hace LOCAL con el LibreOffice
   * de la PC (el servidor no lo tiene); en producción corre en el servidor.
   */
  async prepareAndSubmit(localFilePath: string, printer: string, opts: PrintOptions): Promise<SubmitResult> {
    const ext0 = path.extname(localFilePath).replace('.', '').toLowerCase();
    const base = path.basename(localFilePath).replace(/\.[^.]+$/, '');
    let localPath = localFilePath;

    if (OFFICE_EXTS.has(ext0) && config.cupsMode === 'ssh') {
      localPath = await convertLocalToPdf(localFilePath);
    }
    const ext = path.extname(localPath).replace('.', '').toLowerCase();
    let targetPath = localPath;

    if (config.cupsMode === 'ssh') {
      const remoteName = `tp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      targetPath = `${REMOTE_TMP_DIR}/${remoteName}`;
      await run(['mkdir', '-p', REMOTE_TMP_DIR]);
      await scpToServer(localPath, targetPath);
    }

    if (OFFICE_EXTS.has(ext)) {
      const outdir = path.dirname(targetPath);
      const conv = await run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', outdir, targetPath]);
      const converted = targetPath.replace(/\.[^.]+$/, '.pdf');
      const exists =
        config.cupsMode === 'local'
          ? fs.existsSync(converted)
          : (await run(['test', '-f', converted])).code === 0;
      if (!exists) {
        throw new Error(
          `No se pudo convertir el documento a PDF (¿LibreOffice instalado en el servidor?). Detalle: ${conv.stderr || conv.stdout}`
        );
      }
      targetPath = converted;
    }

    // Páginas exactas: imágenes 1; documentos PDF → pdfinfo del archivo enviado
    let pages: number | null = null;
    if (['png', 'jpg', 'jpeg'].includes(ext0)) {
      pages = 1;
    } else if (ext === 'pdf' || OFFICE_EXTS.has(ext0)) {
      const info = await run(['pdfinfo', targetPath]);
      pages = pagesFromPdfInfo(info.stdout);
    }

    const lpArgs = ['lp', '-d', printer, '-t', base, ...buildLpOptions(opts), targetPath];
    const r = await run(withTarget(lpArgs));
    const m = r.stdout.match(/(?:request id is|la id solicitada es)\s+\S+-(\d+)/);
    if (!m) {
      throw new Error(`CUPS no aceptó el trabajo: ${r.stderr || r.stdout}`);
    }
    if (config.cupsMode === 'ssh') {
      void run(['sh', '-c', `rm -f ${REMOTE_TMP_DIR}/tp-*`]);
    }
    return { jobId: parseInt(m[1], 10), pages };
  }

  async cancelJob(jobId: number): Promise<void> {
    const jobs = await this.activeJobs();
    const job = jobs.find((j) => j.id === jobId);
    const target = job ? `${job.printer}-${jobId}` : String(jobId);
    const r = await run(withTarget(['cancel', target]));
    if (r.code !== 0 && !job) throw new Error(`No se pudo cancelar el trabajo ${jobId}: ${r.stderr}`);
  }

  async reprint(jobId: number, printer: string): Promise<number> {
    const spool = spoolFileForServerPath(jobId);
    const r = await run(withTarget(['lp', '-d', printer, '-t', `reimpresion-${jobId}`, spool]));
    const m = r.stdout.match(/(?:request id is|la id solicitada es)\s+\S+-(\d+)/);
    if (!m) throw new Error(`No se pudo reimprimir el trabajo ${jobId}: ${r.stderr || r.stdout}`);
    return parseInt(m[1], 10);
  }

  async listDevices(): Promise<CupDevice[]> {
    const r = await run(adminArgs(['lpinfo', '-v']));
    return dedupeDevices(parseLpinfoDevices(r.stdout));
  }

  async addPrinter(p: NewPrinter): Promise<void> {
    let ppdPath = p.ppdPath;
    if (ppdPath && config.cupsMode === 'ssh') {
      const remote = `${REMOTE_TMP_DIR}/upload-${Date.now()}.ppd`;
      await run(['mkdir', '-p', REMOTE_TMP_DIR]);
      await scpToServer(ppdPath, remote);
      ppdPath = remote;
    }
    const args = ['lpadmin', '-p', p.name, '-E', '-v', p.uri];
    if (p.location) args.push('-L', p.location);
    if (p.description) args.push('-D', p.description);
    if (ppdPath) args.push('-P', ppdPath);
    else args.push('-m', p.model === 'raw' ? 'raw' : 'everywhere');
    const r = await run(adminArgs(args));
    if (r.code !== 0) {
      throw new Error(`CUPS rechazó la impresora: ${(r.stderr || r.stdout).trim()}`);
    }
  }

  async modifyPrinter(name: string, patch: PrinterPatch): Promise<void> {
    const args = ['lpadmin', '-p', name];
    if (patch.uri) args.push('-v', patch.uri);
    if (patch.location !== undefined) args.push('-L', patch.location);
    if (patch.description !== undefined) args.push('-D', patch.description);
    const r = await run(adminArgs(args));
    if (r.code !== 0) {
      throw new Error(`No se pudo modificar ${name}: ${(r.stderr || r.stdout).trim()}`);
    }
  }

  async deletePrinter(name: string): Promise<void> {
    const r = await run(adminArgs(['lpadmin', '-x', name]));
    if (r.code !== 0) {
      throw new Error(`No se pudo eliminar ${name}: ${(r.stderr || r.stdout).trim()}`);
    }
  }

  async controlPrinter(name: string, action: PrinterAction): Promise<void> {
    // cupsenable/cupsaccept no aceptan -h (hablan con el scheduler local):
    // en modo ssh/dev son error para NO tocar producción por accidente.
    if (config.cupsMode === 'ssh') {
      throw new Error('Acciones de control deshabilitadas en modo desarrollo (protección de producción)');
    }
    const cmds: Record<PrinterAction, string[]> = {
      pause: ['cupsdisable', name],
      resume: ['cupsenable', name],
      reject: ['cupsreject', name],
      accept: ['cupsaccept', name],
      purge: ['cancel', '-a', name],
      testpage: ['lp', '-d', name, '/usr/share/cups/data/testprint'],
    };
    const r = await run(cmds[action]);
    if (r.code !== 0) throw new Error(`Acción ${action} falló en ${name}: ${r.stderr || r.stdout}`);
  }

  async readSpoolFile(jobId: number): Promise<Buffer> {
    const data = await readServerFile(spoolFileForServerPath(jobId));
    if (!data) throw new Error(`El documento del trabajo ${jobId} no está disponible`);
    return data;
  }

  /** Convierte el documento del trabajo a PDF si no lo es. null si no se pudo. */
  async documentAsPdf(jobId: number): Promise<Buffer | null> {
    const data = await this.readSpoolFile(jobId);
    if (data.subarray(0, 5).toString('binary') === '%PDF-') return data;
    const r = await runBinary(['sh', '-c', `cupsfilter -m application/pdf '${spoolFileForServerPath(jobId)}' 2>/dev/null`]);
    if (r.code === 0 && r.data.subarray(0, 5).toString('binary') === '%PDF-') return r.data;
    return data; // fallback: bytes crudos
  }

  async countPages(jobId: number): Promise<number | null> {
    const spool = spoolFileForServerPath(jobId);
    const head = await readServerFilePartial(spool, 5);
    if (!head || head.length === 0) return null;
    const magic = head.toString('binary');

    // Spool PDF (p.ej. trabajos del portal web): pdfinfo exacto
    if (magic.startsWith('%PDF')) {
      const r = await run(['pdfinfo', spool]);
      return pagesFromPdfInfo(r.stdout);
    }
    // PostScript: convertir a PDF y contar
    if (magic.startsWith('%!')) {
      const r = await run(['sh', '-c', `cupsfilter -m application/pdf '${spool}' 2>/dev/null | pdfinfo -`]);
      return pagesFromPdfInfo(r.stdout);
    }
    // Streams crudos de Windows (PJL/PCL XL): no es posible contar sin un
    // parser del protocolo — se devuelve null y la UI muestra "—".
    return null;
  }
}

async function readServerFilePartial(serverPath: string, bytes: number): Promise<Buffer | null> {
  if (config.cupsMode === 'local') {
    try {
      const fh = await fsp.open(serverPath, 'r');
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      await fh.close();
      return bytesRead > 0 ? buf.subarray(0, bytesRead) : null;
    } catch {
      return null;
    }
  }
  const r = await run(['head', '-c', String(bytes), serverPath]);
  if (r.code !== 0) return null;
  return Buffer.from(r.stdout, 'binary');
}

export function getAdapter(): CupsAdapter {
  return new CupsCommandAdapter();
}
