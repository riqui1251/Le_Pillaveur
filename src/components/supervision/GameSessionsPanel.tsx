'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, History, Inbox } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { EmptyState, Pager, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { GameIconById } from '@/components/hub/GameIconById'
import { formatPresenceDuration, type DurationUnits } from '@/lib/format-presence'
import type { DurationReliability, GameSessionRow } from '@/lib/online/game-sessions'
import { PARIS_TIME_ZONE } from '@/lib/paris-time'
import { cn } from '@/lib/utils'

/**
 * « Parties lancées » : le journal des parties, en Supervision.
 *
 * Panneau AUTONOME, volontairement hors de la boucle de rafraîchissement de
 * 15 s (F40) — comme les indicateurs de croissance. Il se charge à l'ouverture
 * de l'onglet puis quand l'exploitant change de page : une partie d'il y a
 * deux heures n'a aucune raison d'être relue toutes les 15 secondes.
 *
 * Le détail des participants voyage avec la page mais ne s'affiche qu'au clic :
 * la liste reste lisible, et une table de 10 joueurs ne noie pas les autres.
 * Chaque compte y mène à sa fiche ; `userId` restreint le journal à un compte.
 */

const PAGE_SIZE = 20

/**
 * Premier jour du journal, recopié de GAME_JOURNAL_SINCE
 * (src/lib/online/game-sessions.ts, non importable ici : ce module-là charge
 * Prisma). Date historique, elle ne bouge plus.
 */
const GAME_JOURNAL_SINCE_DAY = '2026-09-10'

const RELIABILITY_STYLES: Record<DurationReliability, string> = {
  reliable: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  estimated: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  unknown: 'border-white/15 bg-white/[0.04] text-white/55',
}

/**
 * Ce que vaut une durée de table : sûre (fin de partie ou revanche), estimée
 * (table quittée, fermée par le staff ou abandonnée) ou inconnue (fin non
 * enregistrée, lignes antérieures au motif de fin). Partagé avec la fiche compte.
 */
export function DurationReliabilityBadge({ reliability }: { reliability: DurationReliability }) {
  const t = useTranslations('supervision.gameSessions.reliability')
  const style = RELIABILITY_STYLES[reliability]
  // Réponse d'un serveur antérieur au motif de fin : pas de badge.
  if (!style) return null
  return (
    <span
      title={t(`${reliability}Hint`)}
      className={cn('inline-flex shrink-0 items-center rounded-md border px-1.5 py-px text-[10px] font-medium', style)}
    >
      {t(reliability)}
    </span>
  )
}

const RELIABILITIES: DurationReliability[] = ['reliable', 'estimated', 'unknown']

/**
 * Légende VISIBLE des badges de durée : leur explication n'était que dans un
 * attribut `title`, hors de portée au toucher. Repliée par défaut pour ne pas
 * alourdir le panneau ; partagée avec la fiche compte.
 */
