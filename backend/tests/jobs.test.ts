import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app';
import { db, createUser } from '../src/db';
import { SyncService } from '../src/cups/sync';
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
  adminToken = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'adminpass1' } })).json().token;
  userToken = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'empleado', password: 'clave456' } })).json().token;
  await app.close();
});

describe('SyncService + GET /api/jobs', () => {
  it('el sync vuelca los trabajos con páginas reales', async () => {
    const app = await buildApp(fake.adapter);
    const sync = new SyncService(app);
    await sync.tick();

    const total = (db.prepare('SELECT COUNT(*) n FROM jobs').get() as any).n;
    expect(total).toBe(3);
    const j39 = db.prepare('SELECT * FROM jobs WHERE cups_job_id=39').get() as any;
    expect(j39.pages).toBe(4);
    expect(j39.state).toBe('completed');
    await sync.stop();
    await app.close();
  });

  it('admin ve todos los trabajos con filtros y paginado', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'GET', url: '/api/jobs?page=1&pageSize=2',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(2);

    const byPrinter = await app.inject({
      method: 'GET', url: '/api/jobs?printer=Lexmark_MS823dn',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(byPrinter.json().total).toBe(1);
    expect(byPrinter.json().items[0].username).toBe('empleado');
    await app.close();
  });

  it('usuario normal solo ve sus propios trabajos', async () => {
    const app = await buildApp(fake.adapter);
    const res = await app.inject({
      method: 'GET', url: '/api/jobs',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].username).toBe('empleado');
    await app.close();
  });
});

describe('acciones sobre trabajos', () => {
  it('documento: usuario no puede ver el de otro (403), admin sí', async () => {
    const app = await buildApp(fake.adapter);
    const forbbiden = await app.inject({
      method: 'GET', url: '/api/jobs/39/document',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(forbbiden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'GET', url: '/api/jobs/39/document',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.startsWith('%PDF')).toBe(true);
    await app.close();
  });

  it('cancelar trabajo ajeno sin admin → 403; admin puede', async () => {
    const app = await buildApp(fake.adapter);
    const forbbiden = await app.inject({
      method: 'POST', url: '/api/jobs/41/cancel',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(forbbiden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'POST', url: '/api/jobs/41/cancel',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(fake.calls.at(-1)).toMatchObject({ action: 'cancel', args: [41] });
    const row = db.prepare('SELECT state FROM jobs WHERE cups_job_id=41').get() as any;
    expect(row.state).toBe('canceled');
    await app.close();
  });

  it('reimprimir solo admin y delega en el adaptador', async () => {
    const app = await buildApp(fake.adapter);
    const forbbiden = await app.inject({
      method: 'POST', url: '/api/jobs/39/reprint',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(forbbiden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'POST', url: '/api/jobs/39/reprint',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(ok.json()).toEqual({ ok: true, newJobId: 99 });
    expect(fake.calls.at(-1)).toEqual({ action: 'reprint', args: [39, 'HP_Color_M283fdw'] });
    await app.close();
  });
});
