import 'dotenv/config';
import path from 'node:path';

export interface Config {
  port: number;
  jwtSecret: string;
  cupsMode: 'local' | 'ssh';
  sshAlias: string;
  cupsTarget: string; // p.ej. "-h localhost:6320" (vacío en producción)
  printersConf: string;
  spoolDir: string;
  dbPath: string;
  uploadDir: string;
  maxUploadMb: number;
}

const env = process.env;

export const config: Config = {
  port: Number(env.PORT || 3311),
  jwtSecret: env.JWT_SECRET || 'dev-secret-cambiar',
  cupsMode: env.CUPS_MODE === 'local' ? 'local' : 'ssh',
  sshAlias: env.SSH_ALIAS || 'cups-server',
  cupsTarget: env.CUPS_TARGET || '',
  printersConf: env.PRINTERS_CONF || '/etc/cups/printers.conf',
  spoolDir: env.SPOOL_DIR || '/var/spool/cups',
  dbPath: env.DB_PATH || './data/tecnoprint.db',
  uploadDir: env.UPLOAD_DIR || './data/uploads',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 50),
};

export function spoolFileForServerPath(jobId: number): string {
  return path.posix.join(config.spoolDir, `d${String(jobId).padStart(5, '0')}-001`);
}
