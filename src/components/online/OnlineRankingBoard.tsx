"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Beer, ChevronDown, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useLocalizedGames } from '@/lib/games-i18n'
import { cn } from '@/lib/utils'

/**
 * Classement des jeux EN LIGNE : classement général (tous jeux confondus)
 * puis un TOP 5 par jeu. Un joueur hors podium voit sa propre ligne avec sa
 * position réelle sous le top. Les gorgées ne comptent pas.
 */

/** Jeux classés (mêmes ids que le registre serveur — ordre d'affichage). */
const RANKED_GAME_IDS = [
  'petit-buveur',
  'toucher-coule',
  'menteur',
  'imposteur',
  'quiz',
  'loup-garou',
] as const

/**
 * Doit rester égal à RANKING_OVERVIEW_TOP côté serveur
 * (src/lib/online/rankings.ts) — dupliqué ici pour ne PAS importer ce
 * module côté client (il tire tout le registre serveur des jeux).
 */
const OVERVIEW_TOP = 5

type RankingRow = {
  userId: string
  displayName: string
  preferences: { icon?: string }
  wins: number
  losses: number
  games: number
  winRate: number
  position: number
}

type RankingBoard = {
  gameId: string | null
  rows: RankingRow[]
  me: RankingRow | null
  totalPlayers: number
}

type OverviewResponse = {
  general: RankingBoard
  perGame: RankingBoard[]
  minGamesForRate: number
}

const MEDALS = ['🥇', '🥈', '🥉']

function RowCard({
  row,
  isMe,
  youLabel,
  minGames,
}: {
  row: RankingRow
  isMe: boolean
  youLabel: string
  minGames: number
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-3 py-2',
        isMe ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/[0.07] bg-white/[0.03]'
      )}
    >
      <span className="w-7 shrink-0 text-center text-base">
        {row.position <= 3 ? (
          MEDALS[row.position - 1]
        ) : (
          <span className="text-sm font-medium text-white/40">{row.position}</span>
        )}
      </span>
      <span className="shrink-0 text-lg" aria-hidden>
        {row.preferences.icon ?? '👤'}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {row.displayName}
        {isMe && <span className="ml-1.5 text-xs text-amber-300/80">({youLabel})</span>}
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-300">{row.wins}</span>
      <span className="shrink-0 text-sm font-bold tabular-nums text-red-300/80">{row.losses}</span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/50">{row.games}</span>
      <span
        className={cn(
          'w-11 shrink-0 text-right text-sm font-semibold tabular-nums',
          row.games >= minGames ? 'text-amber-300' : 'text-white/30'
        )}
      >
        {row.winRate}%
      </span>
    </div>
  )
}

function BoardCard({
  icon,
  title,
  board,
  /** Valeur du `?gameId=` à interroger pour le classement complet ('all' pour le général). */
  fullGameId,
  emptyLabel,
  youLabel,
  minGames,
  viewerId,
  highlight,
}: {
  icon: React.ReactNode
  title: string
  board: RankingBoard | null
  fullGameId: string
  emptyLabel: string
  youLabel: string
  minGames: number
  viewerId: string | undefined
  highlight?: boolean
}) {
  const t = useTranslations('ranking.online')
  const [expanded, setExpanded] = useState(false)
  const [full, setFull] = useState<{ rows: RankingRow[]; me: RankingRow | null } | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)

  const rows = expanded && full ? full.rows : board?.rows ?? []
  const me = expanded && full ? full.me : board?.me ?? null
  const meInTop = Boolean(me && rows.some((r) => r.userId === me?.userId))
  const canExpand = (board?.totalPlayers ?? 0) > OVERVIEW_TOP

  const toggleExpanded = async () => {
    if (!expanded && !full) {
      setLoadingFull(true)
      try {
        const res = await fetch(`/api/online/rankings?gameId=${fullGameId}`, {
          credentials: 'include',
        })
        if (res.ok) {
          const json = (await res.json()) as { rows: RankingRow[]; me: RankingRow | null }
          setFull(json)
        }
      } finally {
        setLoadingFull(false)
      }
    }
    setExpanded((v) => !v)
  }

  return (
    <div
      className={cn(
        'rounded-2xl border p-3',
        highlight ? 'border-amber-400/25 bg-amber-500/[0.04]' : 'border-white/10 bg-white/[0.03]'
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('text-base', highlight && 'text-amber-300')}>{icon}</span>
        <h2 className="text-sm font-semibold text-white/80">{title}</h2>
        {board && board.totalPlayers > 0 && (
          <span className="ml-auto text-[10px] text-white/30">{board.totalPlayers}</span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/35">
          {emptyLabel}
        </p>
      ) : (
        <>
          <div
            className={cn(
              'space-y-1.5',
              expanded && 'max-h-80 overflow-y-auto overscroll-contain pr-1'
            )}
          >
            {rows.map((row) => (
              <RowCard
                key={row.userId}
                row={row}
                isMe={row.userId === viewerId}
                youLabel={youLabel}
                minGames={minGames}
              />
            ))}
            {me && !meInTop && (
              <>
                <p className="text-center text-[10px] leading-none text-white/30">⋯</p>
                <RowCard row={me} isMe youLabel={youLabel} minGames={minGames} />
              </>
            )}
          </div>
          {canExpand && (
            <button
              onClick={() => void toggleExpanded()}
              disabled={loadingFull}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white/70 disabled:opacity-50"
            >
              {loadingFull ? (
                t('loadingMore')
              ) : (
                <>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                  {expanded ? t('showLess') : t('showFull')}
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function OnlineRankingBoard() {
  const t = useTranslations('ranking.online')
  const { user } = useAuth()
  const games = useLocalizedGames()
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/online/rankings/overview', { credentials: 'include' })
        if (cancelled) return
        if (res.status === 401) {
          setNeedsLogin(true)
          return
        }
        const json = (await res.json()) as OverviewResponse
        if (!cancelled) setData(json)
      } catch {
        // Réseau : on reste sur l'état vide.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (needsLogin) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/50">
        {t('loginRequired')}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    )
  }

  const minGames = data?.minGamesForRate ?? 5
  const noneRecorded = !data || data.general.totalPlayers === 0

  if (noneRecorded) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center">
        <Beer className="mx-auto mb-2 h-7 w-7 text-amber-300/60" />
        <p className="text-sm text-white/50">{t('empty')}</p>
      </div>
    )
  }

  const boardFor = (gameId: string): RankingBoard | null =>
    data.perGame.find((b) => b.gameId === gameId) ?? null

  return (
    <div className="space-y-4">
      {/* Classement général — tous jeux confondus */}
      <BoardCard
        icon={<Trophy className="h-4 w-4" />}
        title={t('generalTitle')}
        board={data.general}
        fullGameId="all"
        emptyLabel={t('emptyGame')}
        youLabel={t('you')}
        minGames={minGames}
        viewerId={user?.id}
        highlight
      />

      {/* Top 5 par jeu */}
      <div className="grid gap-4 lg:grid-cols-2">
        {RANKED_GAME_IDS.map((id) => {
          const game = games.find((g) => g.id === id)
          return (
            <BoardCard
              key={id}
              icon={<span>{game?.emoji ?? '🎮'}</span>}
              title={game?.title ?? id}
              board={boardFor(id)}
              fullGameId={id}
              emptyLabel={t('emptyGame')}
              youLabel={t('you')}
              minGames={minGames}
              viewerId={user?.id}
            />
          )
        })}
      </div>

      <p className="px-1 text-[10px] text-white/30">
        {t('legend')} — {t('minGamesHint', { min: minGames })}
      </p>
    </div>
  )
}
