import { Link } from 'react-router-dom';
import { MapPin, Layers, Wifi } from 'lucide-react';
import { Card, Badge } from './ui';
import { PrinterStatusBadge } from './Badges';
import { printerIp } from '../api/client';
import type { Printer } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function PrinterCard({ printer, onAction }: {
  printer: Printer;
  onAction?: (name: string, action: string) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const ip = printerIp(printer.uri);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/impresoras/${printer.name}`} className="block truncate font-semibold hover:text-indigo-600">
            {printer.name}
          </Link>
          <div className="truncate text-xs text-slate-500">{printer.model || '—'}</div>
        </div>
        <PrinterStatusBadge status={printer.status} />
      </div>

      <div className="mt-4 space-y-1.5 text-sm text-slate-600">
        {printer.location && (
          <div className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" /> {printer.location}</div>
        )}
        {ip && (
          <div className="flex items-center gap-2"><Wifi size={14} className="text-slate-400" /> {ip}</div>
        )}
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-slate-400" /> {printer.queuedJobs} en cola
          {!printer.accepting && <span className="text-xs text-red-600">· no acepta trabajos</span>}
        </div>
        {printer.capabilities && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge className={printer.capabilities.color ? 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}>
              {printer.capabilities.color ? 'Color' : 'B/N'}
            </Badge>
            <Badge className={printer.capabilities.duplex ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}>
              {printer.capabilities.duplex ? 'Doble cara' : 'Simple'}
            </Badge>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Link to={`/impresoras/${printer.name}`} className="text-sm font-medium text-indigo-600 hover:underline">
          Ver cola →
        </Link>
        {isAdmin && onAction && (
          <select
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            value=""
            onChange={(e) => {
              if (e.target.value && confirm(`¿Aplicar "${e.target.value}" a ${printer.name}?`)) {
                onAction(printer.name, e.target.value);
              }
              e.target.value = '';
            }}
          >
            <option value="">Admin…</option>
            <option value="__edit">Editar datos…</option>
            <option value="pause">Pausar</option>
            <option value="resume">Reanudar</option>
            <option value="reject">Rechazar trabajos</option>
            <option value="accept">Aceptar trabajos</option>
            <option value="purge">Vaciar cola</option>
            <option value="testpage">Página de prueba</option>
            <option value="__delete">Eliminar impresora…</option>
          </select>
        )}
      </div>
    </Card>
  );
}
