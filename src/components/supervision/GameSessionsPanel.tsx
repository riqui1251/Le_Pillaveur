'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, History, Inbox } from 'lucide-react'
import { EmptyState, Pager, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { GameIconById } from '@/components/hub/GameIconById'
import { formatPresenceDuration } from '@/lib/format-presence'
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
 */

const PAGE_SIZE = 20

type Participant = {
  id: string
  kind: 'account' | 'bot' | 'deleted'
  name: string | null
  userId: string | null
}

type SessionRow = {
  id: string
  code: string
  gameId: string
  gameTitle: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  playerCount: number
  humanCount: number
  botCount: number
  participants: Participant[]
}

export function GameSessionsPanel() {
  const t = useTranslations('supervision.gameSessions')
  const tStates = useTranslations('supervision.states')
  const format = useFormatter()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(async (nextPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) })
      const res = await fetch(`/api/admin/game-sessions?${params.toString()}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tRef.current('loadError'))
      setSessions(data.sessions ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : tRef.current('loadError'))
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

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

  return (
    <SectionCard
      icon={History}
      title={t('title')}
      description={t('desc')}
      bodyClassName="space-y-3"
    >
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
              <li key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  )}
                  <GameIconById id={s.gameId} className="h-4 w-4 shrink-0 text-gold" />
                  <span className="text-sm font-medium text-white">{s.gameTitle}</span>
                  <span className="font-mono text-xs text-white/45">{s.code}</span>
                  <span className="text-xs text-white/45">
                    {format.dateTime(new Date(s.startedAt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
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
                      : formatPresenceDuration(s.durationSeconds)}
                  </span>
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
                      s.participants.map((p) => (
                        <span
                          key={p.id}
                          className={cn(
                            'rounded-lg border px-2 py-1 text-xs',
                            p.kind === 'account'
                              ? 'border-white/15 bg-white/[0.04] text-white/85'
                              : p.kind === 'bot'
                                ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200/85'
                                : 'border-white/10 bg-white/[0.02] italic text-white/40'
                          )}
                        >
                          {p.kind === 'deleted' ? t('deletedAccount') : p.name}
                          {p.kind === 'bot' && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-300/70">
                              {t('botTag')}
                            </span>
                          )}
                        </span>
                      ))
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
