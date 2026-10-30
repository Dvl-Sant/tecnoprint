import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { JobsPage, Printer } from '../api/client';
import { Card, Button, Input, Select, Label, Spinner, ErrorBox } from '../components/ui';
import JobsTable from '../components/JobsTable';
import { useAuth } from '../auth/AuthContext';

export default function Jobs() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [userFilter, setUserFilter] = useState('');
  const [printer, setPrinter] = useState('');
  const [state, setState] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const printers = useQuery({ queryKey: ['printers'], queryFn: () => api<Printer[]>('/printers') });
  const jobs = useQuery({
    queryKey: ['jobs', { userFilter, printer, state, from, to, page }],
    queryFn: () => {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (userFilter) q.set('user', userFilter);
      if (printer) q.set('printer', printer);
      if (state) q.set('state', state);
      if (from) q.set('from', new Date(from + 'T00:00:00').toISOString());
      if (to) q.set('to', new Date(to + 'T23:59:59').toISOString());
      return api<JobsPage>(`/jobs?${q}`);
    },
    refetchInterval: 10000,
  });

  const totalPages = Math.max(1, Math.ceil((jobs.data?.total ?? 0) / pageSize));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Trabajos de impresión</h1>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        {isAdmin && (
          <div className="w-40">
            <Label>Usuario</Label>
            <Input placeholder="Todos" value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }} />
          </div>
        )}
        <div className="w-52">
          <Label>Impresora</Label>
          <Select value={printer} onChange={(e) => { setPrinter(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {(printers.data ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </Select>
        </div>
        <div className="w-40">
          <Label>Estado</Label>
          <Select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="pending">En cola</option>
            <option value="processing">Procesando</option>
            <option value="completed">Completados</option>
            <option value="canceled">Cancelados</option>
            <option value="aborted">Abortados</option>
          </Select>
        </div>
        <div>
          <Label>Desde</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <Label>Hasta</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <Button variant="soft" onClick={() => { setUserFilter(''); setPrinter(''); setState(''); setFrom(''); setTo(''); setPage(1); }}>
          Limpiar
        </Button>
      </Card>

      <Card className="p-5">
        {jobs.isLoading ? <Spinner /> : jobs.isError ? <ErrorBox message={(jobs.error as Error).message} /> : (
          <>
            <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
              <span>{jobs.data?.total} trabajo(s)</span>
              <div className="flex items-center gap-2">
                <Button variant="soft" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button>
                <span>Página {page} de {totalPages}</span>
                <Button variant="soft" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>→</Button>
              </div>
            </div>
            <JobsTable jobs={jobs.data?.items ?? []} onRefresh={() => jobs.refetch()} />
          </>
        )}
      </Card>
    </div>
  );
}
