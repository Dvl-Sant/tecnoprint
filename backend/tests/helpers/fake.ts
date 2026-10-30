import type { CupsAdapter, CupDevice, JobInfo, NewPrinter, PrinterAction, PrinterInfo } from '../../src/cups/types';

export interface FakeCall {
  action: PrinterAction | 'cancel' | 'reprint' | 'submit' | 'addPrinter' | 'modifyPrinter' | 'deletePrinter';
  args: any[];
}

export interface FakeCups {
  adapter: CupsAdapter;
  calls: FakeCall[];
  printers: PrinterInfo[];
  completed: JobInfo[];
  active: JobInfo[];
  pagesFor: Record<number, number>;
}

export const FAKE_PDF = Buffer.from('%PDF-1.4 contenido-de-prueba\n', 'utf8');

export function makeFakeCups(): FakeCups {
  const fake: FakeCups = {
    calls: [],
    printers: [
      {
        name: 'HP_Color_M283fdw', status: 'idle', accepting: true,
        model: 'HP ColorLaserJet MFP M282-M285', location: 'Planta baja',
        uri: 'socket://192.0.2.10.32:9100', queuedJobs: 1,
      },
      {
        name: 'Lexmark_MS823dn', status: 'stopped', accepting: false,
        model: 'Lexmark MS823dn', location: 'Planta baja',
        uri: 'socket://192.0.2.10.31:9100', queuedJobs: 0,
      },
    ],
    completed: [
      {
        id: 39, printer: 'HP_Color_M283fdw', user: 'msistema', title: 'remision.pdf',
        sizeBytes: 2423808, state: 'completed',
        submittedAt: '2026-10-29T22:17:26.000Z', completedAt: '2026-10-29T22:17:26.000Z',
        docAvailable: true,
      },
      {
        id: 55, printer: 'Lexmark_MS823dn', user: 'empleado', title: 'informe.docx',
        sizeBytes: 50000, state: 'completed',
        submittedAt: '2026-10-29T21:00:00.000Z', completedAt: '2026-10-29T21:05:00.000Z',
        docAvailable: true,
      },
    ],
    active: [
      {
        id: 41, printer: 'HP_Color_M283fdw', user: 'jperez', title: 'planos.pdf',
        sizeBytes: 1000, state: 'pending',
        submittedAt: new Date().toISOString(), docAvailable: true,
      },
    ],
    pagesFor: { 39: 4, 55: 12 },
  };

  fake.adapter = {
    async listPrinters() { return fake.printers; },
    async activeJobs(printer?: string) {
      return printer ? fake.active.filter((j) => j.printer === printer) : fake.active;
    },
    async completedJobs(limit: number) { return fake.completed.slice(0, limit); },
    async prepareAndSubmit(file, printer, opts) {
      fake.calls.push({ action: 'submit', args: [file, printer, opts] });
      return { jobId: 42, pages: 3 };
    },
    async cancelJob(id) { fake.calls.push({ action: 'cancel', args: [id] }); },
    async reprint(id, printer) { fake.calls.push({ action: 'reprint', args: [id, printer] }); return 99; },
    async controlPrinter(name, action) { fake.calls.push({ action, args: [name] }); },
    async readSpoolFile() { return FAKE_PDF; },
    async documentAsPdf() { return FAKE_PDF; },
    async countPages(id) { return fake.pagesFor[id] ?? null; },
    async listDevices() {
      return [
        { info: 'network', uri: 'socket://192.0.2.10.35:9100' },
        { info: 'network', uri: 'dnssd://HP%20LaserJet%20Pro%20M404-M405%20%5BCF7F8F%5D._ipp._tcp.local/?uuid=ca92b827' },
      ] as CupDevice[];
    },
    async addPrinter(p: NewPrinter) { fake.calls.push({ action: 'addPrinter', args: [p] }); },
    async modifyPrinter(name, patch) { fake.calls.push({ action: 'modifyPrinter', args: [name, patch] }); },
    async deletePrinter(name) { fake.calls.push({ action: 'deletePrinter', args: [name] }); },
  };

  return fake;
}
