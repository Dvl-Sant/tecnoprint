import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UploadCloud, CheckCircle2, FileText, Eye, EyeOff } from 'lucide-react';
import { api } from '../api/client';
import type { Printer } from '../api/client';
import { Card, Button, Input, Select, Label, ErrorBox } from '../components/ui';
import PdfPreview from '../components/PdfPreview';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt';

const PAPELES: { value: string; label: string }[] = [
  { value: '', label: 'Automático (de la impresora)' },
  { value: 'letter', label: 'Carta (letter)' },
  { value: 'legal', label: 'Oficio (legal)' },
  { value: 'a4', label: 'A4' },
  { value: 'a5', label: 'A5' },
  { value: 'tabloid', label: 'Tabloide (11×17)' },
  { value: 'executive', label: 'Ejecutivo' },
  { value: 'statement', label: 'Media carta' },
  { value: 'a3', label: 'A3' },
  { value: 'b5', label: 'B5' },
];

export default function Print() {
  const printers = useQuery({ queryKey: ['printers'], queryFn: () => api<Printer[]>('/printers') });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [printer, setPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [duplex, setDuplex] = useState(false);
  const [color, setColor] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageMode, setPageMode] = useState<'all' | 'odd' | 'even' | 'custom'>('all');
  const [pageRanges, setPageRanges] = useState('');
  const [media, setMedia] = useState('');
  const [fitToPage, setFitToPage] = useState(false);
  const [numberUp, setNumberUp] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ jobId: number; pages: number | null } | null>(null);
  const [fullPreview, setFullPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPdf = !!file && file.name.toLowerCase().endsWith('.pdf');

  // Vista previa local del PDF (sin subirlo)
  useEffect(() => {
    if (file && isPdf) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file, isPdf]);

  function pick(f: File | null) {
    setFile(f);
    setResult(null);
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !printer) return;
    if (pageMode === 'custom' && !pageRanges.trim()) {
      setError('Escribe los rangos de páginas, por ejemplo: 1-3,8,10-15');
      return;
    }
    setBusy(true); setError(''); setResult(null);
    try {
      const fd = new FormData();
      // Importante: los campos de texto ANTES del archivo (multipart streaming)
      fd.append('printer', printer);
      fd.append('copies', String(copies));
      fd.append('sides', duplex ? 'two-sided-long-edge' : 'one-sided');
      fd.append('color', String(color));
      fd.append('orientation', orientation);
      fd.append('pageSet', pageMode === 'odd' || pageMode === 'even' ? pageMode : 'all');
      if (pageMode === 'custom') fd.append('pageRanges', pageRanges);
      if (media) fd.append('media', media);
      fd.append('fitToPage', String(fitToPage));
      fd.append('numberUp', String(numberUp));
      fd.append('file', file);
      const res = await api<{ jobId: number; pages: number | null }>('/print', { method: 'POST', body: fd });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const available = (printers.data ?? []).filter((p) => p.accepting);
  const selected = (printers.data ?? []).find((p) => p.name === printer);
  const caps = selected?.capabilities ?? null;

  // Si la impresora no soporta color/dúplex, forzar los valores soportados
  useEffect(() => {
    if (caps && !caps.color) setColor(false);
    if (caps && !caps.duplex) setDuplex(false);
  }, [caps?.color, caps?.duplex]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Imprimir documento</h1>

      <div className={`grid gap-5 ${previewUrl && showPreview ? 'lg:grid-cols-2' : ''}`}>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-5">
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pick(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <UploadCloud className="text-indigo-500" size={32} />
              {file ? (
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={18} className="text-indigo-500" />
                  <span className="font-semibold">{file.name}</span>
                  <span className="text-slate-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:underline"
                    onClick={(e) => { e.stopPropagation(); pick(null); }}
                  >
                    quitar
                  </button>
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  Arrastra tu archivo aquí o <span className="font-medium text-indigo-600">explora</span>
                  <div className="mt-1 text-xs text-slate-400">PDF, Word, Excel, PowerPoint, imagen o texto (máx. 50 MB)</div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
            </div>

            <div>
              <Label>Impresora</Label>
              <Select value={printer} onChange={(e) => setPrinter(e.target.value)}>
                <option value="">— Elige una impresora —</option>
                {available.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}{p.location ? ` (${p.location})` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Configuración de impresión</div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Orientación</Label>
                  <Select value={orientation} onChange={(e) => setOrientation(e.target.value as any)}>
                    <option value="portrait">Vertical</option>
                    <option value="landscape">Horizontal</option>
                  </Select>
                </div>
                <div>
                  <Label>Tamaño de papel</Label>
                  <Select value={media} onChange={(e) => setMedia(e.target.value)}>
                    {PAPELES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Páginas</Label>
                  <Select value={pageMode} onChange={(e) => setPageMode(e.target.value as any)}>
                    <option value="all">Todas</option>
                    <option value="odd">Solo impares</option>
                    <option value="even">Solo pares</option>
                    <option value="custom">Personalizado…</option>
                  </Select>
                </div>
                {pageMode === 'custom' && (
                  <div>
                    <Label>Rangos (ej. 1-3,8,10-15)</Label>
                    <Input value={pageRanges} onChange={(e) => setPageRanges(e.target.value)} placeholder="1-3,8,10-15" />
                  </div>
                )}
                <div>
                  <Label>Copias</Label>
                  <Input type="number" min={1} max={999} value={copies} onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value || '1', 10)))} />
                </div>
                <div>
                  <Label>Páginas por hoja</Label>
                  <Select value={numberUp} onChange={(e) => setNumberUp(parseInt(e.target.value, 10))}>
                    {[1, 2, 4, 6, 9, 16].map((n) => <option key={n} value={n}>{n} por hoja</option>)}
                  </Select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <label className={`flex items-center gap-2 ${caps && !caps.duplex ? 'cursor-not-allowed text-slate-300' : ''}`}>
                  <input
                    type="checkbox"
                    checked={duplex}
                    onChange={(e) => setDuplex(e.target.checked)}
                    disabled={!!caps && !caps.duplex}
                    className="h-4 w-4 rounded"
                  />
                  Doble cara
                  {caps && !caps.duplex && <span className="text-xs text-slate-400">(no soportado)</span>}
                </label>
                <label className={`flex items-center gap-2 ${caps && !caps.color ? 'cursor-not-allowed text-slate-300' : ''}`}>
                  <input
                    type="checkbox"
                    checked={color}
                    onChange={(e) => setColor(e.target.checked)}
                    disabled={!!caps && !caps.color}
                    className="h-4 w-4 rounded"
                  />
                  A color
                  {caps && !caps.color && <span className="text-xs text-slate-400">(solo B/N)</span>}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={fitToPage} onChange={(e) => setFitToPage(e.target.checked)} className="h-4 w-4 rounded" />
                  Ajustar al tamaño de papel
                </label>
              </div>
            </div>

            {error && <ErrorBox message={error} />}
            {result && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 size={18} />
                Enviado — trabajo <strong>#{result.jobId}</strong>
                {result.pages != null && <> · {result.pages} página(s)</>}. Míralo en la sección Trabajos.
              </div>
            )}

            <Button type="submit" className="w-full justify-center py-2.5" disabled={busy || !file || !printer}>
              {busy ? 'Enviando…' : 'Enviar a imprimir'}
            </Button>
          </form>
        </Card>

        {previewUrl && (
          <Card className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-semibold">Vista previa</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={() => setFullPreview(true)} title="Pantalla completa">⛶</Button>
                <Button variant="soft" onClick={() => window.open(previewUrl, '_blank')} title="Abrir en otra pestaña">
                  Abrir ↗
                </Button>
                <Button variant="ghost" onClick={() => setShowPreview(!showPreview)} title={showPreview ? 'Ocultar' : 'Mostrar'}>
                  {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </div>
            {showPreview && file && <PdfPreview source={file} />}
          </Card>
        )}

        {/* Vista previa a pantalla completa */}
        {fullPreview && previewUrl && (
          <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
            <div className="flex items-center justify-between px-4 py-2.5 text-white">
              <span className="text-sm font-semibold">Vista previa — {file?.name}</span>
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={() => setFullPreview(false)}>✕ Cerrar</Button>
              </div>
            </div>
            {file && <PdfPreview source={file} heightClass="flex-1" />}
          </div>
        )}
        {!previewUrl && file && !isPdf && (
          <Card className="flex items-center gap-3 p-4 text-sm text-slate-500">
            <Eye size={18} className="text-slate-400" />
            La vista previa dentro del navegador está disponible para PDF. Los archivos Word/Excel/PowerPoint se
            convierten automáticamente al enviarlos (verás el resultado en Trabajos).
          </Card>
        )}
      </div>
    </div>
  );
}
