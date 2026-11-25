"use client"

import { useMemo, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Bot, Flame, Globe, Search, Smartphone, Sparkles } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useLocalizedGames, type LocalizedGameMeta } from '@/lib/games-i18n'
import { hasContentIn, splitBySoloFit } from '@/lib/games'
import { categoryName, isGameListed } from '@/lib/game-catalog'
import { GameCard } from '@/components/hub/GameCard'
import { categoriesToOffer, filterByCategory, resolveActiveCategory } from '@/components/hub/category-filter'
import { buildFeaturedRow, buildPopularRow } from '@/components/hub/popular-row'
import { GameIconById } from '@/components/hub/GameIconById'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useFeaturedGameIds, useGameCatalog, useGameCategories } from '@/hooks/useGameCatalog'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'

/**
 * Familles d'enseignes du hub « Vitrine » : ♠ rôles cachés, ♥ culture,
 * ♦ hasard & dés, ♣ créa. Tout tient sur un écran : les sections rendent
 * les chips de filtre inutiles — la recherche suffit pour la saisie directe.
 */
const FAMILIES = [
  { suit: 'spade', glyph: '♠' },
  { suit: 'heart', glyph: '♥' },
  { suit: 'diamond', glyph: '♦' },
  { suit: 'club', glyph: '♣' },
] as const

/** Intertitre de famille (en ligne, solo) : petites capitales or, filet. */
function FamilyTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-1.5 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
      <span className="flex shrink-0 items-center gap-1.5">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-gold/20" />
    </h2>
  )
}

/**
 * Intertitre du catalogue LOCAL : il dit où le jeu se joue (« Sur ce
 * téléphone » / « Un téléphone chacun »), pas sa famille. Avant, les jeux
 * jouables ici s'annonçaient « ♦ Hasard & dés », un nom qui ne disait rien
 * de « jouable ce soir sur cet appareil ».
 */
function ModeTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-cream">
      <span className="flex shrink-0 items-center gap-1.5">
        <span aria-hidden className="text-gold">{icon}</span>
        {children}
      </span>
      <span aria-hidden className="h-px flex-1 bg-gold/20" />
    </h2>
  )
}

/**
 * `soloHints` : mode « seul avec les bots » — les jeux faits pour les potes
 * (soloFit 'group') portent le badge discret « Mieux à plusieurs ». Hors de
 * ce mode, rien : à plusieurs, l'avertissement n'a pas lieu d'être.
 */
function GamesCardGrid({
  games,
  soloHints = false,
  isDisabled,
  disabledLabel,
  disabledHint,
  tourAnchor,
}: {
  games: LocalizedGameMeta[]
  soloHints?: boolean
  /** Cartes à éteindre (jeu injouable maintenant), et pourquoi. */
  isDisabled?: (game: LocalizedGameMeta) => boolean
  disabledLabel?: string
  disabledHint?: string
  /** Repère du tuto des nouveaux joueurs (`data-tour`) : la grille qu'il invite à toucher. */
  tourAnchor?: string
}) {
  return (
    <div data-tour={tourAnchor} className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          icon={<GameIconById id={game.id} surface="card" className="h-9 w-9" />}
          groupHint={soloHints && game.soloFit === 'group'}
          disabled={isDisabled?.(game) ?? false}
          disabledLabel={disabledLabel}
          disabledHint={disabledHint}
        />
      ))}
    </div>
  )
}

