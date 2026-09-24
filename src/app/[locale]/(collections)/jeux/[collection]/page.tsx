import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { PlayingCard, suitIsRed } from '@/components/ui/PlayingCard'
import { GameIconById } from '@/components/hub/GameIconById'
import {
  COLLECTION_SLUGS,
  gamesInCollection,
  isCollectionSlug,
  type CollectionSlug,
} from '@/lib/collections'
import type { GameMeta } from '@/lib/games'
import { buildAlternates, pageOpenGraph, pageTwitter } from '@/lib/seo/alternates'
import { SITE_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

/**
 * Pages « collections » — /jeux/a-2-joueurs, /jeux/sans-alcool,
 * /jeux/seul-avec-des-bots, /jeux/en-grand-groupe. Une porte d'entrée SEO
 * par intention de recherche (« jeu à boire à 2 », « jeu de soirée sans
 * alcool »…), là où le hub ne répond qu'à « jeux de soirée ».
 *
 * Rendues UNE fois au build, par collection et par langue (les slugs sont
 * les mêmes dans les quatre langues, voir src/lib/collections.ts). Tout part
 * dans le HTML : titre, intro éditoriale, grille de cartes — sans le contexte
 * client du hub (joueurs sélectionnés, mode de jeu), qui n'a rien à faire
 * ici : ces pages présentent, elles ne lancent pas.
 *
 * Pourquoi le groupe de routes `(collections)` : l'URL reste /jeux/<slug>,
 * mais le fichier ne vit PAS sous src/app/[locale]/jeux/, dont le layout
 * rend le <h1> et l'accroche du hub (« Jeux de soirée gratuits… ») au-dessus
 * de TOUT ce qu'il enveloppe. Sous lui, chaque collection aurait eu deux
 * titres de niveau 1 et l'intro du hub avant la sienne. Le groupe sort ces
 * pages de ce layout sans le toucher — c'est l'usage prévu par Next.
 */

/** Au-delà de ce plafond, on affiche « dès N joueurs » — même seuil que la tuile du hub. */
const OPEN_MAX_PLAYERS = 20

export function generateStaticParams() {
  return COLLECTION_SLUGS.map((collection) => ({ collection }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>
}): Promise<Metadata> {
  const { locale, collection } = await params
  if (!isCollectionSlug(collection)) return {}
  const t = await getTranslations({ locale, namespace: `collections.${collection}` })
  const title = t('title')
  const description = t('description')
  const path = `/jeux/${collection}`
  return {
    // Le gabarit du layout de langue ajoute « — Le Pillaveur » : les titres
    // de collection sont courts, le suffixe tient dans les 60 caractères.
    title,
    description,
    alternates: buildAlternates(path, locale),
    openGraph: pageOpenGraph(locale, { title, description, url: `/${locale}${path}` }),
    twitter: pageTwitter(locale, { title, description }),
  }
}

/**
 * Effectif d'un jeu, en une ligne : la borne EN LIGNE quand le jeu s'y joue
 * (la plus parlante), sinon la borne locale de sa page. Jamais de plafond
 * inventé : « dès N » quand le moteur n'en a pas.
 */
function playersLine(
  game: GameMeta,
  t: Awaited<ReturnType<typeof getTranslations<'collections'>>>
): string | null {
  if (game.onlineReady && game.minPlayers) {
    if (game.maxPlayers && game.maxPlayers < OPEN_MAX_PLAYERS) {
      return t('playersOnline', { min: game.minPlayers, max: game.maxPlayers })
    }
    return t('playersOnlineOpen', { min: game.minPlayers })
  }
  if (game.localMinPlayers) return t('playersLocal', { min: game.localMinPlayers })
  return null
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>
}) {
  const { locale, collection } = await params
  // AVANT toute sortie : les <Link> serveur et la 404 localisée lisent la
  // langue posée là, pas les en-têtes — condition du rendu au build.
  setRequestLocale(locale)
  if (!isCollectionSlug(collection)) notFound()

  // Textes de la page (namespace `collections`, lu ici seulement : hors du
  // socle client, voir SERVER_ONLY dans src/i18n/messages-slices.ts) ; les
  // puces vers les autres collections, elles, sont celles du hub.
  const t = await getTranslations({ locale, namespace: 'collections' })
  const tChips = await getTranslations({ locale, namespace: 'hub.collections' })
  const tHub = await getTranslations({ locale, namespace: 'hub.jeux' })
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  const tCatalogTags = await getTranslations({ locale, namespace: 'landing.catalog' })
  const tCommon = await getTranslations({ locale, namespace: 'common' })
  const tNav = await getTranslations({ locale, namespace: 'nav.links' })

  const games = gamesInCollection(collection)
  const url = `${SITE_URL}/${locale}/jeux/${collection}`
  const others = COLLECTION_SLUGS.filter((slug) => slug !== collection)

  // Données structurées : une page de collection (CollectionPage — c'est elle
  // qui porte la langue, `inLanguage` n'existe pas sur un ItemList) dont
  // l'entité principale est la liste ordonnée des jeux (chaque entrée pointe
  // sur la page du jeu, qui porte son propre VideoGame), + le fil d'Ariane,
  // comme sur les pages de jeu. Même forme que l'index /regles.
  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t(`${collection}.title`),
    description: t(`${collection}.description`),
    url,
    inLanguage: locale,
    isPartOf: { '@type': 'WebSite', name: 'Le Pillaveur', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: games.length,
      itemListElement: games.map((game, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: tCatalog(`${game.id}.title`),
        url: `${SITE_URL}/${locale}${game.path}`,
      })),
    },
  }
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Le Pillaveur', item: `${SITE_URL}/${locale}` },
      { '@type': 'ListItem', position: 2, name: tNav('jeux.label'), item: `${SITE_URL}/${locale}/jeux` },
      { '@type': 'ListItem', position: 3, name: t(`${collection}.title`), item: url },
    ],
  }

  return (
    <main className="relative min-h-screen overflow-x-clip text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([collectionPage, breadcrumbs]) }}
      />
      {/* Lueurs sur le feutre (le fond radial vient du layout .app-felt). */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="container relative mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
        <Link
          href="/jeux"
          className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {tHub('soloBanner.showAll')}
        </Link>

        <header className="mt-4 max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">
            {t('kicker')}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
              {t(`${collection}.title`)}
            </span>
          </h1>
          {/* L'intro éditoriale : ce que Google lit, et ce que le joueur qui
              arrive d'une recherche attend avant la grille. */}
          <p className="mt-3 text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
            {t(`${collection}.intro`)}
          </p>
          <p className="mt-3 text-xs text-white/45">{tCommon('gameCount', { count: games.length })}</p>
        </header>

        <section aria-label={t(`${collection}.title`)} className="mt-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((game) => {
              const red = game.suit ? suitIsRed(game.suit) : false
              const players = playersLine(game, t)
              return (
                <Link
                  key={game.id}
                  href={game.path}
                  prefetch={false}
                  className="group block h-full touch-manipulation"
                >
                  <PlayingCard
                    suit={game.suit}
                    rank={game.rank}
                    className={cn(
                      'h-full transition-all duration-200',
                      'group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)]',
                      'group-active:scale-[0.98]'
                    )}
                  >
                    <article className="flex h-full flex-col items-center px-3 pb-3 pt-5 text-center">
                      <div className={cn(red ? 'text-suit-red' : 'text-[#24201A]')}>
                        <GameIconById id={game.id} className="h-8 w-8" />
                      </div>
                      <h2 className="mt-1.5 line-clamp-2 font-display text-sm font-bold leading-tight text-[#24201A]">
                        {tCatalog(`${game.id}.title`)}
                      </h2>
                      {players && <p className="mt-0.5 text-[10px] font-bold text-[#6B6455]">{players}</p>}
                      <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-[#4A443A]">
                        {tCatalog(`${game.id}.description`)}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center justify-center gap-1 pt-2">
                        {game.onlineReady && (
                          <span className="rounded-full bg-emerald-700/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">
                            {tCatalogTags('online')}
                          </span>
                        )}
                        {!game.onlineOnly && (
                          <span className="rounded-full bg-[#24201A]/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4A443A]">
                            {tCatalogTags('local')}
                          </span>
                        )}
                      </div>
                    </article>
                  </PlayingCard>
                </Link>
              )
            })}
          </div>
        </section>

        {/* Les autres collections : le maillage entre les quatre pages. */}
        <nav aria-label={tChips('chipsLabel')} className="mt-8 border-t border-white/10 pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">{tChips('chipsLabel')}</p>
          <ul className="flex flex-wrap gap-2">
            {others.map((slug: CollectionSlug) => (
              <li key={slug}>
                <Link
                  href={`/jeux/${slug}`}
                  prefetch={false}
                  className="inline-flex rounded-full border border-gold/25 px-3 py-1.5 text-xs font-semibold text-cream/75 transition-colors hover:border-gold/50 hover:text-cream"
                >
                  {tChips(`${slug}.chip`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  )
}
