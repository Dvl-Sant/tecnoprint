export type PrinterStatus = 'idle' | 'printing' | 'stopped';

export interface PrinterInfo {
  name: string;
  status: PrinterStatus;
  accepting: boolean;
  model: string;
  location: string;
  uri: string;
  queuedJobs: number;
}

export type JobState = 'pending' | 'processing' | 'completed' | 'aborted' | 'canceled';

export interface JobInfo {
  id: number;
  printer: string;
  user: string;
  title: string;
  sizeBytes: number;
  state: JobState;
  submittedAt: string; // ISO
  completedAt?: string;
  pages?: number;
  docAvailable: boolean;
}

export interface PrintOptions {
  copies?: number;
  sides?: 'one-sided' | 'two-sided-long-edge';
  color?: boolean;
  orientation?: 'portrait' | 'landscape';
  /** Rangos estilo "1-3,8,10-15" (validar con isValidPageRanges) */
  pageRanges?: string;
  pageSet?: 'all' | 'odd' | 'even';
  /** Nombre CUPS del papel: letter, legal, a4, a5, tabloid, … */
  media?: string;
  fitToPage?: boolean;
  numberUp?: number;
}

export type PrinterAction = 'pause' | 'resume' | 'accept' | 'reject' | 'purge' | 'testpage';

export interface CupDevice {
  uri: string;
  info: string;
  /** Nombre comercial de la impresora (cuando el descubrimiento lo reporta). */
  label?: string;
}

export interface NewPrinter {
  name: string;
  uri: string;
  location?: string;
  description?: string;
  /** 'everywhere' = driverless IPP (default) · 'raw' = sin filtro · PPD = archivo */
  model?: 'everywhere' | 'raw';
  ppdPath?: string;
}

export interface PrinterPatch {
  uri?: string;
  location?: string;
  description?: string;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SubmitResult {
  jobId: number;
  /** Páginas exactas (pdfinfo del documento). null si no se pudo determinar. */
  pages: number | null;
}

export interface CupsAdapter {
  listPrinters(): Promise<PrinterInfo[]>;
  activeJobs(printer?: string): Promise<JobInfo[]>;
  completedJobs(limit: number): Promise<JobInfo[]>;
  prepareAndSubmit(localFilePath: string, printer: string, opts: PrintOptions): Promise<SubmitResult>;
  cancelJob(jobId: number): Promise<void>;
  reprint(jobId: number, printer: string): Promise<number>;
  controlPrinter(name: string, action: PrinterAction): Promise<void>;
  readSpoolFile(jobId: number): Promise<Buffer>;
  documentAsPdf(jobId: number): Promise<Buffer | null>;
  countPages(jobId: number): Promise<number | null>;
  listDevices(): Promise<CupDevice[]>;
  addPrinter(p: NewPrinter): Promise<void>;
  modifyPrinter(name: string, patch: PrinterPatch): Promise<void>;
  deletePrinter(name: string): Promise<void>;
}
