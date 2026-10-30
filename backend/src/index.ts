import 'dotenv/config';
import { buildApp } from './app';
import { getAdapter } from './cups/adapters';
import { demoAdapter } from './cups/demo';
import { db, createUser } from './db';
import { SyncService } from './cups/sync';
import { config } from './config';

async function main(): Promise<void> {
  // Usuario admin inicial la primera vez
  const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n as number;
  if (count === 0) {
    createUser({ username: 'admin', password: 'admin123', role: 'admin', displayName: 'Administrador' });
    console.log('Usuario inicial creado: admin / admin123 (cámbiala en Mi perfil)');
  }

  // DEMO=true → adaptador ficticio con datos de ejemplo (sin CUPS real)
  const adapter = process.env.DEMO === 'true' ? demoAdapter : getAdapter();
  const app = await buildApp(adapter);
  const sync = new SyncService(app);
  sync.start(10000);

  const shutdown = async () => {
    await sync.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`TecnoPrint API escuchando en :${config.port} (modo CUPS: ${config.cupsMode})`);
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
