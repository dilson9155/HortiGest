'use client';

import { ToastProvider } from '../hooks/useToast';
import { AuthProvider } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from '../components/UI';
import { useEffect } from 'react';
import Layout from '../layout/Layout';

/**
 * Provider raiz + proteção de rotas.
 *
 * Renderizado server-side como client component no App Router.
 * Quando user não autenticado e a rota não é /login, redireciona.
 * Quando user não tem permissão, mostra mensagem.
 */

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

  if (!user) return null;
  if (pathname === '/login') return <>{children}</>;
  return <Layout>{children}</Layout>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrandingProvider>
          <RequireAuth>{children}</RequireAuth>
        </BrandingProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
