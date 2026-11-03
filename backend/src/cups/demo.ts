import type { CupsAdapter, JobInfo, NewPrinter, PrinterInfo } from './types';

/** PDF mínimo válido (páginas en blanco) para la vista previa en modo demo. */
export function makeDemoPdf(pages = 2): Buffer {
  let kids = '';
  for (let i = 0; i < pages; i++) kids += `${10 + i} 0 R `;
  let objs = `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n`;
  objs += `2 0 obj<</Type/Pages/Kids[${kids}]/Count ${pages}>>endobj\n`;
  for (let i = 0; i < pages; i++) {
    objs += `${10 + i} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n`;
  }
  objs += `trailer<</Root 1 0 R/Size ${10 + pages}>>\n%%EOF\n`;
  return Buffer.from(`%PDF-1.4\n${objs}`, 'utf8');
}

const PRINTERS: PrinterInfo[] = [
  { name: 'HP_Color_MFP', status: 'idle', accepting: true, model: 'HP Color LaserJet MFP 283fdw', location: 'Planta baja', uri: 'socket://192.0.2.31:9100', queuedJobs: 0, capabilities: { color: true, duplex: true } },
  { name: 'HP_LaserJet_404', status: 'printing', accepting: true, model: 'HP LaserJet Pro M404dw', location: 'Planta baja', uri: 'socket://192.0.2.32:9100', queuedJobs: 2, capabilities: { color: false, duplex: true } },
  { name: 'Lexmark_MS810', status: 'idle', accepting: true, model: 'Lexmark MS810dn', location: 'Primer piso', uri: 'socket://192.0.2.33:9100', queuedJobs: 0, capabilities: { color: false, duplex: true } },
  { name: 'Plotter_A0', status: 'stopped', accepting: false, model: 'Canon imagePROGRAF TC-20', location: 'Taller', uri: 'socket://192.0.2.40:9100', queuedJobs: 0, capabilities: { color: true, duplex: false } },
];

function daysAgo(n: number, h = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 15, 0, 0);
  return d.toISOString();
}

const COMPLETED: JobInfo[] = [
  { id: 104, printer: 'HP_Color_MFP', user: 'jperez', title: 'propuesta-comercial.pdf', sizeBytes: 812_000, state: 'completed', submittedAt: daysAgo(0, 9), completedAt: daysAgo(0, 9), pages: 6, docAvailable: true },
  { id: 103, printer: 'HP_LaserJet_404', user: 'mgarcia', title: 'acta-reunion.pdf', sizeBytes: 145_000, state: 'completed', submittedAt: daysAgo(0, 8), completedAt: daysAgo(0, 8), pages: 2, docAvailable: true },
  { id: 102, printer: 'Lexmark_MS810', user: 'admin', title: 'informe-mensual.pdf', sizeBytes: 1_240_000, state: 'completed', submittedAt: daysAgo(1, 16), completedAt: daysAgo(1, 16), pages: 14, docAvailable: true },
  { id: 101, printer: 'HP_Color_MFP', user: 'lgomez', title: 'presentacion-cliente.pdf', sizeBytes: 2_300_000, state: 'completed', submittedAt: daysAgo(2, 11), completedAt: daysAgo(2, 11), pages: 18, docAvailable: true },
  { id: 100, printer: 'HP_LaserJet_404', user: 'jperez', title: 'orden-compra.pdf', sizeBytes: 98_000, state: 'completed', submittedAt: daysAgo(3, 15), completedAt: daysAgo(3, 15), pages: 1, docAvailable: true },
  { id: 99, printer: 'Lexmark_MS810', user: 'mgarcia', title: 'manual-usuario.pdf', sizeBytes: 640_000, state: 'completed', submittedAt: daysAgo(5, 10), completedAt: daysAgo(5, 10), pages: 9, docAvailable: true },
  { id: 98, printer: 'HP_Color_MFP', user: 'admin', title: 'reglamento-interno.pdf', sizeBytes: 380_000, state: 'completed', submittedAt: daysAgo(7, 12), completedAt: daysAgo(7, 12), pages: 5, docAvailable: true },
  { id: 97, printer: 'HP_LaserJet_404', user: 'lgomez', title: 'cotizacion-servicios.pdf', sizeBytes: 210_000, state: 'canceled', submittedAt: daysAgo(8, 14), completedAt: daysAgo(8, 14), pages: 2, docAvailable: false },
];

const ACTIVE: JobInfo[] = [
  { id: 105, printer: 'HP_LaserJet_404', user: 'mgarcia', title: 'facturas-abril.pdf', sizeBytes: 320_000, state: 'processing', submittedAt: new Date().toISOString(), docAvailable: true },
  { id: 106, printer: 'HP_LaserJet_404', user: 'jperez', title: 'plano-instalaciones.pdf', sizeBytes: 4_100_000, state: 'pending', submittedAt: new Date().toISOString(), docAvailable: true },
];

const PAGES: Record<number, number> = { 104: 6, 103: 2, 102: 14, 101: 18, 100: 1, 99: 9, 98: 5, 97: 2 };

let nextJobId = 107;

/** Adaptador ficticio para probar el portal sin un servidor CUPS real (DEMO=true). */
export const demoAdapter: CupsAdapter = {
  async listPrinters() { return PRINTERS; },
  async activeJobs(printer?: string) {
    return printer ? ACTIVE.filter((j) => j.printer === printer) : ACTIVE;
  },
  async completedJobs(limit: number) { return COMPLETED.slice(0, limit); },
  async prepareAndSubmit(_file, printer, opts) {
    const job: JobInfo = {
      id: nextJobId++,
      printer,
      user: 'admin',
      title: 'documento-demo.pdf',
      sizeBytes: 120_000,
      state: 'completed',
      submittedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      pages: (opts.copies ?? 1) * 2,
      docAvailable: true,
    };
    COMPLETED.unshift(job);
    return { jobId: job.id, pages: job.pages ?? null };
  },
  async cancelJob() {},
  async reprint(jobId, printer) { return jobId + 1000; },
  async controlPrinter(_name, _action: PrinterAction) {},
  async readSpoolFile() { return makeDemoPdf(2); },
  async documentAsPdf() { return makeDemoPdf(2); },
  async countPages(jobId: number) { return PAGES[jobId] ?? 2; },
  async listDevices() {
    return [
      { info: 'network', uri: 'socket://192.0.2.34:9100' },
      { info: 'network', uri: 'socket://192.0.2.35:9100' },
    ];
  },
  async addPrinter(_p: NewPrinter) {},
  async modifyPrinter() {},
  async deletePrinter() {},
};
