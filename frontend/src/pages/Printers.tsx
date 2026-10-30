import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, printerIp } from '../api/client';
import type { CupDevice, Printer } from '../api/client';
import { Button, Input, Select, Label, Spinner, ErrorBox, Modal } from '../components/ui';
import PrinterCard from '../components/PrinterCard';
import { useAuth } from '../auth/AuthContext';

export default function Printers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['printers'],
    queryFn: () => api<Printer[]>('/printers'),
    refetchInterval: 10000,
  });

  // ── Modal de alta ──
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', uri: '', location: '', description: '', model: 'everywhere' });
  const [ppdFile, setPpdFile] = useState<File | null>(null);
  const [devices, setDevices] = useState<CupDevice[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const ppdRef = useRef<HTMLInputElement>(null);

  // ── Modal de edición ──
  const [editTarget, setEditTarget] = useState<Printer | null>(null);
  const [editForm, setEditForm] = useState({ uri: '', location: '', description: '' });
  const [editError, setEditError] = useState('');

  function openAdd() {
    setForm({ name: '', uri: '', location: '', description: '', model: 'everywhere' });
    setPpdFile(null); setDevices(null); setAddError(''); setAddOpen(true);
  }

  async function scanNetwork() {
    setScanning(true); setAddError('');
    try {
      setDevices(await api<CupDevice[]>('/cups/devices'));
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true); setAddError('');
    try {
      let res: Response;
      if (ppdFile) {
        const fd = new FormData();
        fd.append('name', form.name);
        fd.append('uri', form.uri);
        fd.append('location', form.location);
        fd.append('description', form.description);
        fd.append('model', 'everywhere');
        fd.append('ppd', ppdFile);
        res = await fetch('/api/printers', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('tp_token')}` },
          body: fd,
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error((b as any).error || `Error ${res.status}`);
        }
      } else {
        await api('/printers', { method: 'POST', body: JSON.stringify(form) });
      }
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ['printers'] });
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function openEdit(p: Printer) {
    setEditTarget(p);
    setEditForm({ uri: p.uri, location: p.location, description: p.model });
    setEditError('');
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError('');
    try {
      await api(`/printers/${editTarget.name}`, {
        method: 'PUT',
        body: JSON.stringify({
          uri: editForm.uri,
          location: editForm.location,
          description: editForm.description,
        }),
      });
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: ['printers'] });
    } catch (err) {
      setEditError((err as Error).message);
    }
  }

  async function onAction(name: string, action: string) {
    try {
      if (action === '__edit') {
        const p = (data ?? []).find((x) => x.name === name);
        if (p) openEdit(p);
        return;
      }
      if (action === '__delete') {
        if (!confirm(`¿Eliminar la impresora "${name}" de CUPS?\nLos trabajos en cola quedarán huérfanos.`)) return;
        await api(`/printers/${name}`, { method: 'DELETE' });
        refetch();
        return;
      }
      await api(`/printers/${name}/${action}`, { method: 'POST' });
      refetch();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBox message={(error as Error).message} />;

  const printers = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Impresoras</h1>
        {isAdmin && <Button onClick={openAdd}>＋ Agregar impresora</Button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {printers.map((p) => (
          <PrinterCard key={p.name} printer={p} onAction={onAction} />
        ))}
      </div>

      {/* ── Alta de impresora ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Agregar impresora" wide>
        <form onSubmit={submitAdd} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nombre en CUPS * (sin espacios)</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HP_LaserJet_Oficina" />
            </div>
            <div>
              <Label>Driver</Label>
              <Select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                <option value="everywhere">Everywhere (driverless — recomendado)</option>
                <option value="raw">Raw (sin filtros, para colas ya formateadas)</option>
              </Select>
              <div className="mt-1 text-[11px] text-slate-400">
                Everywhere requiere URI ipp/ipps/dnssd. Para socket:// elige Raw o sube un PPD.
              </div>
            </div>
          </div>

          <div>
            <Label>Conexión (URI) *</Label>
            <div className="flex gap-2">
              <Input value={form.uri} onChange={(e) => setForm({ ...form, uri: e.target.value })} placeholder="socket://192.0.2.10.35:9100" />
              <Button type="button" variant="soft" onClick={scanNetwork} disabled={scanning}>
                {scanning ? 'Escaneando…' : 'Escanear red'}
              </Button>
            </div>
            {devices && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-slate-400">{devices.length} dispositivo(s) encontrado(s) — clic para usar:</div>
                <div className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                  {devices.map((d) => (
                    <button
                      key={d.uri}
                      type="button"
                      className="block w-full truncate rounded px-2 py-1 text-left font-mono text-xs hover:bg-indigo-50 hover:text-indigo-700"
                      onClick={() => {
                        const driverless = /^(dnssd|ipp|ipps):\/\//.test(d.uri);
                        setForm({ ...form, uri: d.uri, model: driverless ? 'everywhere' : 'raw' });
                      }}
                      title={d.uri}
                    >
                      [{d.info}] {decodeURIComponent(d.uri).slice(0, 70)}
                    </button>
                  ))}
                  {!devices.length && <div className="px-2 py-1 text-xs text-slate-400">No se encontraron dispositivos. Escribe la URI manualmente.</div>}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Ubicación</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Planta baja" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="HP LaserJet Pro M404dw" />
            </div>
          </div>

          <div>
            <Label>PPD opcional (solo para impresoras sin driverless, ej. plotter)</Label>
            <input
              ref={ppdRef}
              type="file"
              accept=".ppd,.ppd.gz"
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-200"
              onChange={(e) => setPpdFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {addError && <ErrorBox message={addError} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="soft" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={adding || !form.name || !form.uri}>
              {adding ? 'Agregando…' : 'Agregar impresora'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Edición de impresora ── */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Editar ${editTarget?.name ?? ''}`}>
        <form onSubmit={submitEdit} className="space-y-4">
          <div>
            <Label>URI de conexión</Label>
            <Input value={editForm.uri} onChange={(e) => setEditForm({ ...editForm, uri: e.target.value })} />
            {editTarget && printerIp(editTarget.uri) && (
              <div className="mt-1 text-xs text-slate-400">IP actual: {printerIp(editTarget.uri)}</div>
            )}
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
          </div>
          <div>
            <Label>Descripción / modelo</Label>
            <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          {editError && <ErrorBox message={editError} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="soft" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button type="submit">Guardar cambios</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
