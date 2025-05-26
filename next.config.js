/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Activer la vérification ESLint pendant le build
    ignoreDuringBuilds: false,
  },
  // Définir le dossier de sortie du build
  distDir: 'html',
  // Activer la vérification des types pour le build
  typescript: {
    ignoreBuildErrors: false,
  },
  // Améliorer la compatibilité des images sur mobile
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Compression pour améliorer les performances
  compress: true,
  // Optimiser pour les appareils mobiles
  experimental: {
    // Désactivation de l'optimisation CSS qui requiert le module 'critters'
    // optimizeCss: true, 
    scrollRestoration: true,
  }
};

module.exports = nextConfig; 