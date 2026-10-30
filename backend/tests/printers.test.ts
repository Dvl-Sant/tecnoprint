import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app';
import { db, createUser } from '../src/db';
import { makeFakeCups } from './helpers/fake';

let adminToken = '';
let userToken = '';
const fake = makeFakeCups();

beforeAll(async () => {
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM jobs');
  createUser({ username: 'admin', password: 'adminpass1', role: 'admin' });
  createUser({ username: 'empleado', password: 'clave456' });
  const app = await buildApp(fake.adapter);
  const a = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'adminpass1' } });
  adminToken = a.json().token;
  const u = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'empleado', password: 'clave456' } });
  userToken = u.json().token;
  await app.close();
});

describe('GET /api/printers', () => {
  it('devuelve las impresoras del adaptador', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({ method: 'GET', url: '/api/printers', headers: { authorization: `Bearer ${adminToken}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ name: 'HP_Color_M283fdw', status: 'idle', accepting: true, queuedJobs: 1 });
    expect(body[1]).toMatchObject({ name: 'Lexmark_MS823dn', status: 'stopped', accepting: false });
    await app.close();
  });

  it('requiere autenticación', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({ method: 'GET', url: '/api/printers' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/printers/:name/:action', () => {
  it('usuario sin rol admin → 403', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'POST', url: '/api/printers/HP_Color_M283fdw/pause',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('admin ejecuta la acción en la impresora existente', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'POST', url: '/api/printers/Lexmark_MS823dn/resume',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.calls.at(-1)).toEqual({ action: 'resume', args: ['Lexmark_MS823dn'] });
    await app.close();
  });

  it('impresora inexistente → 404', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'POST', url: '/api/printers/NoExiste/pause',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('alta/edición/baja de impresoras desde el portal', () => {
  it('admin agrega impresora driverless (dnssd + everywhere)', async () => {
    const app = await buildApp(fake.adapter);
    const uri = 'dnssd://HP%20LaserJet%20Pro%20M501dn%20(673E55)._ipp._tcp.local/?uuid=50484254';
    const res = await app.inject({
      method: 'POST', url: '/api/printers',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: { name: 'HP_Nueva', uri, location: 'Planta alta', description: 'HP LaserJet' },
    });
    expect(res.statusCode).toBe(201);
    expect(fake.calls.at(-1)).toMatchObject({
      action: 'addPrinter',
      args: [{ name: 'HP_Nueva', uri, location: 'Planta alta', description: 'HP LaserJet', model: 'everywhere' }],
    });
    await app.close();
  });

  it('rechaza everywhere con URI socket (requiere IPP)', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'POST', url: '/api/printers',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: { name: 'HP_Socket', uri: 'socket://192.0.2.35:9100', model: 'everywhere' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/everywhere/i);
    await app.close();
  });

  it('rechaza nombre inválido (espacios)', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'POST', url: '/api/printers',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: { name: 'Mi Impresora', uri: 'socket://192.0.2.35:9100' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rechaza URI con esquema no permitido', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'POST', url: '/api/printers',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: { name: 'Trampa', uri: 'file:///etc/passwd' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('usuario sin admin no puede agregar (403)', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'POST', url: '/api/printers',
      headers: { authorization: `Bearer ${userToken}`, 'content-type': 'application/json' },
      payload: { name: 'X1', uri: 'socket://192.0.2.35:9100' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('editar ubicación y eliminar delegan en el adaptador', async () => {
    const app = await buildApp(fake.adapter);
    const put = await app.inject({
      method: 'PUT', url: '/api/printers/HP_Color_M283fdw',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: { location: 'Planta baja — recepción' },
    });
    expect(put.statusCode).toBe(200);
    expect(fake.calls.at(-1)).toEqual({ action: 'modifyPrinter', args: ['HP_Color_M283fdw', { location: 'Planta baja — recepción' }] });

    const del = await app.inject({
      method: 'DELETE', url: '/api/printers/Lexmark_MS823dn',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(del.statusCode).toBe(200);
    expect(fake.calls.at(-1)).toEqual({ action: 'deletePrinter', args: ['Lexmark_MS823dn'] });

    const del404 = await app.inject({
      method: 'DELETE', url: '/api/printers/NoExiste',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(del404.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/cups/devices devuelve dispositivos descubiertos', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'GET', url: '/api/cups/devices',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({ uri: 'socket://192.0.2.35:9100', info: 'network' });
    await app.close();
  });
});
