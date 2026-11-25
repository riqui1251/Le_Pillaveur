'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, Check, Eye, EyeOff, Gamepad2, Loader2, RefreshCw, Star } from 'lucide-react'
import { DifficultyBadge, DifficultyBars } from '@/components/game/DifficultyBadge'
import { DrinkLevelGauge } from '@/components/game/DrinkLevelBadge'
import { GameIconById } from '@/components/hub/GameIconById'
import { SectionCard, ErrorState, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { countFeatured, countHidden, parseAdminGameCatalog } from '@/components/supervision/game-catalog-panel'
import {
  categoriesSignature,
  categoryIdsOfGame,
  parseAdminGameCategories,
} from '@/components/supervision/game-categories-panel'
import type { AdminGameCatalogResponse, AdminGameCatalogRow } from '@/app/api/admin/game-catalog/route'
import type { AdminGameCategoriesResponse } from '@/app/api/admin/game-categories/route'
import { refreshGameCatalog, useGameCategories } from '@/hooks/useGameCatalog'
import { FEATURED_LIMIT, categoryName, type GameCategory } from '@/lib/game-catalog'
import { GAMES, type GameDifficulty, type GameDrinkLevel } from '@/lib/games'
import { cn } from '@/lib/utils'

/**
 * « Catalogue des jeux » : chaque jeu que l'équipe peut cacher, ses parties
 * sur 30 jours et son rang parmi les plus joués (GET /api/admin/game-catalog).
 * Un super admin cache ou remet un jeu, le met à la une, le range dans des
 * catégories, ou règle sa difficulté ou son barème « fait boire », d'un geste
 * (PATCH). Les catégories viennent de /api/admin/game-categories : la même
 * fiche de jeu montre tout ce qui le concerne sans changer de panneau.
 *
 * Panneau AUTONOME, hors de la boucle de 15 s, comme les autres panneaux de
 * la vue : chargé à l'ouverture, rechargé à la main. Après un changement, la
 * réponse du serveur REMPLACE les lignes (jamais d'état local deviné) et le
 * catalogue de cet appareil est redemandé pour que le hub et la Soirée de
 * l'équipier suivent tout de suite. Un seul geste à la fois dans tout le panneau.
 */

/** Pastille : même gabarit pour l'état et les mises en avant. */
const PILL = 'inline-flex items-center rounded-md border px-1.5 py-px text-[11px] font-medium leading-snug'

/**
 * Titre traduit d'un jeu ; repli sur le catalogue puis sur l'identifiant (la
 * Supervision nomme les jeux, elle ne suit pas l'ambiance de l'appareil).
 */
export function useGameTitle() {
  const t = useTranslations('games.catalog')
  return (gameId: string): string => {
    const key = `${gameId}.title`
    return t.has(key) ? t(key) : (GAMES.find((g) => g.id === gameId)?.title ?? gameId)
  }
}

/**
 * Colonnes du tableau (lg et plus) : jeu, barèmes (deux sélecteurs de 3 boutons empilés), parties, état, action.
 * Les trois colonnes de droite ont une largeur fixe : alignées d'une ligne à l'autre, le titre et les
 * parties se partagent le reste. Pas dès md : en tablette portrait, les 15,5 rem des sélecteurs
 * écrasaient le titre et les parties.
 */
const GRID_COLS = 'lg:grid-cols-[minmax(0,1.4fr)_15.5rem_minmax(0,1.4fr)_5.5rem_14rem]'
/** Sans droit d'écriture, la colonne du bouton n'existe pas : le titre et les parties se partagent sa place. */
const GRID_COLS_READ_ONLY = 'lg:grid-cols-[minmax(0,1.4fr)_15.5rem_minmax(0,1.4fr)_5.5rem]'

/** Les deux barèmes ont les mêmes trois niveaux. */
type Level = GameDifficulty & GameDrinkLevel

const LEVELS: readonly Level[] = [1, 2, 3]

/**
 * Niveau « fait boire » en lecture seule dans la Supervision. Pas DrinkLevelBadge : sa classe
 * `drink-level` disparaît en ambiance « Sans alcool », et l'équipe doit toujours voir le réglage,
 * quelle que soit l'ambiance de son appareil.
 */
function DrinkLevelReadout({ level }: { level: GameDrinkLevel }) {
  const t = useTranslations('common.drinkLevel')
  const word = t(`levels.${level}`)
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold leading-none text-amber-100" title={t('aria', { level: word })}>
      <DrinkLevelGauge level={level} />
      <span aria-hidden>{word}</span>
      <span className="sr-only">{t('aria', { level: word })}</span>
    </span>
  )
}

