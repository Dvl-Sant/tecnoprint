import { describe, it, expect, beforeAll } from 'vitest';
import FormData from 'form-data';
import { buildApp } from '../src/app';
import { db, createUser } from '../src/db';
import { makeFakeCups, FAKE_PDF } from './helpers/fake';

let adminToken = '';
const fake = makeFakeCups();

function printRequest(app: any, filename: string, content: Buffer, printer = 'HP_Color_M283fdw') {
  const form = new FormData();
  form.append('printer', printer);
  form.append('copies', '2');
  form.append('sides', 'two-sided-long-edge');
  form.append('color', 'true');
  form.append('file', content, { filename, contentType: 'application/octet-stream' });
  return app.inject({
    method: 'POST',
    url: '/api/print',
    headers: { ...form.getHeaders(), authorization: `Bearer ${adminToken}` },
    payload: form as any,
  });
}

beforeAll(async () => {
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM jobs');
  createUser({ username: 'admin', password: 'adminpass1', role: 'admin' });
  const app = await buildApp(fake.adapter);
  adminToken = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'adminpass1' } })).json().token;
  await app.close();
});

describe('POST /api/print', () => {
  it('imprime un PDF válido y registra la auditoría web', async () => {
    const app = await buildApp(fake.adapter);
    const res = await printRequest(app, 'cotizacion.pdf', FAKE_PDF);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ ok: true, jobId: 42, pages: 3 });

    const submit = fake.calls.find((c) => c.action === 'submit');
    expect(submit).toBeDefined();
    const [file, printer, opts] = submit!.args;
    expect(printer).toBe('HP_Color_M283fdw');
    expect(opts).toEqual({
      copies: 2, sides: 'two-sided-long-edge', color: true,
      orientation: 'portrait', pageSet: 'all', fitToPage: false,
    });

    const row = db.prepare('SELECT username, source, title FROM jobs WHERE cups_job_id=42').get() as any;
    expect(row.username).toBe('admin');
    expect(row.source).toBe('web');
    expect(row.title).toBe('cotizacion.pdf');
    await app.close();
  });

  it('rechaza tipos de archivo no permitidos', async () => {
    const app = await buildApp(fake.adapter);
    const res = await printRequest(app, 'virus.exe', Buffer.from('MZ...'));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/no permitido/i);
    await app.close();
  });

  it('rechaza impresora inexistente', async () => {
    const app = await buildApp(fake.adapter);
    const res = await printRequest(app, 'doc.pdf', FAKE_PDF, 'NoExiste');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/no encontrada/i);
    await app.close();
  });
});
