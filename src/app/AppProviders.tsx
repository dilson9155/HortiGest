'use client';

import { useEffect, useState } from 'react';
import { ToastProvider } from '../hooks/useToast';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { usePathname, useRouter } from 'next/navigation';
import { Spinner } from '../components/UI';
import Layout from '../layout/Layout';

/**
 * Provider raiz + proteção de rotas.
 *
 * Importante: como as páginas usam contextos client-side (useAuth, useToast)
 * que dependem do localStorage, precisamos renderizar TUDO só no browser.
 *
 * No servidor (SSR), retornamos apenas o "Carregando...".
 * No client (após hydration), montamos o app de verdade.
 */

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Carregando...</div>
      </div>
    );
  }
  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.replace('/login');
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Carregando...
        </div>
      </div>
    );
  }

  if (pathname === '/login') return <>{children}</>;
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Redirecionando para o login...
        </div>
      </div>
    );
  }
  return <Layout>{children}</Layout>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly>
      <ToastProvider>
        <AuthProvider>
          <BrandingProvider>
            <RequireAuth>{children}</RequireAuth>
          </BrandingProvider>
        </AuthProvider>
      </ToastProvider>
    </ClientOnly>
  );
}
