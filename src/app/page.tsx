'use client';

// Página inicial: carrega HortiGestApp via dynamic(ssr:false).
// dynamic garante que o módulo nem seja importado no server — não executa nada.

import dynamic from 'next/dynamic';

const HortiGestClient = dynamic(
  async () => {
    const { default: App } = await import('@/components/HortiGestApp');
    const { BrowserRouter } = await import('react-router-dom');
    const Wrapper = (props: object) => (
      <BrowserRouter>
        <App {...props} />
      </BrowserRouter>
    );
    Wrapper.displayName = 'HortiGestClient';
    return Wrapper;
  },
  { ssr: false },
);

export default function HomePage() {
  return <HortiGestClient />;
}
