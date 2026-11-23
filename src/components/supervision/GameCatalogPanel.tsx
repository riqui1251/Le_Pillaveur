'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Eye, EyeOff, Gamepad2, Loader2, RefreshCw } from 'lucide-react'
import { DifficultyBadge } from '@/components/game/DifficultyBadge'
import { GameIconById } from '@/components/hub/GameIconById'
import { SectionCard, ErrorState, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { countHidden, parseAdminGameCatalog } from '@/components/supervision/game-catalog-panel'
import type { AdminGameCatalogResponse, AdminGameCatalogRow } from '@/app/api/admin/game-catalog/route'
import { refreshGameCatalog } from '@/hooks/useGameCatalog'
import { GAMES, getGameById } from '@/lib/games'
import { cn } from '@/lib/utils'

/**
 * « Catalogue des jeux » : chaque jeu que l'équipe peut cacher, ses parties
 * sur 30 jours et son rang de mise en avant (GET /api/admin/game-catalog).
 * Un super admin cache ou remet un jeu d'un geste (PATCH).
 *
 * Panneau AUTONOME, hors de la boucle de 15 s, comme les autres panneaux de
 * la vue : chargé à l'ouverture, rechargé à la main. Après un changement, la
 * réponse du serveur REMPLACE les lignes (jamais d'état local deviné) et le
 * catalogue de cet appareil est redemandé pour que le hub et la Soirée de
 * l'équipier suivent tout de suite.
 */

/** Pastille : même gabarit pour l'état et les mises en avant. */
const PILL = 'inline-flex items-center rounded-md border px-1.5 py-px text-[11px] font-medium leading-snug'

/**
 * Titre traduit d'un jeu ; repli sur le catalogue puis sur l'identifiant (la
 * Supervision nomme les jeux, elle ne suit pas l'ambiance de l'appareil).
 */
function useGameTitle() {
  const t = useTranslations('games.catalog')
  return (gameId: string): string => {
    const key = `${gameId}.title`
    return t.has(key) ? t(key) : (GAMES.find((g) => g.id === gameId)?.title ?? gameId)
  }
}

/** Colonnes du tableau (md et plus) : jeu, difficulté, parties, état, action. */
const GRID_COLS = 'md:grid-cols-[minmax(0,1.6fr)_6.5rem_minmax(0,1.6fr)_6rem_auto]'

export function GameCatalogPanel() {
  const t = useTranslations('supervision.gameCatalog')
  const tStates = useTranslations('supervision.states')
  const gameTitle = useGameTitle()
  const [data, setData] = useState<AdminGameCatalogResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const tRef = useRef(t)
  tRef.current = t
  const abortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef(false)

  const load = useCallback(async () => {
    // Une lecture lancée pendant un envoi pourrait répondre après lui et réafficher l'ancien état.
    if (pendingRef.current) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
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
      setSaveFailed(false)
    } catch (e) {
      if (controller.signal.aborted) return
      // TypeError = échec réseau de fetch (en anglais quelle que soit la langue).
      setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current('loadError'))
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      const pending = abortRef.current
      abortRef.current = null
      pending?.abort()
    }
  }, [load])

  const toggle = async (row: AdminGameCatalogRow, title: string) => {
    if (pendingRef.current) return
    pendingRef.current = true
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
    setPendingId(row.id)
    setSaveFailed(false)
    setAnnouncement('')
    try {
      const res = await fetch('/api/admin/game-catalog', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: row.id, hidden: !row.hidden }),
      })
      const parsed = res.ok ? parseAdminGameCatalog(await res.json().catch(() => null)) : null
      if (!parsed) {
        setSaveFailed(true)
        return
      }
      setData(parsed)
      setAnnouncement(tRef.current(parsed.games.find((g) => g.id === row.id)?.hidden ? 'announceHidden' : 'announceShown', { game: title }))
      void refreshGameCatalog()
    } catch {
      setSaveFailed(true)
    } finally {
      pendingRef.current = false
      setPendingId(null)
    }
  }

  const refreshButton = (
    <button
      type="button"
      onClick={() => void load()}
      aria-busy={loading}
      aria-disabled={pendingId !== null}
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
              {data.retiredCount > 0 && <span>{t('retiredNote', { count: data.retiredCount })}</span>}
            </p>
            <p>{t('sortedHint')}</p>
            {!data.canEdit && <p>{t('readOnly')}</p>}
          </div>

          {saveFailed && (
            <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100">
              {t('saveError')}
            </p>
          )}

          <div
            aria-hidden
            className={cn(
              'hidden gap-x-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-cream/70 md:grid',
              GRID_COLS
            )}
          >
            <span>{t('colGame')}</span>
            <span>{t('colDifficulty')}</span>
            <span>{t('colPlays')}</span>
            <span>{t('colStatus')}</span>
            <span />
          </div>

          <ul className="space-y-2 md:space-y-0 md:divide-y md:divide-white/5 md:rounded-xl md:border md:border-white/10 md:bg-black/20">
            {data.games.map((row) => {
              const title = gameTitle(row.id)
              const difficulty = getGameById(row.id)?.difficulty
              const busy = pendingId === row.id
              return (
                <li
                  key={row.id}
                  className={cn(
                    'grid grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-black/20 p-3',
                    'md:rounded-none md:border-0 md:bg-transparent md:py-2.5',
                    GRID_COLS
                  )}
                >
                  <span
                    className={cn(
                      'col-span-2 inline-flex min-w-0 items-center gap-2 text-sm font-medium text-cream md:order-1 md:col-span-1',
                      row.hidden && 'opacity-60'
                    )}
                  >
                    <span aria-hidden>
                      <GameIconById id={row.id} surface="feltGold" className="h-6 w-6 shrink-0" />
                    </span>
                    <span className="min-w-0 truncate">{title}</span>
                  </span>

                  <span className={cn('min-w-0 md:order-2', row.hidden && 'opacity-60')}>
                    {difficulty && <DifficultyBadge level={difficulty} tone="felt" />}
                  </span>

                  <span className="justify-self-end md:order-4 md:justify-self-start">
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
                  </span>

                  <span className="col-span-2 min-w-0 space-y-1.5 md:order-3 md:col-span-1">
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
                    <button
                      type="button"
                      aria-busy={busy}
                      aria-disabled={pendingId !== null}
                      onClick={() => void toggle(row, title)}
                      className="col-span-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-medium text-cream/80 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:order-5 md:col-span-1 md:h-8 md:justify-self-end md:px-2.5"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />
                      ) : row.hidden ? (
                        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="truncate">{row.hidden ? t('show', { game: title }) : t('hide', { game: title })}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
