import { execFile } from 'node:child_process';
import { config } from '../config';
import type { RunResult } from './types';

const MAX_BUFFER = 512 * 1024 * 1024;

/**
 * Escapa un argumento para la línea de comandos remota. SSH une argv con
 * espacios: sin esto, `-L "QA desde portal"` llegaría roto en palabras sueltas.
 */
function shq(s: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return `'` + s.replace(/'/g, `'\\''`) + `'`;
}

function sshCommand(args: string[]): string[] {
  return [config.sshAlias, args.map(shq).join(' ')];
}

/**
 * Ejecuta un comando "como si estuviéramos en el servidor".
 * - local: execFile directo.
 * - ssh:   execFile('ssh', [alias, ...args]) — los argumentos se recomponen
 *          como línea de comandos en el servidor, por lo que `sh -c "…"`
 *          también funciona.
 */
export function run(args: string[]): Promise<RunResult> {
  const file = config.cupsMode === 'ssh' ? 'ssh' : args[0];
  const rest =
    config.cupsMode === 'ssh'
      ? sshCommand(args)
      : args.slice(1);
  return new Promise((resolve) => {
    execFile(
      file,
      rest,
      { maxBuffer: MAX_BUFFER, encoding: 'utf8' } as any,
      (error, stdout, stderr) => {
        const code = error ? ((error as any).code ?? 1) : 0;
        resolve({ code: typeof code === 'number' ? code : 1, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      }
    );
  });
}

/** Igual que run() pero captura stdout como Buffer (archivos binarios). */
export function runBinary(args: string[]): Promise<{ code: number; data: Buffer; stderr: string }> {
  return new Promise((resolve) => {
    const file = config.cupsMode === 'ssh' ? 'ssh' : args[0];
    const rest =
      config.cupsMode === 'ssh'
        ? sshCommand(args)
        : args.slice(1);
    execFile(file, rest, { maxBuffer: MAX_BUFFER, encoding: 'buffer' } as any, (error, stdout, stderr) => {
      const code = error ? ((error as any).code ?? 1) : 0;
      resolve({ code: typeof code === 'number' ? code : 1, data: stdout as Buffer, stderr: String(stderr ?? '') });
    });
  });
}

/** Copia un archivo local al servidor (solo tiene sentido en modo ssh). */
export function scpToServer(localPath: string, remotePath: string): Promise<void> {
  if (config.cupsMode !== 'ssh') return Promise.resolve();
  return new Promise((resolve, reject) => {
    execFile('scp', ['-q', localPath, `${config.sshAlias}:${remotePath}`], { maxBuffer: MAX_BUFFER }, (err) =>
      err ? reject(err) : resolve()
    );
  });
}

/** Inserta CUPS_TARGET (p.ej. "-h localhost:6320") tras el comando. */
export function withTarget(args: string[]): string[] {
  if (!config.cupsTarget) return args;
  return [args[0], ...config.cupsTarget.split(/\s+/).filter(Boolean), ...args.slice(1)];
}

/**
 * Envuelve comandos de ADMINISTRACIÓN (lpadmin/lpinfo/cupsenable) que no
 * aceptan -h: libcups toma el destino de la variable CUPS_SERVER. En modo dev
 * con CUPS_TARGET="-h localhost:6320" estas operaciones apuntan a la instancia
 * de pruebas; en producción (sin CUPS_TARGET) quedan en el scheduler real.
 */
export function adminArgs(args: string[]): string[] {
  const m = config.cupsTarget.match(/-h\s+(\S+)/);
  if (config.cupsMode === 'ssh' && m) {
    return ['env', `CUPS_SERVER=${m[1]}`, ...args];
  }
  return args;
}
