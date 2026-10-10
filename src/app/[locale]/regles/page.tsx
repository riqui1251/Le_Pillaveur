import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ArrowLeft, ArrowRight, Bot, Gamepad2, Users } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { PlayingCard, suitIsRed } from '@/components/ui/PlayingCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { getGameById, type GameMeta } from '@/lib/games'
import { RULES_GAME_IDS, type RulesGameId } from '@/lib/rules/rules-content'
import { buildAlternates, pageOpenGraph, pageTwitter } from '@/lib/seo/alternates'
import { SITE_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

/**
 * Index des règles — /regles. Les dix-sept articles de docs/rules/<langue>/ n'avaient
 * aucune page mère : chacun n'était atteignable que depuis la landing ou
 * depuis un autre article. Ici, une carte par jeu (titre, accroche du
 * catalogue, effectif EN LIGNE lu dans src/lib/games.ts — jamais recopié —,
 * et « jouable avec des bots » quand c'est vrai), qui mène à /regles/<id>.
 *
 * Rendue UNE fois au build, par langue : les articles existent dans les
 * quatre langues (docs/rules/<langue>/), l'index aussi — canonical
 * auto-référent et hreflang, comme toute page publique.
 */

type RulesEntry = { id: RulesGameId; game: GameMeta }

/** Les jeux qui ont un article, dans l'ordre de RULES_GAME_IDS — un id sans jeu au registre est ignoré. */
function rulesEntries(): RulesEntry[] {
  return RULES_GAME_IDS.flatMap((id) => {
    const game = getGameById(id)
    return game ? [{ id, game }] : []
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'rules' })
  const title = t('meta.title')
  const description = t('meta.description')
  const alternates = buildAlternates('/regles', locale)
  return {
    // Le gabarit du layout ajoute « — Le Pillaveur » : le titre est court,
    // le suffixe tient dans les 60 caractères.
    title,
    description,
    alternates,
    openGraph: pageOpenGraph(locale, { title, description, url: alternates.canonical }),
    twitter: pageTwitter(locale, { title, description }),
  }
}

export default async function RulesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // AVANT toute sortie : les <Link> serveur ci-dessous lisent la langue posée
  // là, pas les en-têtes de la requête — condition du rendu au build.
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: 'rules' })
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  const entries = rulesEntries()
  const url = `${SITE_URL}/${locale}/regles`

  // Données structurées : la page de collection porte la liste ordonnée des
  // articles (chaque entrée pointe sur un article qui porte son propre
  // Article), plus le fil d'Ariane — les articles répètent le même chemin.
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('title'),
    description: t('meta.description'),
    url,
    inLanguage: locale,
    isPartOf: { '@type': 'WebSite', name: 'Le Pillaveur', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: entries.length,
      itemListElement: entries.map(({ id }, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: t(`articles.${id}.title`),
        url: `${url}/${id}`,
      })),
    },
  }
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumb.home'), item: `${SITE_URL}/${locale}` },
      { '@type': 'ListItem', position: 2, name: t('breadcrumb.rules'), item: url },
    ],
  }

  return (
    <main className="relative min-h-screen overflow-x-clip text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([collection, breadcrumbs]) }}
      />
      {/* Lueurs sur le feutre (le fond radial vient du layout .app-felt). */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="container relative mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('breadcrumb.home')}
        </Link>

        <header className="mt-4 max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">
            {t('kicker')}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
              {t('title')}
            </span>
          </h1>
          {/* L'intro éditoriale : ce que Google lit, et ce que le visiteur
              arrivé d'une recherche « règles … » attend avant la grille. */}
          <p className="mt-3 text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
            {t('intro')}
          </p>
          <p className="mt-3 text-xs text-white/45">{t('count', { count: entries.length })}</p>
        </header>

        <section aria-label={t('title')} className="mt-6">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map(({ id, game }) => {
              const red = game.suit ? suitIsRed(game.suit) : false
              const { minPlayers, maxPlayers } = game
              return (
                <li key={id}>
                  <Link
                    href={`/regles/${id}`}
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
                      <article className="flex h-full flex-col px-5 pb-4 pt-5">
                        <div className="flex items-center gap-3">
                          <span className={cn('shrink-0', red ? 'text-suit-red' : 'text-[#24201A]')}>
                            <GameIconById id={id} className="h-8 w-8" />
                          </span>
                          <h2 className="font-display text-lg font-bold leading-tight text-[#24201A]">
                            {tCatalog(`${id}.title`)}
                          </h2>
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm leading-snug text-[#4A443A]">
                          {tCatalog(`${id}.description`)}
                        </p>
                        {/* Effectif et bots : lus dans le registre, la seule
                            source que le lobby applique vraiment. */}
                        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                          {minPlayers !== undefined && maxPlayers !== undefined && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#24201A]/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4A443A]">
                              <Users className="h-3 w-3" aria-hidden />
                              {t('players', { min: minPlayers, max: maxPlayers })}
                            </span>
                          )}
                          {game.botsFillable && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                              <Bot className="h-3 w-3" aria-hidden />
                              {t('botsBadge')}
                            </span>
                          )}
                        </div>
                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#24201A] transition-colors group-hover:text-suit-red">
                          {t('readRules')}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </article>
                    </PlayingCard>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        {/* La suite naturelle des règles : le hub, où l'on lance la table. */}
        <div className="mt-10 text-center">
          <Link
            href="/jeux"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
          >
            <Gamepad2 className="h-4 w-4" aria-hidden />
            {t('allGames')}
          </Link>
        </div>
      </div>
    </main>
  )
}
