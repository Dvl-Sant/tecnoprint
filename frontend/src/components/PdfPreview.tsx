import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getToken } from '../api/client';
import { Button, Spinner } from './ui';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Visor de PDF con ajuste automático al ancho del contenedor (PDF.js).
 * `source` puede ser un File local o una URL del API (se le agrega el token).
 */
export default function PdfPreview({ source, heightClass = 'h-[60vh] lg:h-[70vh]' }: {
  source: File | string;
  heightClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const renderTask = useRef<any>(null);

  // Cargar el documento
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const buffer =
          typeof source === 'string'
            ? await (await fetch(source, { headers: { Authorization: `Bearer ${getToken()}` } })).arrayBuffer()
            : await source.arrayBuffer();
        const loaded = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setDoc(loaded);
        setPage(1);
        setNumPages(loaded.numPages);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  // Observar el ancho del contenedor para re-ajustar
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Renderizar la página actual ajustada al ancho
  useEffect(() => {
    if (!doc || !canvasRef.current || !containerRef.current || !width) return;
    let cancelled = false;
    renderTask.current?.cancel?.();
    (async () => {
      try {
        const p = await doc.getPage(Math.min(page, numPages || 1));
        const base = p.getViewport({ scale: 1 });
        const fit = Math.max(0.1, (width - 24) / base.width);
        const viewport = p.getViewport({ scale: fit * zoom });
        const canvas = canvasRef.current!;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext('2d')!;
        const task = p.render({ canvasContext: ctx, viewport });
        renderTask.current = task;
        await task.promise;
      } catch (e: any) {
        if (!cancelled && e?.name !== 'RenderingCancelledException') {
          console.error('PDF render:', e);
        }
      }
    })();
    return () => { cancelled = true; renderTask.current?.cancel?.(); };
  }, [doc, page, zoom, width, numPages]);

  return (
    <div className={`flex flex-col ${heightClass}`}>
      <div className="flex items-center justify-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
        <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>←</Button>
        <span>{page} / {numPages || '…'}</span>
        <Button variant="ghost" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>→</Button>
        <span className="mx-2 h-5 w-px bg-slate-300" />
        <Button variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.5}>−</Button>
        <span className="w-14 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} disabled={zoom >= 3}>+</Button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-200 p-3">
        {loading && <Spinner label="Cargando documento…" />}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-center">
          <canvas ref={canvasRef} className="rounded shadow-md bg-white" />
        </div>
      </div>
    </div>
  );
}
