import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app';
import { db, createUser } from '../src/db';
import { makeFakeCups } from './helpers/fake';

const { adapter: fakeCups } = makeFakeCups();

let adminToken = '';
let userToken = '';

beforeAll(async () => {
  db.exec('DELETE FROM users');
  createUser({ username: 'admin', password: 'adminpass1', role: 'admin', displayName: 'Admin' });
  const app = await buildApp(fakeCups);
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'adminpass1' } });
  adminToken = res.json().token;
  await app.close();
});

describe('auth', () => {
  it('login correcto devuelve token y datos del usuario', async () => {
    const app = await buildApp(fakeCups);
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'adminpass1' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.username).toBe('admin');
    expect(body.user.role).toBe('admin');
    await app.close();
  });

  it('login incorrecto → 401', async () => {
    const app = await buildApp(fakeCups);
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'mala' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('/api/users requiere token (401) y rol admin (403)', async () => {
    const app = await buildApp(fakeCups);
    const noToken = await app.inject({ method: 'GET', url: '/api/users' });
    expect(noToken.statusCode).toBe(401);

    createUser({ username: 'empleado', password: 'clave456' });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'empleado', password: 'clave456' } });
    userToken = login.json().token;
    const forbbiden = await app.inject({ method: 'GET', url: '/api/users', headers: { authorization: `Bearer ${userToken}` } });
    expect(forbbiden.statusCode).toBe(403);
    await app.close();
  });

  it('admin crea usuario, este puede loguearse y cambiar su password', async () => {
    const app = await buildApp(fakeCups);
    const created = await app.inject({
      method: 'POST', url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'nuevo1', password: 'clave789', displayName: 'Nuevo', role: 'user' },
    });
    expect(created.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST', url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'nuevo1', password: 'clave789' },
    });
    expect(dup.statusCode).toBe(409);

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'nuevo1', password: 'clave789' } });
    expect(login.statusCode).toBe(200);
    const tok = login.json().token;

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${tok}` } });
    expect(me.json().username).toBe('nuevo1');

    const pw = await app.inject({
      method: 'PUT', url: '/api/auth/password',
      headers: { authorization: `Bearer ${tok}` },
      payload: { current: 'clave789', next: 'nuevaclave1' },
    });
    expect(pw.statusCode).toBe(200);
    const oldLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'nuevo1', password: 'clave789' } });
    expect(oldLogin.statusCode).toBe(401);
    await app.close();
  });
});
