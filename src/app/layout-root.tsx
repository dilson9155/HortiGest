'use client';

// Provider raiz: Auth + Branding + Toast.
// Envolvido no layout para que toda a aplicacao compartilhe o estado.

import { AuthProvider } from '@/contexts/AuthContext';
import { BrandingProvider } from '@/contexts/BrandingContext';
import { ToastProvider } from '@/hooks/useToast';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrandingProvider>{children}</BrandingProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
