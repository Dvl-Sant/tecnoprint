export const TOKEN_KEY = 'tp_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...((opts.headers as any) || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Tipos espejo del backend ──
export type PrinterStatus = 'idle' | 'printing' | 'stopped';
export interface PrinterCapabilities {
  color: boolean;
  duplex: boolean;
}
export interface Printer {
  name: string;
  status: PrinterStatus;
  accepting: boolean;
  model: string;
  location: string;
  uri: string;
  queuedJobs: number;
  capabilities?: PrinterCapabilities | null;
}
export interface Job {
  id: number;
  printer: string;
  username: string;
  title: string;
  pages: number | null;
  sizeBytes: number;
  state: string;
  source: string;
  submittedAt: string | null;
  completedAt: string | null;
  docAvailable: boolean;
}
export interface UserInfo {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  active?: boolean;
}
export interface CupDevice {
  uri: string;
  info: string;
  label?: string;
}
export interface JobsPage {
  total: number;
  page: number;
  pageSize: number;
  items: Job[];
}

export function printerIp(uri: string): string {
  const m = uri.match(/:\/\/([^:/]+)/);
  return m ? m[1] : '';
}

export function fmtBytes(n: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') || iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}
