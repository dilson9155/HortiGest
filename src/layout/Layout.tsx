'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  Boxes,
  Truck,
  FileText,
  Users,
  Settings,
  History,
  ClipboardCheck,
  LogOut,
  Menu,
  X,
  KeyRound,
  Leaf,
  Warehouse,
  UserCheck,
  ShoppingCart,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBrandingSafe } from '../contexts/BrandingContext';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  module?: string;
  action?: 'view' | 'create' | 'edit' | 'delete' | 'export';
};

const COLLAPSE_KEY = 'hf_sidebar_collapsed';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, canAny } = useAuth();
  const branding = useBrandingSafe();
  const logoSrc = branding.logo ?? '/logo.png';
  const companyAlt = branding.companyName || 'HortiGest';
  const { toast } = useToast();
  const _router = useRouter();
  const nav = (path: string) => _router.push(path);
  const location = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  useEffect(() => {
    setOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Ao escolher qualquer módulo, o menu volta a ficar recolhido.
    setCollapsed(true);
    window.localStorage.setItem(COLLAPSE_KEY, '1');
  }, [location]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  if (!user) return <>{children}</>;

  const items: Item[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard', action: 'view' },
    { to: '/lancamentos-compradores', label: 'Lançamento compradores', icon: ClipboardList, module: 'launches_buyers', action: 'view' },
    { to: '/historico-lancamentos-compradores', label: 'Histórico de lançamento compradores', icon: History, module: 'launches_buyers', action: 'view' },
    { to: '/lancamentos-conferentes', label: 'Lançamento conferentes', icon: ListChecks, module: 'launches_reviewers', action: 'view' },
    { to: '/historico-lancamentos-conferentes', label: 'Histórico lançamento conferentes', icon: ClipboardCheck, module: 'launches_reviewers', action: 'view' },
    { to: '/recebidos', label: 'Histórico de entradas', icon: CheckCircle2, module: 'launches', action: 'view' },
    { to: '/produtos', label: 'Produtos', icon: Boxes, module: 'products', action: 'view' },
    { to: '/fornecedores', label: 'Fornecedores', icon: Truck, module: 'suppliers', action: 'view' },
    { to: '/docas', label: 'Docas', icon: Warehouse, module: 'products', action: 'view' },
    { to: '/conferentes', label: 'Conferentes', icon: UserCheck, module: 'products', action: 'view' },
    { to: '/compradores', label: 'Compradores', icon: ShoppingCart, module: 'products', action: 'view' },
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
    nav('/login');
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
      <aside
        className={clsx(
          'hidden lg:flex flex-col bg-white border-r border-slate-200 shadow-sm transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <SidebarContent
          items={filtered}
          pathname={location}
          onLogout={handleLogout}
          onPwd={openChangePassword}
          user={user}
          logoSrc={logoSrc}
          companyAlt={companyAlt}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
        />
      </aside>

      {/* Sidebar Mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col safe-top safe-bottom">
            <SidebarContent
              items={filtered}
              pathname={location}
              onLogout={handleLogout}
              onPwd={openChangePassword}
              onClose={() => setOpen(false)}
              user={user}
              logoSrc={logoSrc}
              companyAlt={companyAlt}
              collapsed={false}
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

        <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full mx-auto max-w-none">
          {children}
        </div>
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
  onToggle,
  pathname,
  logoSrc,
  companyAlt,
  collapsed = false,
}: {
  items: Item[];
  user: { name: string; username: string; role?: { name: string } | null };
  onLogout: () => void;
  onPwd: () => void;
  onClose?: () => void;
  onToggle?: () => void;
  pathname: string | null;
  logoSrc: string;
  companyAlt: string;
  collapsed?: boolean;
}) {
  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <>
      {/* Logo + controle de recolhimento */}
      <div
        className={clsx(
          'flex items-center border-b border-slate-100',
          collapsed ? 'flex-col gap-3 px-2 py-4' : 'justify-between px-5 py-5',
        )}
      >
        <img
          src={logoSrc}
          alt={companyAlt}
          className={collapsed ? 'h-11 w-11 object-contain' : 'h-14 w-auto max-w-full'}
          style={{ objectFit: 'contain' }}
        />
        <div className={clsx('flex items-center gap-1', collapsed && 'flex-col')}>
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-2 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition"
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            </button>
          )}
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
      </div>

      {/* Navegação */}
      <nav className={clsx('flex-1 py-4', collapsed ? 'px-2 overflow-visible' : 'px-3 overflow-y-auto')}>
        <ul className="space-y-1">
          {items.map((item) => {
            const loc = pathname ? String(pathname) : '';
            const isActive = item.to === '/'
              ? loc === item.to
              : loc === item.to || loc.startsWith(item.to + '/');
            return (
              <li key={item.to} className="group/item relative">
                <Link
                  href={item.to}
                  className={clsx(
                    'flex items-center rounded-lg text-sm font-medium transition',
                    collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5',
                    isActive
                      ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
                {collapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/item:opacity-100">
                    {item.label}
                    <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-slate-900" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Perfil + ações */}
      <div className={clsx('border-t border-slate-100', collapsed ? 'p-3' : 'p-4 space-y-3')}>
        {collapsed ? (
          <div className="group/profile relative flex justify-center" title={user.name}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {initials || <Leaf size={16} />}
            </div>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover/profile:opacity-100">
              {user.name}
            </span>
          </div>
        ) : (
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
        )}
        <div className={clsx('grid gap-2', collapsed ? 'grid-cols-1' : 'grid-cols-2')}>
          <button
            onClick={onPwd}
            className={clsx(
              'h-10 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition flex items-center justify-center gap-1.5',
              collapsed && 'px-0',
            )}
            title="Alterar senha"
          >
            <KeyRound size={14} /> {!collapsed && 'Senha'}
          </button>
          <button
            onClick={onLogout}
            className="h-10 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition flex items-center justify-center gap-1.5"
            title="Sair"
          >
            <LogOut size={14} /> {!collapsed && 'Sair'}
          </button>
        </div>
      </div>
    </>
  );
}
