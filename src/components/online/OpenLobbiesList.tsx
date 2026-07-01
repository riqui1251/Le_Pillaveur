"use client"

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, Globe, Users } from 'lucide-react'
import { GAMES } from '@/lib/games'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { Button } from '@/components/ui/button'
import { GameIconById } from '@/components/hub/GameIconById'

export function OpenLobbiesList() {
  const router = useRouter()
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
      <div className="mb-6 flex items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/5 py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
      </div>
    )
  }

  if (lobbies.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-dashed border-violet-500/25 bg-violet-500/5 p-5 text-center">
        <Globe className="mx-auto mb-2 h-7 w-7 text-violet-300/60" />
        <p className="text-sm font-medium text-white/75">Aucun lobby ouvert pour l&apos;instant</p>
        <p className="mt-1 text-xs text-white/45">
          Choisissez un jeu ci-dessous pour en créer un.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-200">
        <Globe className="h-4 w-4" />
        Lobbies ouverts ({lobbies.length})
      </div>

      {Array.from(byGame.entries()).map(([gameId, gameLobbies]) => {
        const game = GAMES.find((g) => g.id === gameId)
        return (
          <div key={gameId} className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 backdrop-blur-md">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10">
                <GameIconById id={gameId} className="h-3.5 w-3.5 text-violet-200" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
                {game?.title ?? gameId}
              </p>
            </div>
            <ul className="space-y-2">
              {gameLobbies.map((lobby) => {
                const readyCount = lobby.members.filter((m) => m.isReady).length
                return (
                  <li
                    key={lobby.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition-colors hover:border-violet-400/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm">
                        👑
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
                          {lobby.memberCount} joueur{lobby.memberCount > 1 ? 's' : ''}
                          <span>·</span>
                          {readyCount}/{lobby.memberCount} prêt{readyCount > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={joining}
                      onClick={() => handleJoin(lobby.id, lobby.gameId)}
                      className="shrink-0 rounded-xl bg-violet-600 text-white hover:bg-violet-500"
                    >
                      Rejoindre
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
