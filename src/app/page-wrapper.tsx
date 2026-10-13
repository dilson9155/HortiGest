'use client';

// Wrapper que renderiza o conteúdo só no cliente (browser).
// Necessário porque as páginas usam contextos (useAuth, useToast) que dependem do browser.
// Sem isto, o Next tenta pré-renderizar no servidor e renderiza nada.

import { useEffect, useState } from 'react';

export default function ClientOnly({ children }: { children: React.ReactNode }) {
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
