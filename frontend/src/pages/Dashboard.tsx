import { useQuery } from '@tanstack/react-query';
import { Printer as PrinterIcon, FileText, Layers, Users as UsersIcon } from 'lucide-react';
import { api } from '../api/client';
import type { JobsPage } from '../api/client';
import { Card, Spinner, ErrorBox } from '../components/ui';
import JobsTable from '../components/JobsTable';

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent: string }) {
  return (
    <Card className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent} text-white sm:h-11 sm:w-11`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xl font-bold sm:text-2xl">{value}</div>
        <div className="truncate text-[11px] text-slate-500 sm:text-xs">{label}</div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: () => api<any>('/stats/summary'),
    refetchInterval: 15000,
  });
  const series = useQuery({
    queryKey: ['timeseries'],
    queryFn: () => api<{ date: string; jobs: number; pages: number }[]>('/stats/timeseries?days=14'),
  });
  const recent = useQuery({
    queryKey: ['recent-jobs'],
    queryFn: () => api<JobsPage>('/jobs?pageSize=8'),
    refetchInterval: 15000,
  });

  if (summary.isLoading) return <Spinner />;
  if (summary.isError) return <ErrorBox message={(summary.error as Error).message} />;

  const s = summary.data!;
  const maxJobs = Math.max(1, ...(series.data ?? []).map((d) => d.jobs));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={PrinterIcon} label="Impresoras OK" value={`${s.printers.ok}/${s.printers.total}`} accent="bg-indigo-600" />
        <Stat icon={Layers} label="En cola" value={s.queued} accent="bg-amber-500" />
        <Stat icon={FileText} label="Trabajos hoy" value={s.jobsToday} accent="bg-emerald-600" />
        <Stat icon={UsersIcon} label="Páginas del mes" value={s.pagesMonth} accent="bg-sky-600" />
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 font-semibold">Trabajos de los últimos 14 días</h2>
        {series.isLoading ? (
          <Spinner label="Cargando gráfica…" />
        ) : (
          <div className="flex h-40 items-end gap-2">
            {(series.data ?? []).map((d) => (
              <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                <div className="text-[10px] font-semibold text-slate-400 opacity-0 group-hover:opacity-100">{d.jobs}</div>
                <div
                  className="w-full rounded-t-md bg-indigo-500/80 transition group-hover:bg-indigo-600"
                  style={{ height: `${Math.max(4, (d.jobs / maxJobs) * 130)}px` }}
                  title={`${d.date}: ${d.jobs} trabajos, ${d.pages} páginas`}
                />
                <div className="text-[10px] text-slate-400">{d.date.slice(8)}</div>
              </div>
            ))}
            {!series.data?.length && <div className="text-sm text-slate-400">Aún no hay datos suficientes.</div>}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Trabajos recientes</h2>
        </div>
        {recent.isLoading ? <Spinner /> : <JobsTable jobs={recent.data?.items ?? []} onRefresh={() => recent.refetch()} />}
      </Card>
    </div>
  );
}
