import { Badge } from './ui';
import type { Printer } from '../api/client';

export function PrinterStatusBadge({ status }: { status: Printer['status'] }) {
  const map = {
    idle: { label: 'Lista', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
    printing: { label: 'Imprimiendo', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    stopped: { label: 'Detenida', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200', dot: 'bg-red-500' },
  }[status];
  return (
    <Badge className={map.cls}>
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} />
      {map.label}
    </Badge>
  );
}

export function JobStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'En cola', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    processing: { label: 'Procesando', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    completed: { label: 'Completado', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    canceled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
    aborted: { label: 'Abortado', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  };
  const m = map[state] ?? { label: state, cls: 'bg-slate-100 text-slate-600' };
  return <Badge className={m.cls}>{m.label}</Badge>;
}
