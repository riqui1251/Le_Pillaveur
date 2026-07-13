import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * /robots.txt — on interdit seulement les espaces sans valeur d'index :
 * l'API, les écrans TV par code (espace d'URL infini, piège à crawl), la
 * supervision et la page de test couleurs. Les pages personnelles (compte,
 * joueurs, stats, succès) restent crawlables mais portent un meta noindex
 * (voir les layout.tsx de ces segments) — c'est la combinaison recommandée :
 * un Disallow empêcherait Google de lire le noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/*/tv/', '/*/supervision', '/*/test-colors'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
