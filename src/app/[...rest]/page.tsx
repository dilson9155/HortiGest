'use client';

// Catch-all route: tudo passa por aqui (exceto /api/* que vai pra API).
// Renderiza o HortiGestApp (com react-router-dom) client-only.

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/UI';
import { BrowserRouter } from 'react-router-dom';

const HortiGestApp = dynamic(
  () => import('@/components/HortiGestApp').then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Carregando HortiGest...
        </div>
      </div>
    ),
  },
);

export default function CatchAll() {
  return (
    <BrowserRouter>
      <HortiGestApp />
    </BrowserRouter>
  );
}
