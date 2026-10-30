import type { JobInfo, JobState, PrinterStatus } from './types';

const MESES: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

/** "jue 29 oct 2026 15:17:26" → Date (hora local del servidor que reporta). */
export function parseEsDate(s: string): Date {
  const m = s.trim().match(/^\S+\s+(\d{1,2})\s+(\S+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Fecha no reconocida: "${s}"`);
  const mes = MESES[m[2].toLowerCase()];
  if (mes === undefined) throw new Error(`Mes no reconocido: "${m[2]}"`);
  return new Date(+m[3], mes, +m[1], +m[4], +m[5], +m[6]);
}

export interface LpPrinterState {
  name: string;
  status: PrinterStatus;
}

/** Salida de `lpstat -p` (inglés o español según locale del servidor). */
export function parseLpstatPrinters(out: string): LpPrinterState[] {
  const result: LpPrinterState[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(?:printer|la impresora)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const rest = m[2];
    let status: PrinterStatus = 'idle';
    if (/now printing|ahora imprimiendo/i.test(rest)) status = 'printing';
    else if (/disabled|not ready|deshabilitada|rechazando/i.test(rest)) status = 'stopped';
    result.push({ name: m[1], status });
  }
  return result;
}

/** Salida de `lpstat -a` (inglés o español) → mapa nombre → accepting. */
export function parseLpstatAccepting(out: string): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    const rest = m[2];
    if (/no acepta|not accepting/i.test(rest)) map[m[1]] = false;
    else if (/aceptando|accepting/i.test(rest)) map[m[1]] = true;
  }
  return map;
}

/** Salida de `lpstat -o` o `lpstat -W completed -o` (locale español). */
export function parseLpstatJobs(out: string, state: JobState): JobInfo[] {
  const jobs: JobInfo[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(\S+)-(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const printer = m[1];
    const id = parseInt(m[2], 10);
    const user = m[3];
    const sizeBytes = parseInt(m[4], 10) || 0;
    let completedAt: string | undefined;
    try {
      const d = parseEsDate(m[5]);
      completedAt = d.toISOString();
    } catch {
      completedAt = undefined;
    }
    jobs.push({
      id,
      printer,
      user,
      title: '',
      sizeBytes,
      state,
      submittedAt: completedAt ?? new Date().toISOString(),
      completedAt: state === 'completed' ? completedAt : undefined,
      docAvailable: false,
    });
  }
  return jobs;
}

export interface ConfPrinter {
  location: string;
  model: string;
  uri: string;
}

/** Contenido de /etc/cups/printers.conf → mapa por nombre. */
export function parsePrintersConf(conf: string): Record<string, ConfPrinter> {
  const map: Record<string, ConfPrinter> = {};
  const re = /<Printer\s+([^>]+)>([\s\S]*?)<\/Printer>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conf))) {
    const name = m[1].trim();
    const body = m[2];
    const field = (k: string): string => {
      const fm = body.match(new RegExp(`^${k}\\s+(.*)$`, 'm'));
      return fm ? fm[1].trim() : '';
    };
    // Quitar sufijo ", driverless, cups-filters X" del MakeModel
    const rawModel = field('MakeModel').replace(/,\s*driverless.*$/i, '');
    map[name] = {
      location: field('Location'),
      model: rawModel,
      uri: field('DeviceURI'),
    };
  }
  return map;
}

export interface PageLogEntry {
  job: number;
  user: string;
  pages: number;
  title: string;
}

/** Salida de `lpinfo -v` → dispositivos descubiertos en la red. */
export function parseLpinfoDevices(out: string): { uri: string; info: string }[] {
  const devices: { uri: string; info: string }[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(network|direct)\s+(\S+:\/\/\S+)\s*$/);
    if (m) devices.push({ info: m[1], uri: m[2] });
  }
  return devices;
}

/** Nombre base de un URI mDNS (dnssd/ipps): "HP LaserJet M501dn (673E55)". */
export function mdnsBaseName(uri: string): string | null {
  const m = uri.match(/^(?:dnssd|ipps):\/\/([^?]+)/);
  if (!m) return null;
  const base = m[1].split('._ipp')[0].split('._ipps')[0];
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

/**
 * Agrupa los dispositivos descubiertos: la misma impresora física suele
 * anunciarse dos veces (dnssd + ipps). Se muestra una sola vez, prefiriendo
 * ipps (conexión cifrada), con el nombre comercial como etiqueta.
 */
export function dedupeDevices(devices: { uri: string; info: string }[]): { uri: string; info: string; label?: string }[] {
  const result: { uri: string; info: string; label?: string }[] = [];
  const byBase = new Map<string, { uri: string; info: string; label: string }>();

  for (const d of devices) {
    const base = mdnsBaseName(d.uri);
    if (!base) {
      result.push({ ...d });
      continue;
    }
    const existing = byBase.get(base);
    if (!existing) {
      byBase.set(base, { ...d, label: base });
    } else if (d.uri.startsWith('ipps://') && !existing.uri.startsWith('ipps://')) {
      // preferir la variante cifrada conservando la etiqueta
      byBase.set(base, { uri: d.uri, info: d.info, label: base });
    }
  }

  for (const grouped of byBase.values()) result.push(grouped);
  return result;
}

/** Línea de /var/log/cups/page_log. */
export function parsePageLogLine(line: string): PageLogEntry | null {
  const m = line.match(/^\S+\s+(\S+)\s+(\d+)\s+\[[^\]]+\]\s+total\s+(\d+)\s+-\s+\S+\s+(.*)$/);
  if (!m) return null;
  const title = m[4].replace(/\s+-\s+-\s*$/, '').trim();
  return { user: m[1], job: parseInt(m[2], 10), pages: parseInt(m[3], 10), title };
}

/** Contenido completo de page_log → mapa jobId → {pages, title}. */
export function parsePageLog(content: string): Map<number, PageLogEntry> {
  const map = new Map<number, PageLogEntry>();
  for (const line of content.split('\n')) {
    const e = parsePageLogLine(line);
    if (e) map.set(e.job, e);
  }
  return map;
}
