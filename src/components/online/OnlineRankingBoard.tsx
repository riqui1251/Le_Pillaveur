"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Beer } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useLocalizedGames } from '@/lib/games-i18n'
import { cn } from '@/lib/utils'

/**
 * Classement des jeux EN LIGNE (comptes) : victoires / défaites / parties / %.
 * Les gorgées n'entrent pas en compte. Données servies par
 * GET /api/online/rankings — top 50 + ma ligne même hors du top.
 */

/** Jeux classés (mêmes ids que le registre serveur — liste UI ordonnée). */
const RANKED_GAME_IDS = [
  'petit-buveur',
  'toucher-coule',
  'menteur',
  'imposteur',
  'quiz',
  'loup-garou',
] as const

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

type RankingsResponse = {
  rows: RankingRow[]
  me: RankingRow | null
  totalPlayers: number
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
        'flex items-center gap-2.5 rounded-xl border px-3 py-2.5',
        isMe
          ? 'border-amber-400/40 bg-amber-500/10'
          : 'border-white/[0.07] bg-white/[0.03]'
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
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-white/50">
        {row.games}
      </span>
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

export function OnlineRankingBoard() {
  const t = useTranslations('ranking.online')
  const { user } = useAuth()
  const games = useLocalizedGames()
  const [gameId, setGameId] = useState<string>('all')
  const [data, setData] = useState<RankingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/online/rankings?gameId=${gameId}`, {
          credentials: 'include',
        })
        if (cancelled) return
        if (res.status === 401) {
          setNeedsLogin(true)
          setData(null)
          return
        }
        const json = (await res.json()) as RankingsResponse
        if (!cancelled) {
          setNeedsLogin(false)
          setData(json)
        }
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameId])

  const rankedGames = RANKED_GAME_IDS.map((id) => games.find((g) => g.id === id)).filter(
    (g): g is NonNullable<typeof g> => Boolean(g)
  )
  const meInTop = Boolean(data?.me && data.rows.some((r) => r.userId === data.me?.userId))

  if (needsLogin) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/50">
        {t('loginRequired')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtre par jeu */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setGameId('all')}
          className={cn(
            'rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
            gameId === 'all'
              ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
              : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white/80'
          )}
        >
          🌐 {t('filterAll')}
        </button>
        {rankedGames.map((g) => (
          <button
            key={g.id}
            onClick={() => setGameId(g.id)}
            className={cn(
              'rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
              gameId === g.id
                ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white/80'
            )}
          >
            {g.emoji} {g.title}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center">
          <Beer className="mx-auto mb-2 h-7 w-7 text-amber-300/60" />
          <p className="text-sm text-white/50">{t('empty')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          {/* En-têtes de colonnes */}
          <div className="mb-1.5 flex items-center gap-2.5 px-3 text-[10px] font-semibold uppercase tracking-wide text-white/35">
            <span className="w-7 shrink-0" />
            <span className="shrink-0 w-[1.125rem]" />
            <span className="min-w-0 flex-1">{t('colPlayer')}</span>
            <span className="shrink-0 text-emerald-300/70">{t('colWins')}</span>
            <span className="shrink-0 text-red-300/60">{t('colLosses')}</span>
            <span className="w-10 shrink-0 text-right">{t('colGames')}</span>
            <span className="w-11 shrink-0 text-right">%</span>
          </div>
          <div className="space-y-1.5">
            {data.rows.map((row) => (
              <RowCard
                key={row.userId}
                row={row}
                isMe={row.userId === user?.id}
                youLabel={t('you')}
                minGames={data.minGamesForRate}
              />
            ))}
            {data.me && !meInTop && (
              <>
                <p className="pt-1 text-center text-[10px] text-white/30">⋯</p>
                <RowCard row={data.me} isMe youLabel={t('you')} minGames={data.minGamesForRate} />
              </>
            )}
          </div>
          <p className="mt-3 px-3 text-[10px] text-white/30">
            {t('minGamesHint', { min: data.minGamesForRate })}
          </p>
        </div>
      )}
    </div>
  )
}
