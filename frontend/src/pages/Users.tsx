import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { UserInfo } from '../api/client';
import { Card, Button, Input, Select, Label, Spinner, ErrorBox, Modal } from '../components/ui';
import { useAuth } from '../auth/AuthContext';

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserInfo[]>('/users') });
  const [modal, setModal] = useState<'new' | 'edit' | 'pass' | null>(null);
  const [target, setTarget] = useState<UserInfo | null>(null);
  const [error, setError] = useState('');

  // formulario
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);

  function openNew() {
    setTarget(null); setUsername(''); setDisplayName(''); setRole('user'); setPassword(''); setActive(true); setError('');
    setModal('new');
  }
  function openEdit(u: UserInfo) {
    setTarget(u); setUsername(u.username); setDisplayName(u.displayName); setRole(u.role); setActive(u.active ?? true); setPassword(''); setError('');
    setModal('edit');
  }

  async function save() {
    setError('');
    try {
      if (modal === 'new') {
        await api('/users', { method: 'POST', body: JSON.stringify({ username, password, displayName, role }) });
      } else if (modal === 'edit' && target) {
        await api(`/users/${target.id}`, { method: 'PUT', body: JSON.stringify({ displayName, role, active }) });
      }
      setModal(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resetPass() {
    if (!target) return;
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return; }
    setError('');
    try {
      await api(`/users/${target.id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (users.isLoading) return <Spinner />;
  if (users.isError) return <ErrorBox message={(users.error as Error).message} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={openNew}>+ Nuevo usuario</Button>
      </div>

      <Card className="overflow-x-auto p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{u.username}</td>
                <td className="px-3 py-2">{u.displayName || '—'}</td>
                <td className="px-3 py-2">{u.role === 'admin' ? 'Administrador' : 'Usuario'}</td>
                <td className="px-3 py-2">
                  {u.active === false
                    ? <span className="text-red-600">Inactivo</span>
                    : <span className="text-emerald-600">Activo</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="soft" onClick={() => { setTarget(u); setPassword(''); setError(''); setModal('pass'); }}>Contraseña</Button>
                    <Button variant="soft" disabled={u.id === me?.id} onClick={() => openEdit(u)}>Editar</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modal === 'new' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'new' ? 'Nuevo usuario' : `Editar ${username}`}>
        <div className="space-y-4">
          {modal === 'new' && (
            <div>
              <Label>Usuario</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Nombre completo</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="user">Usuario</option>
              <option value="admin">Administrador</option>
            </Select>
          </div>
          {modal === 'new' && (
            <div>
              <Label>Contraseña (mín. 6)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {modal === 'edit' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded" />
              Activo (puede iniciar sesión)
            </label>
          )}
          {error && <ErrorBox message={error} />}
          <Button className="w-full justify-center" onClick={save}>Guardar</Button>
        </div>
      </Modal>

      <Modal open={modal === 'pass'} onClose={() => setModal(null)} title={`Nueva contraseña para ${target?.username ?? ''}`}>
        <div className="space-y-4">
          <div>
            <Label>Contraseña (mín. 6)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <ErrorBox message={error} />}
          <Button className="w-full justify-center" onClick={resetPass}>Actualizar contraseña</Button>
        </div>
      </Modal>
    </div>
  );
}
