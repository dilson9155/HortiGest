'use client';

// App principal do HortiGest — usa react-router-dom.
// Renderizado client-only via dynamic ssr:false na página de rota catch-all.

import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProviders } from '@/app/layout-root';
import LoginPage from '@/views/LoginPage';
import LaunchesPage from '@/views/LaunchesPage';
import CadastrosPage from '@/views/CadastrosPage';
import ReportsPage from '@/views/ReportsPage';
import UsersPage from '@/views/UsersPage';
import SettingsPage from '@/views/SettingsPage';
import AuditPage from '@/views/AuditPage';
// DashboardPage usa recharts (quebraria em SSR). Carrega dinamicamente.
import dynamic from 'next/dynamic';
const DashboardPage = dynamic(() => import('@/views/DashboardPage').then((m) => m.default), {
  ssr: false,
  loading: () => <div className="p-10 text-center text-slate-500">Carregando dashboard...</div>,
});
import Layout from '@/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/UI';
import type { ReactNode } from 'react';

function ProtectedRoute({
  children,
  requireModule,
  action = 'view',
}: {
  children: ReactNode;
  requireModule?: string;
  action?: 'view' | 'create' | 'edit' | 'delete' | 'export';
}) {
  const { user, loading, can, canAny } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Carregando...
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (requireModule && !canAny(requireModule, [action]) && !can(requireModule, action)) {
    return (
      <Layout>
        <div className="card p-10 text-center">
          <h2 className="text-lg font-bold">Acesso negado</h2>
          <p className="text-slate-500 text-sm">Você não tem permissão para esta área.</p>
        </div>
      </Layout>
    );
  }
  return <Layout>{children}</Layout>;
}

export default function HortiGestApp() {
  // Render client-only: na fase de build/prerender não executa as páginas que usam useAuth.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <AppProviders>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute requireModule="dashboard"><DashboardPage /></ProtectedRoute>} />
        <Route path="/lancamentos" element={<ProtectedRoute requireModule="launches"><LaunchesPage /></ProtectedRoute>} />
        <Route path="/produtos" element={<ProtectedRoute requireModule="products"><CadastrosPage kind="products" /></ProtectedRoute>} />
        <Route path="/fornecedores" element={<ProtectedRoute requireModule="suppliers"><CadastrosPage kind="suppliers" /></ProtectedRoute>} />
        <Route path="/relatorios" element={<ProtectedRoute requireModule="reports"><ReportsPage /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute requireModule="users" action="view"><UsersPage /></ProtectedRoute>} />
        <Route path="/configuracoes" element={<ProtectedRoute requireModule="settings"><SettingsPage /></ProtectedRoute>} />
        <Route path="/auditoria" element={<ProtectedRoute requireModule="audit"><AuditPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProviders>
  );
}
