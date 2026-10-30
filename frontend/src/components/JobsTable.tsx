import { useState } from 'react';
import { Eye, Ban, RotateCcw } from 'lucide-react';
import { Button } from './ui';
import { JobStateBadge } from './Badges';
import { api, fmtBytes, fmtDate } from '../api/client';
import type { Job } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function JobsTable({ jobs, onRefresh }: { jobs: Job[]; onRefresh?: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [preview, setPreview] = useState<Job | null>(null);
  const [error, setError] = useState('');

  async function doAction(job: Job, action: 'cancel' | 'reprint') {
    if (!confirm(`¿${action === 'cancel' ? 'Cancelar' : 'Reimprimir'} el trabajo #${job.id}?`)) return;
    setError('');
    try {
      await api(`/jobs/${job.id}/${action}`, { method: 'POST' });
      onRefresh?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!jobs.length) {
    return <div className="py-10 text-center text-sm text-slate-400">Sin trabajos para mostrar.</div>;
  }

  return (
    <div>
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="hidden px-3 py-2 sm:table-cell">#</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Usuario</th>
              <th className="hidden px-3 py-2 md:table-cell">Impresora</th>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2 text-right">Págs</th>
              <th className="hidden px-3 py-2 text-right sm:table-cell">Tamaño</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const active = j.state === 'pending' || j.state === 'processing';
              return (
                <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="hidden px-3 py-2 font-mono text-xs text-slate-500 sm:table-cell">{j.id}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(j.completedAt || j.submittedAt)}</td>
                  <td className="px-3 py-2 font-medium">{j.username}</td>
                  <td className="hidden px-3 py-2 md:table-cell">{j.printer}</td>
                  <td className="max-w-32 truncate px-3 py-2 sm:max-w-48" title={j.title}>{j.title || '—'}</td>
                  <td className="px-3 py-2 text-right">{j.pages ?? '—'}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right sm:table-cell">{fmtBytes(j.sizeBytes)}</td>
                  <td className="px-3 py-2"><JobStateBadge state={j.state} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {j.docAvailable && (
                        <Button variant="ghost" title="Ver documento" onClick={() => setPreview(j)}>
                          <Eye size={16} />
                        </Button>
                      )}
                      {active && (isAdmin || j.username === user?.username) && (
                        <Button variant="ghost" title="Cancelar" onClick={() => doAction(j, 'cancel')}>
                          <Ban size={16} className="text-red-500" />
                        </Button>
                      )}
                      {isAdmin && j.state === 'completed' && j.docAvailable && (
                        <Button variant="ghost" title="Reimprimir" onClick={() => doAction(j, 'reprint')}>
                          <RotateCcw size={16} className="text-indigo-500" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreview(null)}>
          <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold">Trabajo #{preview.id} — {preview.title}</div>
              <Button variant="ghost" onClick={() => setPreview(null)}>✕</Button>
            </div>
            <iframe
              src={`/api/jobs/${preview.id}/document`}
              className="flex-1"
              title={`Documento del trabajo ${preview.id}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
