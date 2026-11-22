import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from './AppProviders';

export const metadata: Metadata = {
  title: 'HortiGest — Controle e Produção de Hortifrúti',
  description: 'Sistema de controle de recebimento e produção de frutas, legumes e verduras.',
  applicationName: 'HortiGest',
  appleWebApp: {
    capable: true,
    title: 'HortiGest',
    statusBarStyle: 'default',
  },
  manifest: '/manifest.webmanifest',
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'format-detection': 'telephone=no',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/logo.png', sizes: 'any' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-50">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
