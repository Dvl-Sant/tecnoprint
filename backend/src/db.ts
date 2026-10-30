import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS jobs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cups_job_id INTEGER UNIQUE NOT NULL,
  printer TEXT NOT NULL, username TEXT NOT NULL, title TEXT DEFAULT '',
  pages INTEGER, size_bytes INTEGER DEFAULT 0,
  state TEXT NOT NULL CHECK(state IN ('pending','processing','completed','aborted','canceled')),
  source TEXT NOT NULL DEFAULT 'cups' CHECK(source IN ('cups','web')),
  submitted_at TEXT, completed_at TEXT, doc_available INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(username);
CREATE INDEX IF NOT EXISTS idx_jobs_printer ON jobs(printer);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

function openDb(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

export const db: Database.Database = process.env.VITEST
  ? (globalThis as any).__tpDb ?? ((globalThis as any).__tpDb = openDb(':memory:'))
  : openDb(config.dbPath);

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: 'admin' | 'user';
  active: number;
  created_at: string;
}

export function createUser(opts: {
  username: string;
  password: string;
  role?: 'admin' | 'user';
  displayName?: string;
}): UserRow {
  const hash = bcrypt.hashSync(opts.password, 10);
  const info = db
    .prepare(
      `INSERT INTO users(username, password_hash, display_name, role) VALUES(?,?,?,?)`
    )
    .run(opts.username, hash, opts.displayName ?? '', opts.role ?? 'user');
  return db.prepare(`SELECT * FROM users WHERE id=?`).get(info.lastInsertRowid) as UserRow;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE username=?`).get(username) as UserRow | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id=?`).get(id) as UserRow | undefined;
}

export function verifyUserPassword(username: string, password: string): UserRow | null {
  const u = findUserByUsername(username);
  if (!u || !u.active) return null;
  return bcrypt.compareSync(password, u.password_hash) ? u : null;
}
