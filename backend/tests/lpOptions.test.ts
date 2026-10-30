import { describe, it, expect } from 'vitest';
import { buildLpOptions, isValidPageRanges, MEDIA_SIZES, NUMBER_UP } from '../src/cups/lpOptions';

describe('buildLpOptions', () => {
  it('sin opciones no genera argumentos', () => {
    expect(buildLpOptions({})).toEqual([]);
  });

  it('mapea copias, doble cara y color', () => {
    expect(buildLpOptions({ copies: 3, sides: 'two-sided-long-edge', color: true })).toEqual([
      '-n', '3',
      '-o', 'sides=two-sided-long-edge',
      '-o', 'print-color-mode=color',
    ]);
  });

  it('horizontal (landscape)', () => {
    expect(buildLpOptions({ orientation: 'landscape' })).toEqual(['-o', 'landscape']);
    expect(buildLpOptions({ orientation: 'portrait' })).toEqual([]);
  });

  it('páginas impares/pares', () => {
    expect(buildLpOptions({ pageSet: 'odd' })).toEqual(['-o', 'page-set=odd']);
    expect(buildLpOptions({ pageSet: 'even' })).toEqual(['-o', 'page-set=even']);
    expect(buildLpOptions({ pageSet: 'all' })).toEqual([]);
  });

  it('rangos personalizados normalizando espacios', () => {
    expect(buildLpOptions({ pageRanges: '1-3, 8, 10-15' })).toEqual(['-o', 'page-ranges=1-3,8,10-15']);
  });

  it('tamaño de papel, ajustar a página y N por hoja', () => {
    expect(buildLpOptions({ media: 'letter', fitToPage: true, numberUp: 2 })).toEqual([
      '-o', 'media=letter',
      '-o', 'fit-to-page',
      '-o', 'number-up=2',
    ]);
    expect(buildLpOptions({ numberUp: 1 })).toEqual([]); // 1 por hoja = default
  });
});

describe('isValidPageRanges', () => {
  it('acepta formatos de Windows', () => {
    expect(isValidPageRanges('1-3,8,10-15')).toBe(true);
    expect(isValidPageRanges('1-3, 8, 10-15')).toBe(true);
    expect(isValidPageRanges('5')).toBe(true);
  });
  it('rechaza basura', () => {
    expect(isValidPageRanges('uno-3')).toBe(false);
    expect(isValidPageRanges('1-3;8')).toBe(false);
    expect(isValidPageRanges('-5')).toBe(false);
    expect(isValidPageRanges('1-')).toBe(false);
  });
});

describe('catálogos', () => {
  it('papeles y N-por-hoja estándar', () => {
    expect(MEDIA_SIZES).toContain('letter');
    expect(MEDIA_SIZES).toContain('a4');
    expect(NUMBER_UP).toEqual([1, 2, 4, 6, 9, 16]);
  });
});
