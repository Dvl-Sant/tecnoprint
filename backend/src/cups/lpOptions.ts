import type { PrintOptions } from './types';

export const MEDIA_SIZES = [
  'letter', 'legal', 'tabloid', 'executive', 'statement',
  'a3', 'a4', 'a5', 'b5',
] as const;

export const NUMBER_UP = [1, 2, 4, 6, 9, 16] as const;

/** Rangos de páginas estilo "1-3,8,10-15" (con o sin espacios tras la coma). */
export function isValidPageRanges(s: string): boolean {
  return /^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(s.replace(/\s+/g, ''));
}

/**
 * Traduce las opciones del portal a argumentos de `lp` de CUPS.
 * Referencia: cups.org/options.html (page-ranges, page-set, media,
 * landscape, fit-to-page, number-up, sides, print-color-mode).
 */
export function buildLpOptions(o: PrintOptions): string[] {
  const out: string[] = [];
  if (o.copies && o.copies > 1) out.push('-n', String(o.copies));
  if (o.sides) out.push('-o', `sides=${o.sides}`);
  if (o.color !== undefined) out.push('-o', `print-color-mode=${o.color ? 'color' : 'monochrome'}`);
  if (o.orientation === 'landscape') out.push('-o', 'landscape');
  if (o.pageSet === 'odd' || o.pageSet === 'even') out.push('-o', `page-set=${o.pageSet}`);
  if (o.pageRanges) out.push('-o', `page-ranges=${o.pageRanges.replace(/\s+/g, '')}`);
  if (o.media) out.push('-o', `media=${o.media}`);
  if (o.fitToPage) out.push('-o', 'fit-to-page');
  if (o.numberUp && o.numberUp > 1) out.push('-o', `number-up=${o.numberUp}`);
  return out;
}
