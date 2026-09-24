import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * /robots.txt — on interdit seulement les espaces sans valeur d'index :
 * l'API, les écrans TV par code (espace d'URL infini, piège à crawl), la
 * supervision et la page de test couleurs. Les pages personnelles (compte,
 * joueurs, stats, succès) restent crawlables mais portent un meta noindex
 * (voir les layout.tsx de ces segments) — c'est la combinaison recommandée :
 * un Disallow empêcherait Google de lire le noindex.
 *
 * Exception dans l'API : /api/og, les cartes de partage. Twitter/X et Google
 * lisent robots.txt avant d'aller chercher l'image d'un lien — bloquée, la
 * carte restait vide. Chez Google comme chez Bing, c'est la règle la plus
 * LONGUE qui l'emporte : `Allow: /api/og` (7 caractères) bat `Disallow:
 * /api/` (5), quel que soit leur ordre ; Next émet de toute façon les Allow
 * en premier.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/og'],
        disallow: ['/api/', '/*/tv/', '/*/supervision', '/*/test-colors'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
