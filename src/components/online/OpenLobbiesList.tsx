"use client"

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Crown, Globe, Users } from 'lucide-react'
import { GAMES } from '@/lib/games'
import type { LiveGameItem } from '@/lib/online-room'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { Button } from '@/components/ui/button'
import { GameIconById } from '@/components/hub/GameIconById'
import { RecentLaunchesPanel } from '@/components/online/RecentLaunchesPanel'

/** Nombre de pseudos montrés par jeu avant de basculer sur « +N ». */
const LIVE_NAMES_SHOWN = 4

/** Pastille « ça joue en ce moment » — rouge d'enseigne, discrète mais vivante. */
export function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-suit-red/60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-suit-red" />
    </span>
  )
}

/**
 * Parties EN COURS, regroupées par jeu. Purement informatif : une partie
 * lancée ne se rejoint pas (le serveur répond `game_already_started`), donc
 * ni bouton « Rejoindre », ni code de table ici.
 * Les tables privées n'apparaissent que dans `total` — jamais leur jeu, leurs
 * joueurs ou leur code.
 */
export function LiveGamesPanel({ games, total }: { games: LiveGameItem[]; total: number }) {
  const t = useTranslations('onlineLobby')

  const byGame = useMemo(() => {
    const map = new Map<string, LiveGameItem[]>()
    for (const item of games) {
      const list = map.get(item.gameId) ?? []
      list.push(item)
      map.set(item.gameId, list)
    }
    // Le jeu le plus animé en tête.
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [games])

  // Honnêteté : ce qui n'est pas détaillé (tables privées, débordement du
  // plafond) reste compté, mais annoncé comme tel.
  const hidden = Math.max(0, total - games.length)

  if (total <= 0) return null

  return (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/60 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2">
        <LiveDot />
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/80">
          {t('live.title', { count: total })}
        </p>
        <span aria-hidden className="h-px flex-1 bg-gold/15" />
      </div>

      {byGame.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {byGame.map(([gameId, items]) => {
            const game = GAMES.find((g) => g.id === gameId)
            const players = items.flatMap((item) => item.playerNames)
            const shown = players.slice(0, LIVE_NAMES_SHOWN)
            const extra = items.reduce((sum, item) => sum + item.playerCount, 0) - shown.length
            const freshest = items.reduce(
              (min, item) => Math.min(min, item.openedAgoMinutes),
              Number.MAX_SAFE_INTEGER
            )
            return (
              <li
                key={gameId}
                className="flex items-center gap-3 rounded-xl border border-gold/10 bg-felt/40 px-3 py-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-gold/10">
                  <GameIconById id={gameId} className="h-4 w-4 text-gold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">
                    <span className="truncate">{game?.title ?? gameId}</span>
                    {items.length > 1 && (
                      <span className="shrink-0 rounded-full border border-gold/20 bg-gold/10 px-1.5 py-px text-[10px] font-medium text-gold">
                        {t('live.tables', { count: items.length })}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-white/45">
                    {shown.join(' · ')}
                    {extra > 0 && ` +${extra}`}
                    {shown.length > 0 && ' · '}
                    {freshest < 1 ? t('live.justOpened') : t('live.openedAgo', { minutes: freshest })}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hidden > 0 && (
        <p className="mt-2 text-[11px] text-white/40">{t('live.more', { count: hidden })}</p>
      )}
      <p className="mt-2 text-[11px] text-white/35">{t('live.notJoinable')}</p>
    </section>
  )
}

export function OpenLobbiesList() {
  const router = useRouter()
  const t = useTranslations('onlineLobby')
  const { lobbies, liveGames, liveGamesTotal, recentLaunches, loading } = useOpenLobbies()
  const { joinRoom, loading: joining, error } = useOnlineRoom()

  const byGame = useMemo(() => {
    const map = new Map<string, typeof lobbies>()
    for (const lobby of lobbies) {
      const list = map.get(lobby.gameId) ?? []
      list.push(lobby)
      map.set(lobby.gameId, list)
    }
    return map
  }, [lobbies])

  const handleJoin = async (roomId: string, gameId: string) => {
    const room = await joinRoom({ roomId })
    if (room) {
      const game = GAMES.find((g) => g.id === gameId)
      if (game) router.push(game.path)
    }
  }

  if (loading && lobbies.length === 0 && liveGamesTotal === 0 && recentLaunches.length === 0) {
    return (
      <div className="mb-4 flex items-center justify-center rounded-xl border border-gold/15 py-2.5">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    )
  }

  // Un seul rendu, y compris quand personne n'attend ET que personne ne joue :
  // la ligne discrète ci-dessous suffit alors (surtout pas un « 0 partie en
  // cours » qui souligne le vide), mais la rangée des derniers lancements doit
  // rester visible — c'est précisément l'écran vide qu'elle est là pour
  // démentir. Un retour anticipé la court-circuitait.
  return (
    <div className="mb-6 space-y-4">
      <LiveGamesPanel games={liveGames} total={liveGamesTotal} />

      {error && <p className="text-sm text-red-300">{error}</p>}

      {lobbies.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gold/20 px-4 py-2.5 text-xs text-white/55">
          <Globe className="h-3.5 w-3.5 shrink-0 text-gold/60" aria-hidden />
          {t('list.empty')}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <Globe className="h-4 w-4" />
            {t('list.title', { count: lobbies.length })}
          </div>

          {Array.from(byGame.entries()).map(([gameId, gameLobbies]) => {
            const game = GAMES.find((g) => g.id === gameId)
            return (
              <div key={gameId} className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 backdrop-blur-md">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10">
                    <GameIconById id={gameId} className="h-3.5 w-3.5 text-amber-200" />
                  </span>
                  <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/80">
                    {game?.title ?? gameId}
                  </p>
                </div>
                <ul className="space-y-2">
                  {gameLobbies.map((lobby) => {
                    const readyCount = lobby.members.filter((m) => m.isReady).length
                    return (
                      <li
                        key={lobby.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/10 bg-felt-deep/60 px-4 py-3 transition-colors hover:border-amber-400/30"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/20 bg-gold/10">
                            <Crown className="h-4 w-4 text-amber-300" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold tracking-wider text-white">
                                {lobby.code}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-white/45">
                                <Crown className="h-3 w-3 text-amber-400" />
                                {lobby.hostName}
                              </span>
                            </div>
                            <p className="mt-1 flex items-center gap-2 text-xs text-white/50">
                              <Users className="h-3 w-3" />
                              {t('playersCount', { count: lobby.memberCount })}
                              <span>·</span>
                              {t('readyCount', { ready: readyCount, total: lobby.memberCount })}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={joining}
                          onClick={() => handleJoin(lobby.id, lobby.gameId)}
                          className="shrink-0 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-400 hover:to-amber-500"
                        >
                          {t('join')}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </>
      )}

      <RecentLaunchesPanel items={recentLaunches} />
    </div>
  )
}
