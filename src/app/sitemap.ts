import type { MetadataRoute } from 'next'
import { COLLECTION_SLUGS } from '@/lib/collections'
import { GAMES } from '@/lib/games'
import { RULES_GAME_IDS } from '@/lib/rules/rules-content'
import { buildAlternates } from '@/lib/seo/alternates'
import { SITE_URL } from '@/lib/site'

/**
 * /sitemap.xml — pages publiques × 4 langues, avec les alternates hreflang
 * portés par le sitemap (Google les accepte ici, pas besoin de <link> par
 * page). La « home » indexable est /jeux : la racine /{locale} redirige.
 */

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>

/**
 * Collections du hub (/jeux/<slug>) : mêmes slugs dans les quatre langues,
 * lus dans src/lib/collections.ts — la liste même dont la page
 * src/app/[locale]/(collections)/jeux/[collection]/ tire ses
 * generateStaticParams. Une copie ici finirait par annoncer une URL en 404.
 */
const COLLECTION_PATHS = COLLECTION_SLUGS.map((slug) => `/jeux/${slug}`)

function entry(path: string, priority: number, changeFrequency: Freq): MetadataRoute.Sitemap[number] {
  // Même jeu d'hreflang que les pages (buildAlternates), rendu absolu : le
  // sitemap ne passe pas par metadataBase.
  const { languages } = buildAlternates(path, 'fr')
  return {
    url: `${SITE_URL}/fr${path}`,
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries(
        Object.entries(languages).map(([lang, href]) => [lang, `${SITE_URL}${href}`])
      ),
    },
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // Landing publique (les habitués sont redirigés vers /jeux, mais les
    // moteurs — sans cookies — voient toujours la vitrine).
    entry('', 1, 'weekly'),
    entry('/jeux', 1, 'weekly'),
    ...COLLECTION_PATHS.map((path) => entry(path, 0.6, 'weekly')),
    entry('/classement', 0.6, 'daily'),
    // Page de téléchargement de l'app mobile (liens stores à venir).
    entry('/application', 0.5, 'monthly'),
    ...GAMES.filter((game) => !game.hidden).map((game) =>
      entry(`/games/${game.id}`, 0.7, 'monthly')
    ),
    // Index des règles puis un article par jeu : contenu français uniquement
    // (docs/rules/fr/), canonical /fr — pas d'alternates.
    {
      url: `${SITE_URL}/fr/regles`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    ...RULES_GAME_IDS.map((id) => ({
      url: `${SITE_URL}/fr/regles/${id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    entry('/legal/cgu', 0.2, 'yearly'),
    entry('/legal/confidentialite', 0.2, 'yearly'),
    entry('/legal/mentions-legales', 0.2, 'yearly'),
  ]
}
