"use client"

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Beer } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { GameIconById } from '@/components/hub/GameIconById'
import { MedalDot } from '@/components/online/MedalDot'
import { OnlinePlayerIcon } from '@/components/online/OnlinePlayerTag'
import { RankingSectionHeader } from '@/components/soiree/SiteDrinkRanking'
import { Button } from '@/components/ui/button'
import { useLocalizedGames } from '@/lib/games-i18n'
import type { DrinkRankingBoard, DrinkRankingRow, DrinkRankingsResponse } from '@/lib/online/drink-rankings'
import { cn } from '@/lib/utils'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: DrinkRankingsResponse }

function readResponse(json: unknown): DrinkRankingsResponse | null {
  if (!json || typeof json !== 'object') return null
  const { boards, signedIn, top } = json as Partial<DrinkRankingsResponse>
  if (!Array.isArray(boards) || typeof signedIn !== 'boolean' || typeof top !== 'number') return null
  return { boards, signedIn, top }
}

function DrinkRowCard({ row, isMe }: { row: DrinkRankingRow; isMe: boolean }) {
  const t = useTranslations('ranking.online')
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-3 py-2',
        isMe ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/[0.07] bg-white/[0.03]'
      )}
    >
      <span className="flex w-7 shrink-0 items-center justify-center">
        {row.position <= 3 ? (
          <MedalDot position={row.position} />
        ) : (
          <span className="text-sm font-medium text-white/40">{row.position}</span>
        )}
      </span>
      <OnlinePlayerIcon icon={row.preferences.icon} className="h-6 w-6 shrink-0 bg-white/10 text-white/80" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {row.displayName ?? t('hiddenName')}
        {isMe && <span className="ml-1.5 text-xs text-amber-300/80">({t('you')})</span>}
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums text-amber-300">{row.drinks}</span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/50">{row.games}</span>
    </div>
  )
}

function DrinkBoardCard({ board, title, viewerId }: { board: DrinkRankingBoard; title: string; viewerId: string | undefined }) {
  const t = useTranslations('ranking.drinks')
  const me = board.me
  const meInTop = Boolean(me && board.rows.some((r) => r.userId === me.userId))
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <GameIconById id={board.gameId} surface="feltGold" className="h-5 w-5 shrink-0" />
        <h3 className="min-w-0 truncate text-sm font-semibold text-white/80">{title}</h3>
        <span className="ml-auto shrink-0 text-xs text-white/40">{t('accounts', { count: board.totalPlayers })}</span>
      </div>
      <div className="space-y-1.5">
        {board.rows.map((row) => (
          <DrinkRowCard key={row.userId} row={row} isMe={row.userId === viewerId} />
        ))}
        {me && !meInTop && (
          <>
            <p aria-hidden className="text-center text-xs leading-none text-white/30">⋯</p>
            <DrinkRowCard row={me} isMe />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * « Les plus gros buveurs en ligne » : par jeu en ligne, le top des comptes
 * aux gorgées bues, puis sa propre ligne si on est hors du top. Les
 * visiteurs voient les rangs et les chiffres, sans pseudo.
 */
export function OnlineDrinkBoards() {
  const t = useTranslations('ranking.drinks')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors.page')
  const { user } = useAuth()
  const games = useLocalizedGames()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  const fetchBoards = useCallback(async (signal?: AbortSignal) => {
    setLoad({ status: 'loading' })
    try {
      const response = await fetch('/api/online/rankings/drinks', { credentials: 'include', signal })
      const data = response.ok ? readResponse(await response.json()) : null
      if (!signal?.aborted) setLoad(data ? { status: 'ready', data } : { status: 'error' })
    } catch {
      if (!signal?.aborted) setLoad({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchBoards(controller.signal)
    return () => controller.abort()
  }, [fetchBoards])

  const data = load.status === 'ready' ? load.data : null

  return (
    <section className="space-y-3" aria-labelledby="stats-players" aria-busy={load.status === 'loading'}>
      <RankingSectionHeader id="stats-players" title={t('playersTitle')} lead={t('playersLead')} />

      <div aria-live="polite" className="space-y-3">
        {load.status === 'loading' && (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
            <span className="sr-only">{tCommon('loading')}</span>
          </div>
        )}

        {load.status === 'error' && (
          <div className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4">
            <p className="text-cream/70">{t('error')}</p>
            <Button variant="quiet" size="game" onClick={() => void fetchBoards()}>
              {tErrors('retry')}
            </Button>
          </div>
        )}

        {data && data.boards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/[0.15] bg-white/[0.02] px-6 py-10 text-center">
            <Beer aria-hidden className="mx-auto mb-2 h-7 w-7 text-amber-300/60" />
            <p className="text-sm text-white/50">{t('empty')}</p>
          </div>
        )}

        {data && data.boards.length > 0 && (
          <>
            {!data.signedIn && (
              <p className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-xs leading-snug text-amber-100/90">
                {t('loginForNames')}
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {data.boards.map((board) => (
                <DrinkBoardCard
                  key={board.gameId}
                  board={board}
                  title={games.find((g) => g.id === board.gameId)?.title ?? board.gameId}
                  viewerId={data.signedIn ? user?.id : undefined}
                />
              ))}
            </div>
            <p className="px-1 text-xs text-cream/50">{t('legend')}</p>
          </>
        )}
      </div>
    </section>
  )
}