/** Même teinte que les barres de DifficultyBadge sur le feutre (« fait boire » garde les couleurs de sa jauge). */
const LEVEL_TONE: Record<Level, string> = { 1: 'text-emerald-300', 2: 'text-amber-300', 3: 'text-red-300' }

/**
 * Un barème réglable (difficulté ou « fait boire ») : légende, 3 boutons
 * segmentés (aria-pressed) et, quand le réglage diffère du code, le niveau du
 * code. Sans droit d'écriture, `readOnly` remplace les boutons par le badge.
 */
function ScaleSelector({
  caption,
  groupLabel,
  value,
  codeValue,
  codeNote,
  levelLabel,
  glyph,
  readOnly,
  locked,
  dimmed,
  onSelect,
}: {
  caption: string
  groupLabel: string
  value: Level
  codeValue: Level
  codeNote: string
  levelLabel: (level: Level) => string
  glyph: (level: Level, className: string) => ReactNode
  readOnly: ReactNode | null
  /** Un envoi est en cours : les boutons restent lisibles mais n'agissent plus. */
  locked: boolean
  dimmed: boolean
  onSelect: (level: Level) => void
}) {
  return (
    <span className="block min-w-0 space-y-1">
      <span className="block text-[11px] font-medium leading-none text-cream/70">{caption}</span>
      {readOnly ? (
        <span className={cn('block', dimmed && 'opacity-60')}>{readOnly}</span>
      ) : (
        <span
          role="group"
          aria-label={groupLabel}
          className="grid grid-cols-3 gap-0.5 rounded-lg border border-white/[0.15] bg-black/20 p-0.5"
        >
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={value === level}
              aria-disabled={locked}
              onClick={() => onSelect(level)}
              className={cn(
                'inline-flex h-11 min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-semibold leading-none transition-colors lg:h-7',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                value === level
                  ? 'border-gold/50 bg-gold/[0.15] text-cream'
                  : 'border-transparent text-cream/70 hover:bg-white/10 hover:text-cream'
              )}
            >
              {glyph(level, LEVEL_TONE[level])}
              <span className="truncate">{levelLabel(level)}</span>
            </button>
          ))}
        </span>
      )}
      {value !== codeValue && <span className="block text-[11px] leading-snug text-cream/70">{codeNote}</span>}
    </span>
  )
}

type FailureKey = 'saveError' | 'forbidden' | 'featuredLimit' | 'categoryGone'

/** Même gabarit que les boutons Cacher / Remettre ; en bascule, l'état allumé reprend le doré des sélecteurs. */
const ACTION_BUTTON =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 lg:h-8 lg:px-2.5'
const ACTION_IDLE = 'border-white/20 bg-white/5 text-cream/80 hover:bg-white/10 hover:text-cream'
const ACTION_ON = 'border-gold/50 bg-gold/[0.15] text-cream'

/**
 * `focusGameId` : sous lg, seule la ligne de ce jeu s'affiche (le sélecteur de l'onglet Jeux remplace le long défilement) ;
 * dès lg le tableau complet reste intact. Sans lui, toutes les lignes s'affichent partout.
 */
