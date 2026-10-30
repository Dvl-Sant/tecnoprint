import { describe, it, expect } from 'vitest';
import { pagesFromPdfInfo } from '../src/cups/pages';

const PDFINFO_OUT = `Title:          remision.pdf
Pages:          4
Page size:      612 x 792 pts (letter)
File size:      217088 bytes`;

describe('pagesFromPdfInfo', () => {
  it('extrae el número de páginas', () => {
    expect(pagesFromPdfInfo(PDFINFO_OUT)).toBe(4);
  });
  it('devuelve null si no hay información', () => {
    expect(pagesFromPdfInfo('')).toBeNull();
    expect(pagesFromPdfInfo('Error: no such file')).toBeNull();
  });
});