export function GamesGrid({ solo = false }: { solo?: boolean }) {
  const t = useTranslations('hub.jeux')
  const tCommon = useTranslations('common')
  const tOffline = useTranslations('offline')
  const locale = useLocale()
  const games = useLocalizedGames()
  const { user } = useAuth()
  const { hiddenIds, popular } = useGameCatalog()
  const categories = useGameCategories()
  const featuredIds = useFeaturedGameIds()
  const isOnline = user?.playMode === 'online'
  // Navigateur hors ligne : une table en ligne ne peut pas s'ouvrir — les
  // jeux « en ligne uniquement » s'éteignent, et TOUT le catalogue en mode en
  // ligne (le lobby a besoin du serveur). Les jeux sur un seul téléphone
  // restent allumés : le service worker sert leur page (src/lib/offline/).
  const browserOnline = useBrowserOnline()
  const unplayableOffline = (game: LocalizedGameMeta) => !browserOnline && (Boolean(game.onlineOnly) || isOnline)
  const offlineCard = {
    isDisabled: unplayableOffline,
    disabledLabel: tOffline('title'),
    disabledHint: tOffline('unavailable'),
  }
  // Ambiance de l'appareil ou du compte (useAmbianceMode) : elle ne dépend
  // plus d'une session. Le filtre par softModeReady, lui, ne concerne que les
  // jeux EN LIGNE (seuls à avoir une variante sans alcool côté serveur).
  const { mode: ambiance } = useAmbianceMode()
  const isSoft = ambiance === 'soft'
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  // Visiteur sans session : la vitrine montre TOUT (comme la landing) —
  // Loup-Garou et les autres jeux online-only étaient introuvables ici alors
  // que ce sont les premières portes d'entrée SEO. Leur page propose ensuite
  // « Essayer avec des bots » ou la connexion.
  const visitor = !user
  // Funnel « Jouer seul avec les bots » (?solo=1) : on ne montre que les jeux
  // effectivement jouables avec des bots. Sans objet en mode local (les bots
  // sont un concept online) — le flag y est ignoré.
  // Les bots vivent sur le serveur : sans réseau, le hub retombe sur le
  // catalogue local normal, sous le bandeau hors ligne.
  const soloBots = solo && browserOnline && (visitor || isOnline)
  // Regard « local » : le joueur en mode local ET le visiteur (qui joue local
  // par défaut). Plus d'un jeu sur deux du catalogue est online-only : le
  // visiteur les voyait mélangés aux autres et tombait après le clic sur
  // « jeu en ligne uniquement », et le mode local les masquait purement.
  // On les GARDE visibles (ils font envie, ils mènent au compte) mais rangés
  // à part, sous une phrase qui dit ce qu'il faut pour y jouer.
  const localCatalog = !soloBots && !isOnline
  const visible = useMemo(
    () =>
      games.filter((g) => {
        // Retiré du code OU caché par l'équipe depuis la Supervision.
        if (!isGameListed(g, hiddenIds)) return false
        // Solo : seulement les jeux dont une table peut s'ouvrir dans cette
        // langue (création refusée sinon, content_lang_unavailable).
        if (soloBots) {
          return Boolean(g.botsFillable) && g.onlineReady && (!isSoft || g.softModeReady) && hasContentIn(g, locale)
        }
        if (isOnline) return Boolean(g.onlineReady) && (!isSoft || Boolean(g.softModeReady))
        return true
      }),
    [games, hiddenIds, isOnline, isSoft, soloBots, locale]
  )

  // Rubriques de l'équipe : une puce par catégorie qui range au moins un jeu
  // du catalogue affiché (avant la recherche : chercher ne fait pas disparaître
  // les puces). Une catégorie supprimée côté serveur repasse à « Toutes ».
  const offeredCategories = useMemo(
    () => categoriesToOffer(categories, new Set(visible.map((g) => g.id))),
    [categories, visible]
  )
  const activeCategory = resolveActiveCategory(offeredCategories, categoryId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inCategory = filterByCategory(visible, activeCategory)
    if (!q) return inCategory
    return inCategory.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
    )
  }, [visible, query, activeCategory])

  // Séparation « jouable ce soir sur ce téléphone » / « en ligne uniquement ».
  // Elle s'applique aussi pendant une recherche : c'est justement là que le
  // clic se fait sans lire la section.
  const localGames = useMemo(
    () => (localCatalog ? filtered.filter((g) => !g.onlineOnly) : filtered),
    [filtered, localCatalog]
  )
  const onlineOnlyGames = useMemo(
    () => (localCatalog ? filtered.filter((g) => g.onlineOnly) : []),
    [filtered, localCatalog]
  )

  // Rangée « les plus joués en ce moment », en tête du catalogue (local comme
  // en ligne) : les jeux les plus lancés ces 30 derniers jours, choisis par le
  // serveur. Elle passe par les MÊMES filtres que le reste de la page (jeu
  // caché, Sans alcool, langue). Tant qu'aucun jeu n'est classé, elle se replie
  // sur les jeux phares du code, retitrée « Les incontournables » : un jeu sans
  // partie ne passe jamais pour populaire — voir popular-row.ts. Ces jeux
  // restent aussi dans leurs sections : c'est une mise en avant, pas un
  // déplacement. Ni en recherche, ni en solo (qui garde ses sections
  // « parfaits en solo »).
  const mode = isOnline ? 'online' : 'local'
  // « À la une » : les jeux que l'équipe a choisis, AVANT « Les plus joués »,
  // mêmes filtres et mêmes exclusions (ni recherche, ni catégorie, ni solo) ;
  // « Les plus joués » ne répète pas ces jeux.
  const featuredRow = useMemo(
    () =>
      query.trim() || soloBots || activeCategory
        ? []
        : buildFeaturedRow({ candidates: localGames, featuredIds, hiddenIds, mode, locale }),
    [localGames, featuredIds, hiddenIds, mode, locale, query, soloBots, activeCategory]
  )
  const popularRow = useMemo(
    () =>
      query.trim() || soloBots || activeCategory
        ? { games: [] as typeof localGames, ranked: false }
        : buildPopularRow({
            candidates: localGames,
            popularIds: popular[mode],
            hiddenIds,
            mode,
            locale,
            excludeIds: featuredRow.map((g) => g.id),
          }),
    [localGames, popular, hiddenIds, mode, locale, query, soloBots, activeCategory, featuredRow]
  )
  const featuredTitle = (
    <>
      <span aria-hidden>★</span> {t('featuredRow')}
    </>
  )
  const popularTitle = popularRow.ranked ? (
    <>
      <Flame className="h-3.5 w-3.5" aria-hidden /> {t('popular')}
    </>
  ) : (
    <>
      <span aria-hidden>★</span> {t('featured')}
    </>
  )

  // Mode solo hors recherche : « Parfaits en solo » d'abord, puis tous les
  // autres. Une 1re partie seul contre des bots n'est rejouée que 4 fois sur
  // 21 en prod, et les jeux de discussion (Dilemmes, Crobard…) y sont quittés
  // en 1 à 2 min : le premier essai doit tomber sur un jeu qui tient sans
  // potes. Aucun jeu ne disparaît — les autres gardent leur place, badge
  // « Mieux à plusieurs » à l'appui. Remplace phares et familles : un même
  // jeu n'a pas à paraître deux fois dans une liste aussi courte.
  const soloSections = useMemo(
    () => (soloBots && !query.trim() && !activeCategory ? splitBySoloFit(localGames) : null),
    [soloBots, localGames, query, activeCategory]
  )

  // Sections par enseigne, en ligne et hors recherche — grille plate quand on
  // cherche. Le catalogue local se range, lui, par mode (voir ModeTitle).
  const sections = useMemo(() => {
    if (query.trim() || activeCategory || soloBots || localCatalog) return null
    return FAMILIES.map((f) => ({
      ...f,
      games: localGames.filter((g) => g.suit === f.suit),
    })).filter((s) => s.games.length > 0)
  }, [localGames, query, activeCategory, soloBots, localCatalog])

  return (
    <>
      {/* Recherche collée sous la navbar (h-14 / 3.75rem) au scroll. Fond
          PLEIN : `bg-felt-deep/85` ne générait rien en Tailwind 3.3, et la
          crème des cartes floutée remontait sous le champ (blanc sur crème,
          1,2:1). */}
      <div className="sticky top-14 z-30 -mx-4 mb-3 border-b border-gold/20 bg-felt-deep px-4 pb-2 pt-1.5 sm:top-[3.75rem] sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream/60"
              aria-hidden
            />
            <Input
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 border-gold/20 bg-white/[0.05] pl-10 text-cream placeholder:text-cream/60 focus-visible:ring-amber-400/40"
              aria-label={t('searchPlaceholder')}
            />
          </div>
          <span className="shrink-0 text-xs text-cream/70">
            {tCommon('gameCount', { count: filtered.length })}
          </span>
        </div>
      </div>

      {/* Rubriques créées par l'équipe : défilement horizontal sur téléphone
          (marges négatives pour aller bord à bord, sans élargir la page), à la
          ligne dès sm où une molette ne défile pas en largeur. py-1 : l'anneau
          de focus n'est pas rogné par le conteneur qui défile. */}
      {offeredCategories.length > 0 && (
        <div
          role="group"
          aria-label={t('categories.label')}
          className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {[{ id: null, label: t('categories.all') }, ...offeredCategories.map((c) => ({ id: c.id, label: categoryName(c, locale) }))].map(
            (chip) => {
              const active = (activeCategory?.id ?? null) === chip.id
              return (
                <button
                  key={chip.id ?? 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryId(chip.id)}
                  className={cn(
                    'min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                    active
                      ? 'border-gold bg-gold text-[#24201A]'
                      : 'border-gold/30 bg-white/[0.05] text-cream hover:border-gold/60 hover:bg-gold/10'
                  )}
                >
                  {chip.label}
                </button>
              )
            }
          )}
        </div>
      )}

      {/* Atterrissage « Jouer seul avec les bots » : la liste a rétréci sans
          un mot d'explication — on dit pourquoi, et comment tout revoir. */}
      {soloBots && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2">
          <p className="text-xs leading-snug text-amber-100">
            <span className="font-semibold text-amber-200">{t('soloBanner.title')}</span>{' '}
            {t('soloBanner.text')}
          </p>
          <Link
            href="/jeux"
            className="ml-auto shrink-0 text-xs font-semibold text-amber-200 underline underline-offset-2 transition-colors hover:text-amber-100"
          >
            {t('soloBanner.showAll')}
          </Link>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gold/20 bg-felt-deep/70 px-6 py-12 text-center">
          <Sparkles className="mb-3 h-7 w-7 text-gold" aria-hidden />
          <p className="font-medium text-cream">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-cream/70">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {localCatalog ? (
            localGames.length > 0 && (
              <>
                {featuredRow.length > 0 && (
                  <section>
                    <FamilyTitle>{featuredTitle}</FamilyTitle>
                    <GamesCardGrid games={featuredRow} {...offlineCard} />
                  </section>
                )}
                {popularRow.games.length > 0 && (
                  <section>
                    <FamilyTitle>
                      {popularTitle}
                    </FamilyTitle>
                    <GamesCardGrid games={popularRow.games} {...offlineCard} />
                  </section>
                )}
                <section>
                  <div data-tour="hub-local-head">
                    <ModeTitle icon={<Smartphone className="h-4 w-4" />}>
                      {t('localSection.title', { count: localGames.length })}
                    </ModeTitle>
                    <p className="mb-2 text-xs leading-snug text-cream/80">{t('localSection.hint')}</p>
                  </div>
                  <GamesCardGrid games={localGames} tourAnchor="hub-local-grid" {...offlineCard} />
                </section>
              </>
            )
          ) : soloSections ? (
            <>
              {soloSections.great.length > 0 && (
                <section>
                  <FamilyTitle>
                    <Bot className="h-3.5 w-3.5" aria-hidden /> {t('soloFit.greatTitle')}
                  </FamilyTitle>
                  <p className="mb-2 text-xs leading-snug text-cream/80">{t('soloFit.greatHint')}</p>
                  <GamesCardGrid games={soloSections.great} {...offlineCard} />
                </section>
              )}
              {soloSections.others.length > 0 && (
                <section>
                  <FamilyTitle>{t('soloFit.othersTitle')}</FamilyTitle>
                  <GamesCardGrid games={soloSections.others} soloHints {...offlineCard} />
                </section>
              )}
            </>
          ) : sections ? (
            <>
              {featuredRow.length > 0 && (
                <section>
                  <FamilyTitle>{featuredTitle}</FamilyTitle>
                  <GamesCardGrid games={featuredRow} {...offlineCard} />
                </section>
              )}
              {popularRow.games.length > 0 && (
                <section>
                  <FamilyTitle>
                    {popularTitle}
                  </FamilyTitle>
                  <GamesCardGrid games={popularRow.games} {...offlineCard} />
                </section>
              )}
              {sections.map((section) => (
                <section key={section.suit}>
                  <FamilyTitle>
                    <span aria-hidden>{section.glyph}</span> {t(`families.${section.suit}`)}
                  </FamilyTitle>
                  <GamesCardGrid games={section.games} {...offlineCard} />
                </section>
              ))}
            </>
          ) : (
            localGames.length > 0 && <GamesCardGrid games={localGames} soloHints={soloBots} {...offlineCard} />
          )}

          {/* Promesse honnête AVANT le clic : ces jeux réclament un téléphone
              par joueur, ils ne se jouent pas sur l'appareil qui tourne autour
              de la table. On ne les cache pas — c'est la porte vers le compte. */}
          {onlineOnlyGames.length > 0 && (
            <section>
              <ModeTitle icon={<Globe className="h-4 w-4" />}>
                {t('onlineOnly.sectionTitle', { count: onlineOnlyGames.length })}
              </ModeTitle>
              <p className="mb-2 text-xs leading-snug text-cream/80">{t('onlineOnly.hint')}</p>
              <GamesCardGrid games={onlineOnlyGames} {...offlineCard} />
            </section>
          )}
        </div>
      )}
    </>
  )
}
