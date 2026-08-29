"use client"

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Crown, Globe, Users } from 'lucide-react'
import { GAMES } from '@/lib/games'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { Button } from '@/components/ui/button'
import { GameIconById } from '@/components/hub/GameIconById'

export function OpenLobbiesList() {
  const router = useRouter()
  const t = useTranslations('onlineLobby')
  const { lobbies, loading } = useOpenLobbies()
  const { joinRoom, loading: joining } = useOnlineRoom()

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

  if (loading && lobbies.length === 0) {
    return (
      <div className="mb-4 flex items-center justify-center rounded-xl border border-gold/15 py-2.5">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    )
  }

  if (lobbies.length === 0) {
    // Une ligne discrète suffit : l'absence de lobby n'est pas un événement,
    // les cartes de jeux en dessous sont la vraie invitation à l'action.
    return (
      <p className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-gold/20 px-4 py-2.5 text-xs text-white/55">
        <Globe className="h-3.5 w-3.5 shrink-0 text-gold/60" aria-hidden />
        {t('list.empty')}
      </p>
    )
  }

  return (
    <div className="mb-6 space-y-4">
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
    </div>
  )
}
