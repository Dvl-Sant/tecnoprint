import { describe, it, expect, beforeEach } from 'vitest';
import { db, createUser, findUserByUsername, verifyUserPassword } from '../src/db';

beforeEach(() => {
  db.exec('DELETE FROM users');
});

describe('db/users', () => {
  it('crea usuario con hash de contraseña', () => {
    const u = createUser({ username: 'jperez', password: 'secreto123', role: 'admin', displayName: 'Jorge' });
    expect(u.username).toBe('jperez');
    expect(u.password_hash).not.toContain('secreto123');
    expect(u.role).toBe('admin');
    expect(findUserByUsername('jperez')).toBeDefined();
  });

  it('verifica credenciales correctas e incorrectas', () => {
    createUser({ username: 'memo', password: 'abc123' });
    expect(verifyUserPassword('memo', 'abc123')?.username).toBe('memo');
    expect(verifyUserPassword('memo', 'malapassword')).toBeNull();
    expect(verifyUserPassword('nadie', 'abc123')).toBeNull();
  });
});
