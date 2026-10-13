import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  LayoutDashboard,
  ClipboardList,
  Boxes,
  Truck,
  FileText,
  Users,
  Settings,
  History,
  LogOut,
  Menu,
  X,
  KeyRound,
  Leaf,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBrandingSafe } from '@/contexts/BrandingContext';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  module?: string;
  action?: 'view' | 'create' | 'edit' | 'delete' | 'export';
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, canAny } = useAuth();
  const branding = useBrandingSafe();
  const logoSrc = branding.logo ?? '/logo.png';
  const companyAlt = branding.companyName || 'HortiGest';
  const { toast } = useToast();
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!user) return <>{children}</>;

  const items: Item[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard', action: 'view' },
    { to: '/lancamentos', label: 'Lançamentos', icon: ClipboardList, module: 'launches', action: 'view' },
    { to: '/produtos', label: 'Produtos', icon: Boxes, module: 'products', action: 'view' },
    { to: '/fornecedores', label: 'Fornecedores', icon: Truck, module: 'suppliers', action: 'view' },
    { to: '/relatorios', label: 'Relatórios', icon: FileText, module: 'reports', action: 'view' },
    { to: '/usuarios', label: 'Usuários', icon: Users, module: 'users', action: 'view' },
    { to: '/configuracoes', label: 'Configurações', icon: Settings, module: 'settings', action: 'view' },
    { to: '/auditoria', label: 'Auditoria', icon: History, module: 'audit', action: 'view' },
  ];

  const filtered = items.filter((i) => canAny(i.module!, ['view']));

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    logout();
    toast('info', 'Sessão encerrada.');
    nav('/login', { replace: true });
  }

  async function openChangePassword() {
    const npw = prompt('Nova senha (mínimo 8 caracteres):');
    if (!npw || npw.length < 8) {
      toast('warning', 'Senha inválida.');
      return;
    }
    const cpw = prompt('Confirme a nova senha:');
    if (cpw !== npw) {
      toast('warning', 'Confirmação não confere.');
      return;
    }
    const cur = prompt('Para confirmar, informe sua senha atual:');
    if (!cur) return;
    const r = await api.post('/auth/password', {
      currentPassword: cur,
      newPassword: npw,
      confirmPassword: cpw,
    });
    if (r.ok) toast('success', 'Senha alterada.');
    else toast('error', r.error?.message || 'Falha ao alterar senha.');
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-white border-r border-slate-200 shadow-sm">
        <SidebarContent
          items={filtered}
          onLogout={handleLogout}
          onPwd={openChangePassword}
          user={user}
          logoSrc={logoSrc}
          companyAlt={companyAlt}
        />
      </aside>

      {/* Sidebar Mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col safe-top safe-bottom">
            <SidebarContent
              items={filtered}
              onLogout={handleLogout}
              onPwd={openChangePassword}
              onClose={() => setOpen(false)}
              user={user}
              logoSrc={logoSrc}
              companyAlt={companyAlt}
            />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm safe-top">
          <div className="flex items-center justify-between px-3 sm:px-6 py-3.5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(true)}
                className="lg:hidden p-2 -ml-1 text-slate-700 hover:bg-slate-100 rounded-md transition"
                aria-label="Abrir menu"
              >
                <Menu size={22} />
              </button>
              <div className="lg:hidden flex items-center gap-2 font-bold text-brand-700 text-base">
                <img src={logoSrc} alt={companyAlt} className="h-8 w-auto max-w-full" style={{ objectFit: 'contain' }} />
              </div>
              <div className="hidden lg:block">
                <h1 className="text-sm font-semibold text-slate-700">
                  Controle de Recebimento e Produção
                </h1>
                <p className="text-xs text-slate-500">Sistema HortiGest</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Conectado</span>
                <span className="text-sm font-semibold text-slate-800">{user.name.split(' ')[0]}</span>
              </div>
              <button
                onClick={openChangePassword}
                className="p-2 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-md transition"
                title="Alterar senha"
              >
                <KeyRound size={18} />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                title="Sair"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}

function SidebarContent({
  items,
  user,
  onLogout,
  onPwd,
  onClose,
  logoSrc,
  companyAlt,
}: {
  items: Item[];
  user: { name: string; username: string; role?: { name: string } | null };
  onLogout: () => void;
  onPwd: () => void;
  onClose?: () => void;
  logoSrc: string;
  companyAlt: string;
}) {
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-slate-100">
        <img src={logoSrc} alt={companyAlt} className="h-14 w-auto max-w-full" style={{ objectFit: 'contain' }} />
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-md transition"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Perfil + ações */}
      <div className="border-t border-slate-100 p-4 space-y-3">
        <div className="rounded-xl bg-gradient-to-br from-slate-50 to-brand-50 p-3 border border-brand-100">
          <div className="font-bold text-slate-800 text-sm truncate">{user.name}</div>
          <div className="text-xs text-slate-500 truncate">@{user.username}</div>
          {user.role && (
            <div className="mt-1.5 inline-flex items-center gap-1 bg-brand-100 text-brand-800 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              <Leaf size={10} />
              {user.role.name}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onPwd}
            className="h-10 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition flex items-center justify-center gap-1.5"
          >
            <KeyRound size={14} /> Senha
          </button>
          <button
            onClick={onLogout}
            className="h-10 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition flex items-center justify-center gap-1.5"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>
    </>
  );
}
