/** Extrae "Pages: N" de la salida de pdfinfo. */
export function pagesFromPdfInfo(out: string): number | null {
  const m = out.match(/^Pages:\s+(\d+)\s*$/m);
  return m ? parseInt(m[1], 10) : null;
}
