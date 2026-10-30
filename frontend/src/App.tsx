import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import Layout from './components/Layout';
import { useAuth } from './auth/AuthContext';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Printers from './pages/Printers';
import PrinterDetail from './pages/PrinterDetail';
import Jobs from './pages/Jobs';
import Print from './pages/Print';
import Users from './pages/Users';
import Profile from './pages/Profile';

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Verificando sesión…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/impresoras" element={<Printers />} />
          <Route path="/impresoras/:name" element={<PrinterDetail />} />
          <Route path="/trabajos" element={<Jobs />} />
          <Route path="/imprimir" element={<Print />} />
          <Route path="/usuarios" element={<RequireAuth admin><Users /></RequireAuth>} />
          <Route path="/perfil" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