export function GameCatalogPanel({ focusGameId }: { focusGameId?: string } = {}) {
  const t = useTranslations('supervision.gameCatalog')
  const tStates = useTranslations('supervision.states')
  const tLevel = useTranslations('common.difficulty')
  const tDrink = useTranslations('common.drinkLevel')
  const locale = useLocale()
  const gameTitle = useGameTitle()
  const [data, setData] = useState<AdminGameCatalogResponse | null>(null)
  const [categories, setCategories] = useState<AdminGameCategoriesResponse | null>(null)
  const [categoriesError, setCategoriesError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Clé du geste en cours (« <jeu>:<geste> ») : le bouton concerné montre son état occupé, tous les autres se verrouillent.
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [failure, setFailure] = useState<FailureKey | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const deviceCategories = useGameCategories()

  const tRef = useRef(t)
  tRef.current = t
  const abortRef = useRef<AbortController | null>(null)
  const categoriesAbortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef(false)
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  // Une relecture demandée pendant un envoi (liste périmée, rangement changé ailleurs) attend la fin de l'envoi.
  const reloadCatalogAfterRef = useRef(false)
  const reloadCategoriesAfterRef = useRef(false)

  const loadCategories = useCallback(async () => {
    if (pendingRef.current) return
    categoriesAbortRef.current?.abort()
    const controller = new AbortController()
    categoriesAbortRef.current = controller
    try {
      const res = await fetch('/api/admin/game-categories', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const parsed = res.ok ? parseAdminGameCategories(await res.json().catch(() => null)) : null
      if (!parsed) throw new Error('unreadable')
      setCategories(parsed)
      setCategoriesError(false)
    } catch {
      if (!controller.signal.aborted) setCategoriesError(true)
    }
  }, [])

  const load = useCallback(
    async (keepFailure = false) => {
      // Une lecture lancée pendant un envoi pourrait répondre après lui et réafficher l'ancien état.
      if (pendingRef.current) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      void loadCategories()
      try {
        const res = await fetch('/api/admin/game-catalog', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await res.json().catch(() => null)
        // 403 : session expirée ou grade retiré pendant que l'onglet restait ouvert.
        if (!res.ok) throw new Error(res.status === 403 ? tRef.current('forbidden') : tRef.current('loadError'))
        const parsed = parseAdminGameCatalog(body)
        if (!parsed) throw new Error(tRef.current('loadError'))
        setData(parsed)
        setError(null)
        // La relecture qui suit un refus (limite des jeux à la une) ne doit pas effacer le message qui l'explique.
        if (!keepFailure) setFailure(null)
      } catch (e) {
        if (controller.signal.aborted) return
        // TypeError = échec réseau de fetch (en anglais quelle que soit la langue).
        setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current('loadError'))
      } finally {
        if (abortRef.current === controller) setLoading(false)
      }
    },
    [loadCategories]
  )

  useEffect(() => {
    void load()
    return () => {
      const pendingLoad = abortRef.current
      abortRef.current = null
      pendingLoad?.abort()
      const pendingCategories = categoriesAbortRef.current
      categoriesAbortRef.current = null
      pendingCategories?.abort()
    }
  }, [load])

  // Le rangement se règle aussi dans le panneau des catégories, juste en dessous : sa réponse met à jour le catalogue de cet appareil,
  // et c'est ce changement qui déclenche la relecture ici. Comparaison par empreinte : nos propres envois y répondent déjà.
  const deviceSignature = useMemo(() => categoriesSignature(deviceCategories), [deviceCategories])
  useEffect(() => {
    const current = categoriesRef.current
    if (!current || categoriesSignature(current.categories) === deviceSignature) return
    if (pendingRef.current) reloadCategoriesAfterRef.current = true
    else void loadCategories()
  }, [deviceSignature, loadCategories])

  /** Prend le verrou d'un geste (un seul à la fois dans tout le panneau) ; false si un autre est déjà en cours. */
  const begin = (key: string): boolean => {
    if (pendingRef.current) return false
    pendingRef.current = true
    abortRef.current?.abort()
    abortRef.current = null
    categoriesAbortRef.current?.abort()
    categoriesAbortRef.current = null
    // Une première lecture des catégories coupée par ce geste (ou échouée) serait sinon perdue : les fiches resteraient sur « Chargement… ».
    if (!categoriesRef.current) reloadCategoriesAfterRef.current = true
    setLoading(false)
    setPendingKey(key)
    setFailure(null)
    setAnnouncement('')
    return true
  }

  const end = () => {
    pendingRef.current = false
    setPendingKey(null)
    if (reloadCatalogAfterRef.current) {
      reloadCatalogAfterRef.current = false
      reloadCategoriesAfterRef.current = false
      void load(true)
    } else if (reloadCategoriesAfterRef.current) {
      reloadCategoriesAfterRef.current = false
      void loadCategories()
    }
  }

  const patch = (url: string, body: Record<string, unknown>) =>
    fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const save = async (
    row: AdminGameCatalogRow,
    kind: 'hide' | 'featured' | 'scale',
    payload: { hidden: boolean } | { featured: boolean } | { difficulty: GameDifficulty } | { drinkLevel: GameDrinkLevel },
    announce: (saved: AdminGameCatalogRow) => string
  ) => {
    if (!begin(`${row.id}:${kind}`)) return
    try {
      const res = await patch('/api/admin/game-catalog', { gameId: row.id, ...payload })
      const parsed = res.ok ? parseAdminGameCatalog(await res.json().catch(() => null)) : null
      if (!parsed) {
        // 409 : la limite est atteinte côté serveur, la liste affichée est donc périmée.
        if (res.status === 409 && 'featured' in payload) {
          setFailure('featuredLimit')
          reloadCatalogAfterRef.current = true
        } else {
          setFailure(res.status === 403 ? 'forbidden' : 'saveError')
        }
        return
      }
      setData(parsed)
      const saved = parsed.games.find((g) => g.id === row.id)
      if (saved) setAnnouncement(announce(saved))
      void refreshGameCatalog()
    } catch {
      setFailure('saveError')
    } finally {
      end()
    }
  }

  const saveCategory = async (row: AdminGameCatalogRow, category: GameCategory, title: string, on: boolean) => {
    if (!begin(`${row.id}:category:${category.id}`)) return
    try {
      const res = await patch('/api/admin/game-categories', { id: category.id, gameId: row.id, on })
      const parsed = res.ok ? parseAdminGameCategories(await res.json().catch(() => null)) : null
      if (!parsed) {
        if (res.status === 404) {
          setFailure('categoryGone')
          reloadCategoriesAfterRef.current = true
        } else {
          setFailure(res.status === 403 ? 'forbidden' : 'saveError')
        }
        return
      }
      setCategories(parsed)
      // La réponse fait foi : l'annonce dit ce que le serveur a retenu, pas ce qu'on a demandé.
      const saved = parsed.categories.find((c) => c.id === category.id)
      if (saved) {
        setAnnouncement(
          tRef.current(saved.gameIds.includes(row.id) ? 'announceCategoryOn' : 'announceCategoryOff', {
            game: title,
            category: categoryName(saved, locale),
          })
        )
      }
      void refreshGameCatalog()
    } catch {
      setFailure('saveError')
    } finally {
      end()
    }
  }

  const toggle = (row: AdminGameCatalogRow, title: string) =>
    save(row, 'hide', { hidden: !row.hidden }, (saved) => tRef.current(saved.hidden ? 'announceHidden' : 'announceShown', { game: title }))

  const toggleFeatured = (row: AdminGameCatalogRow, title: string) =>
    save(row, 'featured', { featured: !row.featured }, (saved) =>
      tRef.current(saved.featured ? 'announceFeaturedOn' : 'announceFeaturedOff', { game: title })
    )

  const setDifficulty = (row: AdminGameCatalogRow, title: string, level: GameDifficulty) => {
    if (level === row.difficulty) return Promise.resolve()
    return save(row, 'scale', { difficulty: level }, (saved) =>
      tRef.current('announceDifficulty', { game: title, level: tLevel(`levels.${saved.difficulty}`) })
    )
  }

  const setDrinkLevel = (row: AdminGameCatalogRow, title: string, level: GameDrinkLevel) => {
    if (level === row.drinkLevel) return Promise.resolve()
    return save(row, 'scale', { drinkLevel: level }, (saved) =>
      tRef.current('announceDrinkLevel', { game: title, level: tDrink(`levels.${saved.drinkLevel}`) })
    )
  }

  const gridCols = data?.canEdit === false ? GRID_COLS_READ_ONLY : GRID_COLS
  const locked = pendingKey !== null

  const refreshButton = (
    <button
      type="button"
      onClick={() => void load()}
      aria-busy={loading}
      aria-disabled={locked}
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-medium text-cream/80 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:h-8 sm:px-2.5"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'motion-safe:animate-spin')} aria-hidden />
      {t('refresh')}
    </button>
  )

  return (
    <SectionCard icon={Gamepad2} title={t('title')} description={t('desc')} actions={refreshButton}>
      {error ? (
        <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load()} />
      ) : !data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-3">
          <p role="status" className="sr-only">
            {announcement}
          </p>
          <div className="space-y-1 text-xs text-cream/70">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-cream">{t('hiddenCount', { count: countHidden(data.games) })}</span>
              <span className="font-semibold text-cream">
                {t('featuredCount', { count: countFeatured(data.games), max: FEATURED_LIMIT })}
              </span>
              {data.retiredCount > 0 && <span>{t('retiredNote', { count: data.retiredCount })}</span>}
            </p>
            <p>{t('sortedHint')}</p>
            <p>{t('featuredHint')}</p>
            {!data.canEdit && <p>{t('readOnly')}</p>}
          </div>

          {failure && (
            <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100">
              {t(failure, { max: FEATURED_LIMIT })}
            </p>
          )}

          <div
            aria-hidden
            className={cn(
              'hidden gap-x-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-cream/70 lg:grid',
              gridCols
            )}
          >
            <span>{t('colGame')}</span>
            <span>{t('colScales')}</span>
            <span>{t('colPlays')}</span>
            <span>{t('colStatus')}</span>
            {data.canEdit && <span />}
          </div>

          <ul
            className={cn(
              'lg:space-y-0 lg:divide-y lg:divide-white/5 lg:rounded-xl lg:border lg:border-white/10 lg:bg-black/20',
              // Les lignes écartées restent dans le DOM : leur marge ne doit pas décaler la ligne affichée.
              focusGameId === undefined && 'space-y-2'
            )}
          >
            {data.games.map((row) => {
              const title = gameTitle(row.id)
              const offFocus = focusGameId !== undefined && row.id !== focusGameId
              const placedIn = categories ? categoryIdsOfGame(categories.categories, row.id) : []
              return (
                <li
                  key={row.id}
                  className={cn(
                    offFocus ? 'hidden lg:grid' : 'grid',
                    'grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-black/20 p-3',
                    'lg:rounded-none lg:border-0 lg:bg-transparent lg:py-2.5',
                    gridCols
                  )}
                >
                  <span
                    className={cn(
                      'col-span-2 inline-flex min-w-0 items-center gap-2 text-sm font-medium text-cream lg:order-1 lg:col-span-1',
                      row.hidden && 'opacity-60'
                    )}
                  >
                    <span aria-hidden>
                      <GameIconById id={row.id} surface="feltGold" className="h-6 w-6 shrink-0" />
                    </span>
                    <span className="min-w-0 truncate" title={title}>
                      {title}
                    </span>
                  </span>

                  <span className="col-span-2 block min-w-0 space-y-3 lg:order-2 lg:col-span-1 lg:space-y-2">
                    <ScaleSelector
                      caption={t('scaleDifficulty')}
                      groupLabel={t('difficultyGroup', { game: title })}
                      value={row.difficulty}
                      codeValue={row.defaultDifficulty}
                      codeNote={t('difficultyModified', { level: tLevel(`levels.${row.defaultDifficulty}`) })}
                      levelLabel={(level) => tLevel(`levels.${level}`)}
                      glyph={(level, className) => <DifficultyBars level={level} className={className} />}
                      readOnly={data.canEdit ? null : <DifficultyBadge level={row.difficulty} tone="felt" />}
                      locked={locked}
                      dimmed={row.hidden}
                      onSelect={(level) => void setDifficulty(row, title, level)}
                    />
                    <ScaleSelector
                      caption={t('scaleDrink')}
                      groupLabel={t('drinkGroup', { game: title })}
                      value={row.drinkLevel}
                      codeValue={row.defaultDrinkLevel}
                      codeNote={t('drinkModified', { level: tDrink(`levels.${row.defaultDrinkLevel}`) })}
                      levelLabel={(level) => tDrink(`levels.${level}`)}
                      glyph={(level) => <DrinkLevelGauge level={level} />}
                      readOnly={data.canEdit ? null : <DrinkLevelReadout level={row.drinkLevel} />}
                      locked={locked}
                      dimmed={row.hidden}
                      onSelect={(level) => void setDrinkLevel(row, title, level)}
                    />
                  </span>

                  <span className="col-span-2 flex flex-wrap items-center gap-1.5 lg:order-4 lg:col-span-1 lg:flex-col lg:items-start">
                    <span
                      className={cn(
                        PILL,
                        row.hidden
                          ? 'border-rose-500/25 bg-rose-500/[0.06] text-rose-100'
                          : 'border-white/10 bg-white/5 text-cream/80'
                      )}
                    >
                      {row.hidden ? t('hidden') : t('visible')}
                    </span>
                    {row.featured && (
                      <span className={cn(PILL, 'gap-1 border-gold/50 bg-gold/[0.15] text-cream')}>
                        <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden />
                        {row.featuredRank !== null ? t('featuredPillRank', { rank: row.featuredRank }) : t('featuredPill')}
                      </span>
                    )}
                  </span>

                  <span className="col-span-2 min-w-0 space-y-1.5 lg:order-3 lg:col-span-1">
                    <span className={cn('block text-sm text-cream/90', row.hidden && 'opacity-60')}>
                      <span className="font-semibold tabular-nums text-cream">{t('plays', { count: row.plays.total })}</span>
                      {row.plays.total > 0 && (
                        <span className="text-xs text-cream/70">
                          {' · '}
                          {t('playsDetail', { online: row.plays.online, local: row.plays.local })}
                        </span>
                      )}
                    </span>
                    {(row.popularLocalRank !== null || row.popularOnlineRank !== null) && (
                      <span className="flex flex-wrap gap-1.5">
                        {row.popularLocalRank !== null && (
                          <span className={cn(PILL, 'border-gold/30 bg-felt-deep/60 text-gold')}>
                            {t('popularLocal', { rank: row.popularLocalRank })}
                          </span>
                        )}
                        {row.popularOnlineRank !== null && (
                          <span className={cn(PILL, 'border-gold/30 bg-felt-deep/60 text-gold')}>
                            {t('popularOnline', { rank: row.popularOnlineRank })}
                          </span>
                        )}
                      </span>
                    )}
                  </span>

                  {data.canEdit && (
                    <span className="col-span-2 grid grid-cols-[auto_minmax(0,1fr)] gap-2 lg:order-5 lg:col-span-1 lg:grid-cols-1 lg:gap-1.5">
                      <button
                        type="button"
                        aria-pressed={row.featured}
                        aria-label={t('featuredAria', { game: title })}
                        aria-busy={pendingKey === `${row.id}:featured`}
                        aria-disabled={locked}
                        onClick={() => void toggleFeatured(row, title)}
                        className={cn(ACTION_BUTTON, row.featured ? ACTION_ON : ACTION_IDLE)}
                      >
                        <Star className={cn('h-3.5 w-3.5 shrink-0', row.featured && 'fill-current')} aria-hidden />
                        <span className="truncate" aria-hidden>
                          {t('featured')}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-busy={pendingKey === `${row.id}:hide`}
                        aria-disabled={locked}
                        onClick={() => void toggle(row, title)}
                        className={cn(ACTION_BUTTON, ACTION_IDLE)}
                      >
                        {pendingKey === `${row.id}:hide` ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />
                        ) : row.hidden ? (
                          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        <span className="truncate" title={row.hidden ? t('show', { game: title }) : t('hide', { game: title })}>
                          {row.hidden ? t('show', { game: title }) : t('hide', { game: title })}
                        </span>
                      </button>
                    </span>
                  )}

                  <div className="col-span-2 space-y-1.5 border-t border-white/[0.07] pt-3 lg:order-6 lg:col-span-full lg:pt-2.5">
                    <p className="text-[11px] font-medium leading-none text-cream/70">{t('categories')}</p>
                    {!categories ? (
                      <p className="text-xs text-cream/70">{categoriesError ? t('categoriesLoadError') : t('categoriesLoading')}</p>
                    ) : categories.categories.length === 0 ? (
                      <p className="text-xs text-cream/70">
                        {t('noCategories')}{' '}
                        {data.canEdit && (
                          <a
                            href="#game-categories"
                            className="rounded font-medium text-gold underline underline-offset-2 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                          >
                            {t('createCategory')}
                          </a>
                        )}
                      </p>
                    ) : data.canEdit ? (
                      <ul aria-label={t('categoriesGroup', { game: title })} className="flex flex-wrap gap-1.5">
                        {categories.categories.map((category) => {
                          const on = placedIn.includes(category.id)
                          const busy = pendingKey === `${row.id}:category:${category.id}`
                          const name = categoryName(category, locale)
                          return (
                            <li key={category.id}>
                              <button
                                type="button"
                                aria-pressed={on}
                                aria-busy={busy}
                                aria-disabled={locked}
                                onClick={() => void saveCategory(row, category, title, !on)}
                                className={cn(
                                  'inline-flex h-11 max-w-full items-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors lg:h-7 lg:px-2',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                                  on ? ACTION_ON : 'border-white/20 bg-transparent text-cream/70 hover:bg-white/10 hover:text-cream'
                                )}
                              >
                                {busy ? (
                                  <Loader2 className="h-3 w-3 shrink-0 motion-safe:animate-spin" aria-hidden />
                                ) : (
                                  on && <Check className="h-3 w-3 shrink-0" aria-hidden />
                                )}
                                <span className="truncate" title={name}>
                                  {name}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : placedIn.length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {categories.categories
                          .filter((category) => placedIn.includes(category.id))
                          .map((category) => (
                            <li key={category.id} className={cn(PILL, 'border-gold/30 bg-felt-deep/60 text-gold')}>
                              {categoryName(category, locale)}
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-cream/70">{t('notInCategory')}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
