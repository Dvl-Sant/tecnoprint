import Fastify, { FastifyInstance } from 'fastify';
import path from 'node:path';
import fs from 'node:fs';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { CupsAdapter } from './cups/types';
import { registerAuthRoutes } from './auth/routes';
import { registerUserRoutes } from './users/routes';
import { registerPrinterRoutes } from './printers/routes';
import { registerJobRoutes } from './jobs/routes';
import { registerPrintRoutes } from './print/routes';
import { registerStatsRoutes } from './stats/routes';

declare module 'fastify' {
  interface FastifyInstance {
    cups: CupsAdapter;
  }
}

export async function buildApp(cups: CupsAdapter): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });
  app.decorate('cups', cups);

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

  app.get('/api/health', async () => ({ ok: true }));

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerPrinterRoutes(app);
  registerJobRoutes(app);
  registerPrintRoutes(app);
  registerStatsRoutes(app);

  // Frontend estático solo en producción (modo local, dentro del servidor)
  const feDist = path.resolve(__dirname, '../../frontend/dist');
  if (config.cupsMode === 'local' && fs.existsSync(feDist)) {
    await app.register(fastifyStatic, { root: feDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api')) {
        return reply.code(404).send({ error: 'No encontrado' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'No encontrado' }));
  }

  return app;
}
