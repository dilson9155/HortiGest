/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacotes que rodam em Node runtime (não em Edge)
  serverExternalPackages: ['pdfkit', '@prisma/client', 'argon2'],
  // Imagens
  images: { remotePatterns: [] },
  // Esta app inteira usa SPA (Client Side) - sem pre-render estatico
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
