import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Printer, FileText, Send, Users, UserCircle, LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, admin: false },
  { to: '/impresoras', label: 'Impresoras', icon: Printer, admin: false },
  { to: '/trabajos', label: 'Trabajos', icon: FileText, admin: false },
  { to: '/imprimir', label: 'Imprimir', icon: Send, admin: false },
  { to: '/usuarios', label: 'Usuarios', icon: Users, admin: true },
  { to: '/perfil', label: 'Mi perfil', icon: UserCircle, admin: false },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.admin || user?.role === 'admin');

  return (
    <div className="flex min-h-screen">
      {/* Fondo oscuro al abrir el menú en móvil */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 transform bg-slate-900 text-slate-300 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Printer size={20} />
          </div>
          <div>
            <div className="font-bold text-white">TecnoPrint</div>
            <div className="text-[11px] text-slate-400">Central de impresión</div>
          </div>
        </div>
        <nav className="mt-2 space-y-1 px-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-4 left-0 w-full px-4">
          <div className="rounded-xl bg-slate-800 p-3">
            <div className="truncate text-sm font-medium text-white">{user?.displayName || user?.username}</div>
            <div className="text-xs text-slate-400">{user?.role === 'admin' ? 'Administrador' : 'Usuario'}</div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="mt-2 flex items-center gap-1.5 text-xs text-slate-300 hover:text-white"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
          <button onClick={() => setOpen(!open)} aria-label="Menú"><Menu size={22} /></button>
          <span className="font-bold">TecnoPrint</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-5 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
