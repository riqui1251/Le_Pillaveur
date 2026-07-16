import type { MetadataRoute } from 'next'
import { GAMES } from '@/lib/games'
import { locales } from '@/i18n/routing'
import { RULES_GAME_IDS } from '@/lib/rules/rules-content'
import { SITE_URL } from '@/lib/site'

/**
 * /sitemap.xml — pages publiques × 4 langues, avec les alternates hreflang
 * portés par le sitemap (Google les accepte ici, pas besoin de <link> par
 * page). La « home » indexable est /jeux : la racine /{locale} redirige.
 */

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>

function entry(path: string, priority: number, changeFrequency: Freq): MetadataRoute.Sitemap[number] {
  const languages: Record<string, string> = {
    'x-default': `${SITE_URL}/fr${path}`,
  }
  for (const locale of locales) {
    languages[locale] = `${SITE_URL}/${locale}${path}`
  }
  return {
    url: `${SITE_URL}/fr${path}`,
    changeFrequency,
    priority,
    alternates: { languages },
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // Landing publique (les habitués sont redirigés vers /jeux, mais les
    // moteurs — sans cookies — voient toujours la vitrine).
    entry('', 1, 'weekly'),
    entry('/jeux', 1, 'weekly'),
    entry('/classement', 0.6, 'daily'),
    ...GAMES.filter((game) => !game.hidden).map((game) =>
      entry(`/games/${game.id}`, 0.7, 'monthly')
    ),
    // Pages règles : contenu français uniquement — pas d'alternates.
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
