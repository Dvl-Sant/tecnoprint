import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, printerIp, fmtBytes } from '../api/client';
import type { JobsPage, Printer } from '../api/client';
import { Card, Spinner, ErrorBox } from '../components/ui';
import { PrinterStatusBadge } from '../components/Badges';
import JobsTable from '../components/JobsTable';

export default function PrinterDetail() {
  const { name = '' } = useParams();
  const printers = useQuery({ queryKey: ['printers'], queryFn: () => api<Printer[]>('/printers'), refetchInterval: 10000 });
  const jobs = useQuery({
    queryKey: ['printer-jobs', name],
    queryFn: () => api<JobsPage>(`/jobs?printer=${encodeURIComponent(name)}&pageSize=25`),
    refetchInterval: 5000,
  });

  if (printers.isLoading) return <Spinner />;
  if (printers.isError) return <ErrorBox message={(printers.error as Error).message} />;

  const p = printers.data?.find((x) => x.name === name);
  if (!p) return <ErrorBox message="Impresora no encontrada" />;
  const ip = printerIp(p.uri);

  return (
    <div className="space-y-5">
      <Link to="/impresoras" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600">
        <ArrowLeft size={16} /> Todas las impresoras
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{p.name}</h1>
        <PrinterStatusBadge status={p.status} />
        {!p.accepting && <span className="text-sm text-red-600">No acepta trabajos</span>}
      </div>

      <Card className="grid grid-cols-2 gap-4 p-5 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Modelo</div>
          <div>{p.model || '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Ubicación</div>
          <div>{p.location || '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">IP</div>
          <div className="font-mono">{ip || '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">En cola</div>
          <div>{p.queuedJobs} trabajo(s)</div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Cola e historial reciente</h2>
        {jobs.isLoading ? <Spinner /> : jobs.isError ? <ErrorBox message={(jobs.error as Error).message} /> : (
          <>
            <div className="mb-2 text-xs text-slate-400">
              {jobs.data?.total} trabajo(s) · tamaños hasta {fmtBytes(Math.max(0, ...(jobs.data?.items ?? []).map((j) => j.sizeBytes)))}
            </div>
            <JobsTable jobs={jobs.data?.items ?? []} onRefresh={() => jobs.refetch()} />
          </>
        )}
      </Card>
    </div>
  );
}
