import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Card, Button, Input, Label, ErrorBox } from '../components/ui';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
            <Printer size={28} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">TecnoPrint</h1>
            <p className="text-sm text-slate-500">Portal de impresión corporativo</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Usuario</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </div>
          <div>
            <Label>Contraseña</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <ErrorBox message={error} />}
          <Button type="submit" className="w-full justify-center py-2.5" disabled={busy || !username || !password}>
            {busy ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
