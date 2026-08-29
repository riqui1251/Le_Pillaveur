import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { GAMES } from '@/lib/games'
import { locales } from '@/i18n/routing'
import { SITE_URL } from '@/lib/site'

/**
 * SEO des pages /games/<id> — les pages de jeu sont des client components
 * (aucun generateMetadata possible) : chaque dossier de jeu porte un
 * layout.tsx SERVEUR minimal qui délègue tout ici.
 *
 * - titres/descriptions dédiés par jeu et par langue (games.meta.<id>),
 *   écrits pour donner envie de CLIQUER puis de JOUER (gratuit, bots,
 *   chat vocal) — les pages partageaient l'extrait générique de la home ;
 * - canonical auto-référent + hreflang alignés sur le sitemap ;
 * - jeux masqués (hidden) : noindex, pas de texte requis ;
 * - JSON-LD VideoGame + BreadcrumbList (bornes de joueurs depuis games.ts,
 *   la source de vérité testée — celles de RULES_META ont dérivé).
 */

export async function buildGameMetadata(locale: string, gameId: string): Promise<Metadata> {
  const game = GAMES.find((g) => g.id === gameId)
  if (!game) return {}
  if (game.hidden) {
    // Jeu masqué du hub : la page reste techniquement accessible mais ne
    // doit pas occuper l'index avec la meta générique du site.
    return { robots: { index: false, follow: false } }
  }
  const t = await getTranslations({ locale, namespace: 'games.meta' })
  const title = t(`${gameId}.title`)
  const description = t(`${gameId}.description`)
  const path = `/games/${gameId}`
  const languages: Record<string, string> = { 'x-default': `/fr${path}` }
  for (const l of locales) {
    languages[l] = `/${l}${path}`
  }
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/${locale}${path}`, languages },
    openGraph: { title, description, url: `/${locale}${path}` },
  }
}

/** Enveloppe serveur : JSON-LD VideoGame + fil d'Ariane, puis la page. */
export async function GameSeo({
  locale,
  gameId,
  children,
}: {
  locale: string
  gameId: string
  children: React.ReactNode
}) {
  const game = GAMES.find((g) => g.id === gameId)
  if (!game || game.hidden) return <>{children}</>

  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  const tMeta = await getTranslations({ locale, namespace: 'games.meta' })
  const tNav = await getTranslations({ locale, namespace: 'nav.links' })
  const url = `${SITE_URL}/${locale}/games/${gameId}`

  const videoGame = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: tCatalog(`${gameId}.title`),
    description: tMeta(`${gameId}.description`),
    url,
    inLanguage: locale,
    isAccessibleForFree: true,
    gamePlatform: 'Web browser',
    ...(game.minPlayers && game.maxPlayers
      ? {
          numberOfPlayers: {
            '@type': 'QuantitativeValue',
            minValue: game.minPlayers,
            maxValue: game.maxPlayers,
          },
        }
      : {}),
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Le Pillaveur', item: `${SITE_URL}/${locale}` },
      { '@type': 'ListItem', position: 2, name: tNav('jeux.label'), item: `${SITE_URL}/${locale}/jeux` },
      { '@type': 'ListItem', position: 3, name: tCatalog(`${gameId}.title`), item: url },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([videoGame, breadcrumbs]) }}
      />
      {children}
    </>
  )
}
