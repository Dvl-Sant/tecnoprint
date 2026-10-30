import { describe, it, expect } from 'vitest';
import {
  parseLpstatPrinters,
  parseLpstatAccepting,
  parseLpstatJobs,
  parsePrintersConf,
  parsePageLogLine,
  parseEsDate,
} from '../src/cups/parsers';

// ── Fixtures REALES capturados del servidor printserver (192.0.2.10.55) ──
// lpstat habla ESPAÑOL en el servidor (locale es). Se prueban ambos idiomas.

const LPSTAT_P = `la impresora HP_Color_M283fdw está inactiva.  activada desde jue 30 oct 2026 08:00:00
la impresora HP_LaserJet_M404dw está inactiva.  activada desde jue 30 oct 2026 08:00:00
la impresora HP_LaserJet_M501dn está ahora imprimiendo HP_LaserJet_M501dn-41.  activada desde jue 30 oct 2026 08:00:00
la impresora Lexmark_MS823dn está deshabilitada desde jue 30 oct 2026 07:55:00 -
la impresora Plotter-Canon-TC-20 está inactiva.  activada desde mié 29 oct 2026 17:00:00
printer EN_Label is idle.  enabled since Thu 30 Oct 2026 08:00:00 AM -07
printer EN_Printing now printing EN_Printing-7.  enabled since Thu 30 Oct 2026 08:00:00 AM -07`;

const LPSTAT_A = `HP_Color_M283fdw aceptando peticiones desde jue 30 oct 2026 08:00:00 -
HP_LaserJet_M404dw aceptando peticiones desde jue 30 oct 2026 08:00:00 -
Lexmark_MS823dn no acepta peticiones desde jue 30 oct 2026 07:55:00 -
Plotter-Canon-TC-20 aceptando peticiones desde mié 29 oct 2026 17:00:00 -
EN_Label accepting requests since Thu 30 Oct 2026 08:00:00 AM -07 -`;

const LPSTAT_COMPLETED = `HP_Color_M283fdw-39     msistema          2423808   jue 29 oct 2026 15:17:26
HP_LaserJet_M501dn-38   msistema          2391040   jue 29 oct 2026 15:03:59
HP_Color_M283fdw-37     jperez         58205184   jue 29 oct 2026 14:24:52
HP_LaserJet_M404dw-35   jlopez           217088   jue 29 oct 2026 14:22:40
Plotter-Canon-TC-20-32  lgomez          5552128   mié 28 oct 2026 17:53:33`;

const LPSTAT_ACTIVE = `HP_LaserJet_M501dn-41   msistema           175104   vie 30 oct 2026 09:00:00`;

const PRINTERS_CONF = `<Printer HP_Color_M283fdw>
PrinterId 14
Info Impresora M283fdw
Location Planta baja
MakeModel HP ColorLaserJet MFP M282-M285, Fax, driverless, cups-filters 1.28.17
DeviceURI socket://192.0.2.10.32:9100
State Idle
</Printer>
<Printer Plotter-Canon-TC-20>
PrinterId 21
Info Impresora para planos
Location 2do Nivel
DeviceURI socket://192.0.2.10.40:9100
</Printer>`;

const PAGE_LOG_LINES = [
  'HP_LaserJet_M501dn msistema 33 [29/Oct/2026:09:41:38 -0700] total 1 - ::ffff:192.0.2.50.54 cotizacion.xlsx - -',
  'HP_Color_M283fdw jperez 37 [29/Oct/2026:14:24:52 -0700] total 3 - ::ffff:192.0.2.30.48 guia-estudiante.pdf - -',
  'línea basura que no cuadra',
];

describe('parseLpstatPrinters', () => {
  it('detecta idle, printing y stopped (español e inglés)', () => {
    const r = parseLpstatPrinters(LPSTAT_P);
    expect(r).toHaveLength(7);
    expect(r.find((p) => p.name === 'HP_Color_M283fdw')!.status).toBe('idle');
    expect(r.find((p) => p.name === 'HP_LaserJet_M501dn')!.status).toBe('printing');
    expect(r.find((p) => p.name === 'Lexmark_MS823dn')!.status).toBe('stopped');
    expect(r.find((p) => p.name === 'EN_Label')!.status).toBe('idle');
    expect(r.find((p) => p.name === 'EN_Printing')!.status).toBe('printing');
  });

  it('parseLpstatAccepting detecta accepting/not accepting (español e inglés)', () => {
    const r = parseLpstatAccepting(LPSTAT_A);
    expect(r['HP_Color_M283fdw']).toBe(true);
    expect(r['Lexmark_MS823dn']).toBe(false);
    expect(r['EN_Label']).toBe(true);
  });
});

describe('parseLpstatJobs', () => {
  it('parsea trabajos completados en locale español (incluye "mié")', () => {
    const jobs = parseLpstatJobs(LPSTAT_COMPLETED, 'completed');
    expect(jobs).toHaveLength(5);
    const j = jobs[0];
    expect(j.id).toBe(39);
    expect(j.printer).toBe('HP_Color_M283fdw');
    expect(j.user).toBe('msistema');
    expect(j.sizeBytes).toBe(2423808);
    expect(j.state).toBe('completed');
    expect(j.completedAt).toBeTruthy();
    const d = new Date(j.completedAt!);
    expect(d.getMonth()).toBe(9); // octubre
    expect(d.getDate()).toBe(29);
    const plotter = jobs.find((x) => x.id === 32)!;
    expect(plotter.user).toBe('lgomez');
    expect(new Date(plotter.completedAt!).getDate()).toBe(28);
  });

  it('parsea trabajos activos como pending', () => {
    const jobs = parseLpstatJobs(LPSTAT_ACTIVE, 'pending');
    expect(jobs[0].state).toBe('pending');
    expect(jobs[0].id).toBe(41);
    expect(jobs[0].user).toBe('msistema');
  });
});

describe('parsePrintersConf', () => {
  it('extrae location, model (sin sufijo driverless) y uri', () => {
    const r = parsePrintersConf(PRINTERS_CONF);
    expect(r['HP_Color_M283fdw']).toEqual({
      location: 'Planta baja',
      model: 'HP ColorLaserJet MFP M282-M285, Fax',
      uri: 'socket://192.0.2.10.32:9100',
    });
    expect(r['Plotter-Canon-TC-20'].location).toBe('2do Nivel');
    expect(r['Plotter-Canon-TC-20'].uri).toBe('socket://192.0.2.10.40:9100');
  });
});

describe('parsePageLogLine', () => {
  it('extrae job, usuario, páginas y título', () => {
    expect(parsePageLogLine(PAGE_LOG_LINES[0])).toEqual({ job: 33, user: 'msistema', pages: 1, title: 'cotizacion.xlsx' });
    expect(parsePageLogLine(PAGE_LOG_LINES[1])).toEqual({
      job: 37, user: 'jperez', pages: 3, title: 'guia-estudiante.pdf',
    });
    expect(parsePageLogLine(PAGE_LOG_LINES[2])).toBeNull();
  });
});

describe('parseEsDate', () => {
  it('parsea fechas del lpstat español', () => {
    const d = parseEsDate('jue 29 oct 2026 15:17:26');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(29);
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(17);
  });
});
