"use client"

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Copy, Crown, Globe, LogOut, Play, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { GAMES, type GameMeta } from '@/lib/games'
import { cn } from '@/lib/utils'

interface GameOnlineLobbyProps {
  gameId: string
  game?: GameMeta
}

/** Difficultés Petit Buveur (mêmes clés/couleurs que la sélection en local). */
const PB_DIFFICULTIES = ['facile', 'normal', 'difficile', 'extreme'] as const
const PB_DIFFICULTY_GRADIENT: Record<(typeof PB_DIFFICULTIES)[number], string> = {
  facile: 'from-emerald-500 to-green-600 shadow-emerald-500/30',
  normal: 'from-amber-500 to-yellow-600 shadow-amber-500/30',
  difficile: 'from-orange-500 to-red-600 shadow-orange-500/30',
  extreme: 'from-red-600 to-rose-700 shadow-red-500/30',
}

export function GameOnlineLobby({ gameId, game: gameProp }: GameOnlineLobbyProps) {
  const game = gameProp ?? GAMES.find((g) => g.id === gameId)
  const { user } = useAuth()
  const { room, loading, error, setError, createRoom, joinRoom, leaveRoom, setReady, launchGame, updateSettings } = useOnlineRoom()
  const { lobbies } = useOpenLobbies()
  const [copied, setCopied] = useState(false)
  const tPb = useTranslations('games.petit-buveur.page')

  const gameLobbies = lobbies.filter((l) => l.gameId === gameId)
  const isHost = room?.hostUserId === user?.id
  const inThisGameRoom = room?.gameId === gameId
  const selfMember = room?.members.find((m) => m.isSelf)

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
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <p className="text-sm text-amber-100">Connectez-vous pour jouer en ligne.</p>
        <Button asChild className="mt-3 bg-amber-500 text-black hover:bg-amber-400">
          <Link href="/compte">Se connecter</Link>
        </Button>
      </div>
    )
  }

  // Pas encore dans un lobby pour ce jeu
  if (!inThisGameRoom || room?.status !== 'waiting') {
    const wrongRoom = Boolean(room && room.gameId !== gameId)

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-center">
          <Globe className="mx-auto mb-2 h-8 w-8 text-violet-300" />
          <h2 className="text-lg font-semibold text-white">Lobby en ligne — {game?.title}</h2>
          <p className="mt-1 text-sm text-white/55">
            Créez un lobby ou rejoignez une partie en attente.
          </p>
        </div>

        {wrongRoom && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Vous êtes dans le lobby « {GAMES.find((g) => g.id === room?.gameId)?.title} ».
            <Button variant="ghost" size="sm" className="ml-2 text-amber-200" onClick={() => leaveRoom()}>
              Quitter
            </Button>
          </div>
        )}

        {!wrongRoom && (
          <Button
            onClick={() => createRoom(gameId)}
            disabled={loading}
            className="w-full bg-violet-600 py-6 text-lg font-bold text-white hover:bg-violet-500"
          >
            {loading ? 'Création…' : 'Créer un lobby'}
          </Button>
        )}

        {gameLobbies.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/45">
              Lobbies ouverts pour ce jeu
            </p>
            <ul className="space-y-2">
              {gameLobbies.map((lobby) => (
                <li
                  key={lobby.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div>
                    <span className="font-mono font-bold text-white">{lobby.code}</span>
                    <p className="text-xs text-white/45">
                      {lobby.hostName} · {lobby.memberCount} joueur{lobby.memberCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading || wrongRoom}
                    onClick={() => joinRoom({ roomId: lobby.id })}
                    className="border-white/15 text-white"
                  >
                    Rejoindre
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-center text-sm text-red-300">{error}</p>}
      </div>
    )
  }

  // Dans le lobby en attente
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-300/70">Lobby {game?.title}</p>
          <p className="font-mono text-3xl font-bold tracking-[0.25em] text-white">{room.code}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copyCode} className="border-white/15 text-white">
            <Copy className="mr-1 h-4 w-4" />
            {copied ? 'Copié !' : 'Code'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => leaveRoom()} className="text-white/50 hover:text-red-300">
            <LogOut className="mr-1 h-4 w-4" />
            Quitter
          </Button>
        </div>
      </div>

      {gameId === 'petit-buveur' && (
        <div>
          <p className="mb-3 text-sm font-semibold text-white/70">{tPb('difficulty')}</p>
          <div className="grid grid-cols-2 gap-2">
            {PB_DIFFICULTIES.map((value) => {
              const active = (room.settings.difficulty ?? 'normal') === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ difficulty: value })}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-left transition-all disabled:cursor-not-allowed',
                    active
                      ? `border-transparent bg-gradient-to-r ${PB_DIFFICULTY_GRADIENT[value]} text-white shadow-lg`
                      : 'border-white/10 bg-white/5 text-white/60',
                    isHost && !active && 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="block text-sm font-bold">{tPb(`difficulties.${value}.label`)}</span>
                  <span className={cn('mt-0.5 block text-xs', active ? 'text-white/80' : 'text-white/35')}>
                    {tPb(`difficulties.${value}.desc`)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
          <Users className="h-4 w-4 text-violet-300" />
          Joueurs ({room.members.length})
        </div>
        <ul className="space-y-2">
          {room.members.map((m) => (
            <li
              key={m.userId}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3',
                m.isReady ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <span className="text-lg">{m.isHost ? '👑' : '🌐'}</span>
              <div className="flex-1">
                <p className="font-medium text-white">
                  {m.displayName}
                  {m.isSelf && <span className="ml-1 text-xs text-white/40">(vous)</span>}
                </p>
                <p className="text-xs text-white/45">{m.isReady ? 'Prêt' : 'Pas encore prêt'}</p>
              </div>
              {m.isHost && <Crown className="h-4 w-4 text-amber-400" />}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          onClick={() => setReady(!selfMember?.isReady)}
          variant="outline"
          className={cn(
            'w-full border-white/15 py-5 text-base',
            selfMember?.isReady ? 'bg-emerald-500/15 text-emerald-200' : 'text-white hover:bg-white/10'
          )}
        >
          {selfMember?.isReady ? '✓ Je suis prêt — annuler' : 'Me déclarer prêt'}
        </Button>

        {isHost ? (
          <Button
            onClick={() => launchGame()}
            disabled={!room.canLaunch || loading}
            className="w-full bg-amber-500 py-5 text-lg font-bold text-black hover:bg-amber-400 disabled:opacity-40"
          >
            <Play className="mr-2 h-5 w-5" />
            {room.canLaunch
              ? 'Lancer la partie'
              : room.members.length < 2
                ? 'En attente de joueurs (min. 2)'
                : `En attente (${room.members.filter((m) => m.isReady).length}/${room.members.length} prêts)`}
          </Button>
        ) : (
          <p className="text-center text-sm text-white/50">
            En attente que {room.members.find((m) => m.isHost)?.displayName} lance la partie…
          </p>
        )}
      </div>

      {error && <p className="text-center text-sm text-red-300">{error}</p>}
    </div>
  )
}
