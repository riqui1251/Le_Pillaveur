const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Politique de sécurité du contenu : restreint les sources autorisées tout en
// restant compatible avec le runtime Next.js, Tailwind (styles inline),
// canvas/confetti (blob/data) et le HMR en développement (ws/wss).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  reactStrictMode: true,
  eslint: {
    // Activer la vérification ESLint pendant le build
    ignoreDuringBuilds: false,
  },
  // Activer la vérification des types pour le build
  typescript: {
    ignoreBuildErrors: false,
  },
  // next/image n'est pas utilisé dans l'application : on désactive l'Image
  // Optimizer pour supprimer l'endpoint /_next/image (réduction de la surface
  // d'attaque : DoS via remotePatterns, content injection, cache poisoning).
  images: {
    unoptimized: true,
  },
  // Compression pour améliorer les performances
  compress: true,
  serverExternalPackages: ['geoip-lite'],
  // Optimiser pour les appareils mobiles
  experimental: {
    // Désactivation de l'optimisation CSS qui requiert le module 'critters'
    // optimizeCss: true, 
    scrollRestoration: true,
  }
};

module.exports = nextConfig; 