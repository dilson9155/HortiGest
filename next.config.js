/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { webpackBuildWorker: false },
  // Pacotes que rodam em Node runtime (não em Edge)
  serverExternalPackages: ['pdfkit', '@prisma/client', 'argon2'],
  // Imagens
  images: { remotePatterns: [] },
  // Esta app inteira usa SPA (Client Side) - sem pre-render estatico
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
