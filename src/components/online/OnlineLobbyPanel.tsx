"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Crown, Globe, LogOut, Play, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { GAMES } from '@/lib/games'
import { cn } from '@/lib/utils'

interface OnlineLobbyPanelProps {
  gameId: string
  /** Affiché dans le bandeau quand la partie est lancée */
  compact?: boolean
}

/** Lobby en ligne intégré à la page de sélection (difficulté, etc.) */
export function OnlineLobbyPanel({ gameId, compact }: OnlineLobbyPanelProps) {
  const { user } = useAuth()
  const { room, loading, error, setError, createRoom, joinRoom, leaveRoom, setReady, launchGame } =
    useOnlineRoom()
  const { lobbies } = useOpenLobbies()
  const [copied, setCopied] = useState(false)

  const game = GAMES.find((g) => g.id === gameId)
  const gameLobbies = lobbies.filter((l) => l.gameId === gameId)
  const isHost = room?.hostUserId === user?.id
  const inThisGameRoom = room?.gameId === gameId
  const selfMember = room?.members.find((m) => m.isSelf)
  const isPlaying = inThisGameRoom && room?.status === 'playing'

  useEffect(() => {
    if (room && room.gameId !== gameId && room.status === 'waiting') {
      setError('Vous êtes dans un lobby pour un autre jeu. Quittez-le pour continuer.')
    }
  }, [room, gameId, setError])

  const copyCode = () => {
    if (!room?.code) return
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!user) {
    return (
      <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
        <p className="text-sm text-amber-100">Connectez-vous pour jouer en ligne.</p>
        <Button asChild className="mt-2 bg-amber-500 text-black hover:bg-amber-400" size="sm">
          <Link href="/compte">Se connecter</Link>
        </Button>
      </div>
    )
  }

  if (isPlaying && compact) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <p className="text-sm font-medium text-emerald-200">Partie en cours — lobby {room.code}</p>
        <span className="text-xs text-white/45">{room.members.length} joueurs</span>
      </div>
    )
  }

  if (!inThisGameRoom || room?.status !== 'waiting') {
    const wrongRoom = Boolean(room && room.gameId !== gameId)

    return (
      <div className="mb-4 space-y-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-violet-300" />
          <div>
            <p className="text-sm font-semibold text-white">Multijoueur en ligne</p>
            <p className="text-xs text-white/50">Créez ou rejoignez un lobby pour {game?.title}</p>
          </div>
        </div>

        {wrongRoom && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Lobby « {GAMES.find((g) => g.id === room?.gameId)?.title} » en cours.
            <Button variant="ghost" size="sm" className="ml-1 h-7 text-amber-200" onClick={() => leaveRoom()}>
              Quitter
            </Button>
          </div>
        )}

        {!wrongRoom && (
          <Button
            onClick={() => createRoom(gameId)}
            disabled={loading}
            className="w-full bg-violet-600 py-5 text-base font-bold text-white hover:bg-violet-500"
          >
            {loading ? 'Création…' : 'Créer un lobby'}
          </Button>
        )}

        {gameLobbies.length > 0 && (
          <ul className="space-y-1.5">
            {gameLobbies.map((lobby) => (
              <li
                key={lobby.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div>
                  <span className="font-mono text-sm font-bold text-white">{lobby.code}</span>
                  <p className="text-[11px] text-white/45">
                    {lobby.hostName} · {lobby.memberCount} joueur{lobby.memberCount > 1 ? 's' : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || wrongRoom}
                  onClick={() => joinRoom({ roomId: lobby.id })}
                  className="h-8 border-white/15 text-xs text-white"
                >
                  Rejoindre
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-center text-xs text-red-300">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-violet-300/70">Lobby en ligne</p>
          <p className="font-mono text-2xl font-bold tracking-[0.2em] text-white">{room.code}</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={copyCode} className="h-8 border-white/15 text-white">
            <Copy className="mr-1 h-3.5 w-3.5" />
            {copied ? 'Copié' : 'Code'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => leaveRoom()}
            className="h-8 text-white/50 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/60">
          <Users className="h-3.5 w-3.5 text-violet-300" />
          Joueurs ({room.members.length})
        </div>
        <ul className="space-y-1.5">
          {room.members.map((m) => (
            <li
              key={m.userId}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2',
                m.isReady ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <span className="text-base">{m.isHost ? '👑' : '🌐'}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {m.displayName}
                  {m.isSelf && <span className="ml-1 text-[10px] text-white/40">(vous)</span>}
                </p>
                <p className="text-[10px] text-white/45">{m.isReady ? 'Prêt' : 'En attente…'}</p>
              </div>
              {m.isHost && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => setReady(!selfMember?.isReady)}
          variant="outline"
          className={cn(
            'w-full border-white/15 py-4 text-sm',
            selfMember?.isReady ? 'bg-emerald-500/15 text-emerald-200' : 'text-white hover:bg-white/10'
          )}
        >
          {selfMember?.isReady ? '✓ Prêt — annuler' : 'Me déclarer prêt'}
        </Button>

        {isHost ? (
          <Button
            onClick={() => launchGame()}
            disabled={!room.canLaunch || loading}
            className="w-full bg-amber-500 py-4 text-base font-bold text-black hover:bg-amber-400 disabled:opacity-40"
          >
            <Play className="mr-2 h-4 w-4" />
            {room.canLaunch
              ? 'Lancer la partie'
              : room.members.length < 2
                ? 'Min. 2 joueurs'
                : `En attente (${room.members.filter((m) => m.isReady).length}/${room.members.length} prêts)`}
          </Button>
        ) : (
          <p className="text-center text-xs text-white/50">
            En attente que {room.members.find((m) => m.isHost)?.displayName} lance la partie…
          </p>
        )}
      </div>

      {error && <p className="text-center text-xs text-red-300">{error}</p>}
    </div>
  )
}
