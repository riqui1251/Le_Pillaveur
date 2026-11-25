'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Check, Loader2, PartyPopper, RefreshCw } from 'lucide-react'
import { DrinkLevelGauge } from '@/components/game/DrinkLevelBadge'
import { GameIconById } from '@/components/hub/GameIconById'
import { useGameTitle } from '@/components/supervision/GameCatalogPanel'
import { ErrorState, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import {
  isModifiedVibes,
  parseAdminGameVibes,
  soireeChange,
  soireeCounts,
  vibeCounts,
} from '@/components/supervision/game-vibes-panel'
import type { AdminGameVibesResponse, AdminGameVibesRow } from '@/app/api/admin/game-vibes/route'
import { refreshGameCatalog, useGameCatalog } from '@/hooks/useGameCatalog'
import { SOIREE_VIBES, type SoireeVibe } from '@/lib/soiree/vibes'
import { cn } from '@/lib/utils'

/**
 * « Mode Soirée » : tous les jeux qui peuvent y entrer, avec pour chacun s'il y
 * est (ajouter ou sortir un jeu) et les ambiances (Apéro tranquille, Ça monte,
 * Grosse soirée) où le tirage peut le choisir (GET/PATCH /api/admin/game-vibes).
 * Tant que l'équipe n'a rien coché, un jeu suit son niveau « Fait boire » ; un
 * super admin coche ou décoche, UNE case à la fois, un geste = un enregistrement.
 * Hors du Mode Soirée, un jeu garde ses ambiances (estompées, inactives) pour
 * les retrouver s'il y revient.
 *
 * Panneau AUTONOME comme le catalogue : chargé à l'ouverture, rechargé à la
 * main. Après chaque écriture, la réponse du serveur REMPLACE les lignes
 * (jamais d'état local deviné) et le catalogue de cet appareil est redemandé
 * pour que la Soirée de l'équipier suive tout de suite.
 *
 * Les écritures partent EN FILE, une à la fois et dans l'ordre : des clics sur
 * des lignes différentes ne se perdent pas, et la dernière réponse est la plus
 * fraîche. Une ligne n'accepte qu'un geste à la fois : l'état à envoyer d'un
 * bouton dépend de la réponse du précédent.
 */

type Job = { gameId: string; vibe: SoireeVibe; on: boolean } | { gameId: string; inSoiree: boolean }
type FailureKey = 'saveError' | 'forbidden'

const PILL = 'inline-flex items-center rounded-md border px-1.5 py-px text-[11px] font-medium leading-snug'

/**
 * Colonnes dès lg : jeu (son niveau « Fait boire » dessous), « Dans le Mode Soirée », trois bascules d'ambiance, réglage.
 * Largeurs fixes à droite : alignées d'une ligne à l'autre. La colonne des ambiances s'élargit dès xl, où les noms
 * complets des ambiances remplacent les courts.
 */
const GRID_COLS = 'lg:grid-cols-[minmax(0,1fr)_10rem_20rem_9rem] xl:grid-cols-[minmax(0,1fr)_10rem_30rem_10rem]'

/**
 * `focusGameId` : sous lg, seule la ligne de ce jeu s'affiche (le sélecteur de l'onglet Jeux remplace le long défilement) ;
 * dès lg le tableau complet reste intact. Sans lui, toutes les lignes s'affichent partout.
 */
export function GameVibesPanel({ focusGameId }: { focusGameId?: string } = {}) {
  const t = useTranslations('supervision.gameVibes')
  const tStates = useTranslations('supervision.states')
  const tDrink = useTranslations('common.drinkLevel')
  const gameTitle = useGameTitle()
  const uid = useId()
  const [data, setData] = useState<AdminGameVibesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [failure, setFailure] = useState<FailureKey | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const { drinkLevel: catalogDrinkLevel, hiddenIds: catalogHiddenIds } = useGameCatalog()

  const tRef = useRef(t)
  tRef.current = t
  const titleRef = useRef(gameTitle)
  titleRef.current = gameTitle
  const abortRef = useRef<AbortController | null>(null)
  // Lignes dont un geste est en file ou en cours : verrou de ligne et état occupé.
  const busyRowsRef = useRef(new Set<string>())
  const queueRef = useRef<Job[]>([])
  const runningRef = useRef(false)
  // Un changement du catalogue arrivé pendant un envoi : la lecture est refaite quand la file est vide.
  const reloadAfterQueueRef = useRef(false)

  const publishPending = useCallback(() => setPending(new Set(busyRowsRef.current)), [])

  const load = useCallback(async () => {
    // Une lecture lancée pendant un envoi pourrait répondre après lui et réafficher l'ancien état.
    if (busyRowsRef.current.size > 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch('/api/admin/game-vibes', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      // 403 : session expirée ou grade retiré pendant que l'onglet restait ouvert.
      if (!res.ok) throw new Error(res.status === 403 ? tRef.current('forbidden') : tRef.current('loadError'))
      const parsed = parseAdminGameVibes(body)
      if (!parsed) throw new Error(tRef.current('loadError'))
      setData(parsed)
      setError(null)
      setFailure(null)
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
      const inflight = abortRef.current
      abortRef.current = null
      inflight?.abort()
    }
  }, [load])

  // « Fait boire » et jeux cachés sont réglés dans le catalogue juste au-dessus : le niveau et la pastille « Caché » d'ici en dépendent.
  // Comparaison par valeur : le catalogue de l'appareil est un nouvel objet à chaque réponse du serveur.
  const catalogSignature = useMemo(
    () => JSON.stringify([[...catalogHiddenIds].sort(), Object.entries(catalogDrinkLevel).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]),
    [catalogDrinkLevel, catalogHiddenIds]
  )
  const seenSignatureRef = useRef(catalogSignature)
  useEffect(() => {
    if (seenSignatureRef.current === catalogSignature) return
    seenSignatureRef.current = catalogSignature
    if (busyRowsRef.current.size > 0) reloadAfterQueueRef.current = true
    else void load()
  }, [catalogSignature, load])

  /** Un envoi ; renvoie null s'il a réussi, sinon la raison de l'échec. */
  const run = useCallback(async (job: Job): Promise<FailureKey | null> => {
    try {
      const res = await fetch('/api/admin/game-vibes', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      })
      const parsed = res.ok ? parseAdminGameVibes(await res.json().catch(() => null)) : null
      if (!parsed) return res.status === 403 ? 'forbidden' : 'saveError'
      setData(parsed)
      // La réponse fait foi : l'annonce dit ce que le serveur a retenu, pas ce qu'on a demandé.
      const saved = parsed.games.find((g) => g.id === job.gameId)
      if (saved) {
        const game = titleRef.current(job.gameId)
        setAnnouncement(
          'vibe' in job
            ? tRef.current(saved.vibes.includes(job.vibe) ? 'announceOn' : 'announceOff', {
                game,
                vibe: tRef.current(`vibes.${job.vibe}`),
              })
            : tRef.current(saved.inSoiree ? 'announceIn' : 'announceOut', { game })
        )
      }
      void refreshGameCatalog()
      return null
    } catch {
      return 'saveError'
    }
  }, [])

  const drain = useCallback(async () => {
    runningRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift()!
        const reason = await run(job)
        busyRowsRef.current.delete(job.gameId)
        if (reason) {
          setFailure(reason)
          // Plus d'accès : les gestes suivants échoueraient de même, on les abandonne.
          if (reason === 'forbidden') {
            for (const rest of queueRef.current.splice(0)) busyRowsRef.current.delete(rest.gameId)
          }
        }
        publishPending()
      }
    } finally {
      runningRef.current = false
    }
    if (reloadAfterQueueRef.current) {
      reloadAfterQueueRef.current = false
      void load()
    }
  }, [load, publishPending, run])

  const enqueue = useCallback(
    (gameId: string, job: Job) => {
      if (busyRowsRef.current.has(gameId)) return
      busyRowsRef.current.add(gameId)
      publishPending()
      // Le message d'un échec reste affiché jusqu'au prochain geste : c'est ici que ce geste l'efface.
      setFailure(null)
      setAnnouncement('')
      abortRef.current?.abort()
      abortRef.current = null
      setLoading(false)
      queueRef.current.push(job)
      if (!runningRef.current) void drain()
    },
    [drain, publishPending]
  )

  const toggle = (row: AdminGameVibesRow, vibe: SoireeVibe) =>
    enqueue(row.id, { gameId: row.id, vibe, on: !row.vibes.includes(vibe) })

  const toggleSoiree = (row: AdminGameVibesRow) => enqueue(row.id, { gameId: row.id, inSoiree: !row.inSoiree })

  const busyAny = pending.size > 0

  const refreshButton = (
    <button
      type="button"
      onClick={() => void load()}
      aria-busy={loading}
      aria-disabled={busyAny}
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-medium text-cream/80 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:h-8 sm:px-2.5"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'motion-safe:animate-spin')} aria-hidden />
      {t('refresh')}
    </button>
  )

  const counts = data ? vibeCounts(data.games) : null
  const inSoireeCounts = data ? soireeCounts(data.games) : null

  return (
    <SectionCard icon={PartyPopper} title={t('title')} description={t('desc')} actions={refreshButton}>
      {error ? (
        <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load()} />
      ) : !data || !counts || !inSoireeCounts ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-3">
          <p role="status" className="sr-only">
            {announcement}
          </p>
          <div className="space-y-2 text-xs text-cream/70">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-cream">{t('inSoireeCount', { count: inSoireeCounts.inSoiree })}</span>
              {inSoireeCounts.hiddenInSoiree > 0 && <span>{t('hiddenInSoiree', { count: inSoireeCounts.hiddenInSoiree })}</span>}
            </p>
            <p>{t('rule')}</p>
            <ul className="flex flex-wrap gap-1.5">
              {SOIREE_VIBES.map((vibe) => (
                <li key={vibe} className={cn(PILL, 'border-gold/30 bg-felt-deep/60 text-gold')}>
                  {t('count', { vibe: t(`vibes.${vibe}`), count: counts[vibe] })}
                </li>
              ))}
            </ul>
            {!data.canEdit && <p>{t('readOnly')}</p>}
          </div>

          {failure && (
            <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100">
              {t(failure)}
            </p>
          )}

          <div
            aria-hidden
            className={cn('hidden gap-x-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-cream/70 lg:grid', GRID_COLS)}
          >
            <span>{t('colGame')}</span>
            <span>{t('colSoiree')}</span>
            <span>{t('colVibes')}</span>
            <span>{t('colSetting')}</span>
          </div>

          {focusGameId !== undefined && !data.games.some((g) => g.id === focusGameId) && (
            <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-cream/80 lg:hidden">{t('notCandidate')}</p>
          )}

          <ul
            className={cn(
              'lg:space-y-0 lg:divide-y lg:divide-white/5 lg:rounded-xl lg:border lg:border-white/10 lg:bg-black/20',
              // Les lignes écartées restent dans le DOM : leur marge ne doit pas décaler la ligne affichée.
              focusGameId === undefined && 'space-y-2'
            )}
          >
            {data.games.map((row) => {
              const title = gameTitle(row.id)
              const busy = pending.has(row.id)
              const offFocus = focusGameId !== undefined && row.id !== focusGameId
              const drinkWord = tDrink(`levels.${row.drinkLevel}`)
              const change = soireeChange(row)
              return (
                <li
                  key={row.id}
                  className={cn(
                    offFocus ? 'hidden lg:grid' : 'grid',
                    'grid-cols-1 items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-black/20 p-3',
                    'lg:rounded-none lg:border-0 lg:bg-transparent lg:py-2.5',
                    GRID_COLS
                  )}
                >
                  <span className="min-w-0 space-y-1">
                    <span className={cn('flex min-w-0 items-center gap-2 text-sm font-medium text-cream', row.hidden && 'opacity-60')}>
                      <span aria-hidden>
                        <GameIconById id={row.id} surface="feltGold" className="h-6 w-6 shrink-0" />
                      </span>
                      <span className="min-w-0 truncate" title={title}>
                        {title}
                      </span>
                      {row.hidden && (
                        <span className={cn(PILL, 'shrink-0 border-rose-500/25 bg-rose-500/[0.06] text-rose-100')}>{t('hidden')}</span>
                      )}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold leading-none text-amber-100"
                      title={tDrink('aria', { level: drinkWord })}
                    >
                      <span className="font-medium text-cream/70">{t('colDrink')}</span>
                      <DrinkLevelGauge level={row.drinkLevel} />
                      <span aria-hidden>{drinkWord}</span>
                      <span className="sr-only">{tDrink('aria', { level: drinkWord })}</span>
                    </span>
                  </span>

                  <span className="block min-w-0 space-y-1.5">
                    {data.canEdit ? (
                      <button
                        type="button"
                        aria-pressed={row.inSoiree}
                        aria-label={t('inSoireeAria', { game: title })}
                        aria-disabled={busy}
                        onClick={() => toggleSoiree(row)}
                        className={cn(
                          'inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-colors lg:h-8',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                          row.inSoiree
                            ? 'border-gold/50 bg-gold/[0.15] text-cream'
                            : 'border-white/20 bg-white/5 text-cream/80 hover:bg-white/10 hover:text-cream'
                        )}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />
                        ) : (
                          row.inSoiree && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        <span className="truncate">{t('inSoiree')}</span>
                      </button>
                    ) : (
                      <span className={cn(PILL, row.inSoiree ? 'border-gold/30 bg-felt-deep/60 text-gold' : 'border-white/10 bg-white/5 text-cream/80')}>
                        {row.inSoiree ? t('inSoiree') : t('outOfSoiree')}
                      </span>
                    )}
                    {change && (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-cream/70">
                        <span className={cn(PILL, 'border-gold/50 bg-gold/[0.15] text-cream')}>{t(change === 'added' ? 'added' : 'removed')}</span>
                        <span>{t(change === 'added' ? 'defaultOut' : 'defaultIn')}</span>
                      </span>
                    )}
                  </span>

                  <span className={cn('block min-w-0 transition-opacity', !row.inSoiree && 'opacity-60')}>
                    {data.canEdit && !row.inSoiree && (
                      <span id={`${uid}-need-${row.id}`} className="sr-only">
                        {t('vibesNeedSoiree')}
                      </span>
                    )}
                    {data.canEdit ? (
                      <span
                        role="group"
                        aria-label={t('group', { game: title })}
                        className="grid grid-cols-3 gap-0.5 rounded-lg border border-white/[0.15] bg-black/20 p-0.5"
                      >
                        {SOIREE_VIBES.map((vibe) => {
                          const on = row.vibes.includes(vibe)
                          return (
                            <button
                              key={vibe}
                              type="button"
                              aria-pressed={on}
                              aria-disabled={busy || !row.inSoiree}
                              aria-label={t(`vibes.${vibe}`)}
                              aria-describedby={row.inSoiree ? undefined : `${uid}-need-${row.id}`}
                              title={row.inSoiree ? t(`vibes.${vibe}`) : t('vibesNeedSoiree')}
                              onClick={() => {
                                if (row.inSoiree) toggle(row, vibe)
                              }}
                              className={cn(
                                'inline-flex h-11 min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-semibold leading-none transition-colors lg:h-8',
                                // Hors soirée, c'est déjà le conteneur qui estompe : une seconde atténuation rendrait l'état coché illisible.
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 aria-disabled:cursor-not-allowed',
                                busy && 'opacity-50',
                                on
                                  ? 'border-gold/50 bg-gold/[0.15] text-cream'
                                  : 'border-transparent text-cream/70 hover:bg-white/10 hover:text-cream'
                              )}
                            >
                              {on && <Check className="h-3 w-3 shrink-0" aria-hidden />}
                              <span aria-hidden className="truncate sm:hidden lg:inline xl:hidden">
                                {t(`vibesShort.${vibe}`)}
                              </span>
                              <span aria-hidden className="hidden truncate sm:inline lg:hidden xl:inline">
                                {t(`vibes.${vibe}`)}
                              </span>
                            </button>
                          )
                        })}
                      </span>
                    ) : (
                      row.vibes.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5">
                          {row.vibes.map((vibe) => (
                            <li key={vibe} className={cn(PILL, 'border-gold/30 bg-felt-deep/60 text-gold')}>
                              {t(`vibes.${vibe}`)}
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </span>

                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-cream/70 lg:block lg:space-y-1">
                    {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />}
                    {!row.inSoiree ? (
                      <span>{t('outNote')}</span>
                    ) : isModifiedVibes(row) ? (
                      <>
                        <span className={cn(PILL, 'border-gold/50 bg-gold/[0.15] text-cream')}>{t('modified')}</span>
                        <span className="block">
                          {t('defaultWas', {
                            vibes:
                              row.defaultVibes.length > 0
                                ? row.defaultVibes.map((vibe) => t(`vibes.${vibe}`)).join(', ')
                                : t('noVibe'),
                          })}
                        </span>
                      </>
                    ) : (
                      <span>{t('isDefault')}</span>
                    )}
                    {row.inSoiree && row.vibes.length === 0 && <span className="block text-rose-100">{t('noneNote')}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