export function DurationReliabilityLegend() {
  const t = useTranslations('supervision.gameSessions.reliability')
  return (
    <details className="group min-w-0 text-[11px] leading-snug text-white/50">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-white/55 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
        {t('legendTitle')}
      </summary>
      <ul className="mt-1.5 space-y-1">
        {RELIABILITIES.map((reliability) => (
          <li key={reliability} className="flex min-w-0 items-start gap-2">
            <DurationReliabilityBadge reliability={reliability} />
            <span className="min-w-0">{t(`${reliability}Hint`)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Durée de table affichée : « ≈ » devant une fin estimée, « ? » pour une fin
 * inconnue que rien ne date (fermée à son début). Une ligne ancienne à la
 * fiabilité inconnue garde sa durée brute, le badge dit ce qu'elle vaut.
 */
export function tableDurationLabel(
  durationSeconds: number,
  reliability: DurationReliability,
  units: DurationUnits
): string {
  if (reliability === 'unknown' && durationSeconds === 0) return '?'
  const label = formatPresenceDuration(durationSeconds, units)
  return reliability === 'estimated' ? `≈ ${label}` : label
}

export function GameSessionsPanel({ userId }: { userId?: string } = {}) {
  const t = useTranslations('supervision.gameSessions')
  const tStates = useTranslations('supervision.states')
  const tUnits = useTranslations('supervision.units')
  const format = useFormatter()
  const [sessions, setSessions] = useState<GameSessionRow[]>([])
  const [total, setTotal] = useState(0)
  // La page appartient au compte filtré : un autre `userId` repart de la
  // première page, dans le même rendu (sans second chargement).
  const [paging, setPaging] = useState({ userId, page: 1 })
  const page = paging.userId === userId ? paging.page : 1
  const setPage = (next: number) => setPaging({ userId, page: next })
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tRef = useRef(t)
  tRef.current = t
  // Numéro de la dernière requête lancée : une réponse plus ancienne (filtre
  // ou page changés entre-temps) arrive parfois APRÈS la plus récente, et
  // afficherait les parties d'un seul compte sous l'en-tête « toutes ».
  const requestSeq = useRef(0)

  const units: DurationUnits = { s: tUnits('s'), min: tUnits('min'), h: tUnits('h'), d: tUnits('d') }

  const load = useCallback(
    async (nextPage: number) => {
      const seq = ++requestSeq.current
      const isLatest = () => seq === requestSeq.current
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) })
        if (userId) params.set('userId', userId)
        const res = await fetch(`/api/admin/game-sessions?${params.toString()}`, {
          credentials: 'include',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? tRef.current('loadError'))
        if (!isLatest()) return
        setSessions(data.sessions ?? [])
        setTotal(data.total ?? 0)
      } catch (e) {
        if (!isLatest()) return
        setError(e instanceof Error ? e.message : tRef.current('loadError'))
      } finally {
        // Une réponse périmée ne touche à rien, pas même l'indicateur : la
        // requête en cours le garde allumé.
        if (isLatest()) {
          setLoading(false)
          setLoaded(true)
        }
      }
    },
    [userId]
  )

  useEffect(() => {
    void load(page)
  }, [load, page])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const journalSince = t('journalSince', {
    date: format.dateTime(new Date(GAME_JOURNAL_SINCE_DAY), { dateStyle: 'short', timeZone: PARIS_TIME_ZONE }),
  })

  return (
    <SectionCard
      icon={History}
      title={t('title')}
      description={
        <>
          {t('desc')} {journalSince}
          {userId && <span className="block text-amber-200/70">{t('filteredByAccount')}</span>}
        </>
      }
      bodyClassName="space-y-3"
    >
      <DurationReliabilityLegend />
      {!loaded ? (
        <SkeletonRows rows={3} />
      ) : error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : sessions.length === 0 ? (
        <EmptyState icon={Inbox} title={t('empty')} hint={t('emptyHint')} />
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const open = expanded.has(s.id)
            return (
              <li key={s.id} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-expanded={open}
                  className="flex w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  )}
                  <GameIconById id={s.gameId} className="h-4 w-4 shrink-0 text-gold" />
                  <span className="min-w-0 text-sm font-medium text-white">{s.gameTitle}</span>
                  <span className="font-mono text-xs text-white/45">{s.code}</span>
                  <span className="text-xs text-white/45">
                    {format.dateTime(new Date(s.startedAt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: PARIS_TIME_ZONE,
                    })}
                  </span>
                  <span
                    className={cn(
                      'text-xs',
                      s.endedAt === null ? 'font-medium text-green-300' : 'text-white/45'
                    )}
                  >
                    {s.durationSeconds === null
                      ? t('ongoing')
                      : tableDurationLabel(s.durationSeconds, s.durationReliability, units)}
                  </span>
                  {s.endedAt !== null && <DurationReliabilityBadge reliability={s.durationReliability} />}
                  <span className="ml-auto text-xs text-white/55">
                    {t('lineup', {
                      players: s.playerCount,
                      humans: s.humanCount,
                      bots: s.botCount,
                    })}
                  </span>
                </button>

                {open && (
                  <div className="flex flex-wrap gap-1.5 border-t border-white/[0.07] px-3 py-2.5">
                    {s.participants.length === 0 ? (
                      <p className="text-xs text-white/40">{t('noParticipants')}</p>
                    ) : (
                      s.participants.map((p) =>
                        p.kind === 'account' && p.userId ? (
                          // Compte : lien vers sa fiche. Le nom est résolu à la
                          // lecture, jamais recopié dans le journal.
                          <Link
                            key={p.id}
                            href={`/supervision/comptes/${p.userId}`}
                            title={t('openAccount')}
                            className="min-w-0 break-words rounded-lg border border-white/[0.15] bg-white/[0.04] px-2 py-1 text-xs text-white/85 underline-offset-2 transition-colors hover:border-amber-400/40 hover:text-amber-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                          >
                            {p.name}
                          </Link>
                        ) : (
                          <span
                            key={p.id}
                            className={cn(
                              'min-w-0 break-words rounded-lg border px-2 py-1 text-xs',
                              p.kind === 'bot'
                                ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200/85'
                                : 'border-white/10 bg-white/[0.02] italic text-white/40'
                            )}
                          >
                            {p.kind === 'bot' ? p.name : t('deletedAccount')}
                            {p.kind === 'bot' && (
                              <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-300/70">
                                {t('botTag')}
                              </span>
                            )}
                          </span>
                        )
                      )
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPage={setPage}
        busy={loading}
        summary={tStates('pageSummary', {
          page,
          pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
          total,
        })}
        previousLabel={tStates('previousPage')}
        nextLabel={tStates('nextPage')}
      />
    </SectionCard>
  )
}
