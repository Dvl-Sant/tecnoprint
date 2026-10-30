import { useState } from 'react';
import { api } from '../api/client';
import { Card, Button, Input, Label, ErrorBox } from '../components/ui';
import { useAuth } from '../auth/AuthContext';

export default function Profile() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    try {
      await api('/auth/password', { method: 'PUT', body: JSON.stringify({ current, next }) });
      setMsg('Contraseña actualizada correctamente.');
      setCurrent(''); setNext('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-bold">Mi perfil</h1>
      <Card className="p-6">
        <div className="mb-5 space-y-1">
          <div className="text-sm text-slate-500">Usuario</div>
          <div className="font-semibold">{user?.username}</div>
          <div className="text-sm text-slate-500">{user?.displayName || '—'}</div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Contraseña actual</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <Label>Nueva contraseña (mín. 6)</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          {error && <ErrorBox message={error} />}
          {msg && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{msg}</div>}
          <Button type="submit" className="w-full justify-center" disabled={busy}>Cambiar contraseña</Button>
        </form>
      </Card>
    </div>
  );
}
