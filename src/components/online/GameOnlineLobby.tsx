"use client"

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ArrowLeft, Copy, Check, Crown, Globe, Lock, Mail, LogOut, Play, Users, UserPlus, Tv } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { useFriends } from '@/hooks/useFriends'
import { GAMES, type GameMeta } from '@/lib/games'
import { GameIconById } from '@/components/hub/GameIconById'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
import { RejoinBanner } from '@/components/online/RejoinBanner'
import { JoinQR } from '@/components/tv/JoinQR'
import { cn } from '@/lib/utils'

const VISIBILITY_OPTIONS = ['public', 'private', 'invite'] as const
type Visibility = (typeof VISIBILITY_OPTIONS)[number]
const VISIBILITY_ICON: Record<Visibility, typeof Globe> = { public: Globe, private: Lock, invite: Mail }

interface GameOnlineLobbyProps {
  gameId: string
  game?: GameMeta
}

/** Fond dégradé + conteneur centré partagé par tous les écrans du lobby (parité visuelle avec le pré-jeu local). */
function LobbyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-amber-600/10 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/10 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-lg px-4 py-8 pb-12">{children}</div>
    </div>
  )
}

/** Formats d'équipes Toucher-Coulé. */
const TC_MODE_OPTIONS = ['1v1', '2v2', '3v3'] as const
const TC_PLAYERS_PER_TEAM: Record<(typeof TC_MODE_OPTIONS)[number], number> = {
  '1v1': 1,
  '2v2': 2,
  '3v3': 3,
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
  const { room, loading, error, setError, createRoom, joinRoom, leaveRoom, setReady, launchGame, updateSettings, setTeam, inviteFriend } = useOnlineRoom()
  const { lobbies } = useOpenLobbies()
  const { friends, incoming, outgoing, sendRequestToUser, acceptRequest } = useFriends()
  const [copied, setCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())
  const [showTv, setShowTv] = useState(false)
  const tTv = useTranslations('tv')
  const locale = useLocale()
  const tPb = useTranslations('games.petit-buveur.page')
  const tTc = useTranslations('games.toucher-coule.lobby')
  const tQuiz = useTranslations('games.quiz.lobby')
  const tLg = useTranslations('games.loup-garou.lobby')
  const tOnline = useTranslations('onlineLobby')
  const tFriends = useTranslations('account.friends')

  const gameLobbies = lobbies.filter((l) => l.gameId === gameId)
  const isHost = room?.hostUserId === user?.id
  const inThisGameRoom = room?.gameId === gameId
  const selfMember = room?.members.find((m) => m.isSelf)
  const visibility = (room?.visibility ?? 'public') as Visibility

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

  const handleJoinByCode = () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) return
    void joinRoom({ code })
  }

  const handleInviteFriend = async (friendUserId: string) => {
    const ok = await inviteFriend(friendUserId)
    if (ok) setInvitedIds((prev) => new Set(prev).add(friendUserId))
  }

  if (!user) {
    return (
      <LobbyShell>
        <div className="rounded-3xl border border-amber-500/20 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30">
            <GameIconById id={gameId} className="h-8 w-8 text-white" />
          </div>
          <p className="text-sm text-white/70">Connectez-vous pour jouer en ligne.</p>
          <Button asChild className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-5 text-base font-bold text-white shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-500">
            <Link href="/compte">Se connecter</Link>
          </Button>
        </div>
      </LobbyShell>
    )
  }

  // Pas encore dans un lobby pour ce jeu
  if (!inThisGameRoom || room?.status !== 'waiting') {
    const wrongRoom = Boolean(room && room.gameId !== gameId)

    return (
      <LobbyShell>
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/jeux"
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
            <Globe className="h-3 w-3" /> En ligne
          </span>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30">
            <GameIconById id={gameId} className="h-9 w-9 text-white" />
          </div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-white">{game?.title}</h1>
          <p className="text-sm text-white/50">Créez un lobby ou rejoignez une partie en attente.</p>
        </div>

        {wrongRoom && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span>Vous êtes dans le lobby « {GAMES.find((g) => g.id === room?.gameId)?.title} ».</span>
            <Button variant="ghost" size="sm" className="text-amber-200 hover:bg-amber-500/15 hover:text-amber-100" onClick={() => leaveRoom()}>
              Quitter
            </Button>
          </div>
        )}

        {!wrongRoom && (
          <>
            <Button
              onClick={() => createRoom(gameId)}
              disabled={loading}
              className="mb-4 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-6 text-lg font-bold text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50"
            >
              {loading ? 'Création…' : 'Créer un lobby'}
            </Button>

            <div className="mb-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
                {tOnline('joinByCode.label')}
              </p>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinByCode()
                  }}
                  placeholder={tOnline('joinByCode.placeholder')}
                  maxLength={6}
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-lg font-bold tracking-[0.2em] text-white placeholder:text-white/25 placeholder:tracking-normal focus:border-violet-400/50 focus:outline-none"
                />
                <Button
                  onClick={handleJoinByCode}
                  disabled={loading || joinCode.trim().length !== 6}
                  className="shrink-0 rounded-2xl border border-white/15 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/20"
                >
                  {tOnline('joinByCode.submit')}
                </Button>
              </div>
            </div>

            <RejoinBanner onJoin={(roomId) => joinRoom({ roomId })} joining={loading} />
            <FriendInviteBanner onJoin={(roomId) => joinRoom({ roomId })} joining={loading} />
          </>
        )}

        {gameLobbies.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-violet-300/70">
              Lobbies ouverts pour ce jeu
            </p>
            <ul className="space-y-2">
              {gameLobbies.map((lobby) => (
                <li
                  key={lobby.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition-colors hover:border-violet-400/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm">
                      👑
                    </span>
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-bold tracking-wider text-white">{lobby.code}</span>
                      <p className="truncate text-xs text-white/45">
                        {lobby.hostName} · {lobby.memberCount} joueur{lobby.memberCount > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={loading || wrongRoom}
                    onClick={() => joinRoom({ roomId: lobby.id })}
                    className="shrink-0 rounded-xl bg-violet-600 text-white hover:bg-violet-500"
                  >
                    Rejoindre
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}
      </LobbyShell>
    )
  }

  // Dans le lobby en attente
  return (
    <LobbyShell>
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => leaveRoom()}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-all hover:bg-white/20 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Quitter
        </button>
        <span className="flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
          <Globe className="h-3 w-3" /> En ligne
        </span>
      </div>

      <div className="mb-4 overflow-hidden rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-600/20 via-white/5 to-transparent text-center shadow-2xl backdrop-blur-md">
        <div className="px-6 pb-5 pt-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-violet-300/80">
            Lobby {game?.title}
          </p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em] text-white">{room.code}</p>
        </div>
        <button
          onClick={copyCode}
          className="flex w-full items-center justify-center gap-2 border-t border-white/10 bg-black/20 py-3 text-sm font-semibold text-white/80 transition-all hover:bg-black/30 hover:text-white"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Code copié !' : 'Copier le code'}
        </button>
      </div>

      {/* Mode TV : afficher la partie sur une télé */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setShowTv((v) => !v)}
          aria-expanded={showTv}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:text-white"
        >
          <Tv className="h-4 w-4 text-violet-300" />
          {tTv('modeTv')}
        </button>
        {showTv && (
          <div className="flex flex-col items-center gap-3 border-t border-white/10 px-4 py-4 text-center">
            <p className="text-xs leading-relaxed text-white/60">{tTv('modeTvHint')}</p>
            <JoinQR
              url={`${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/jeux?join=${room.code}`}
              size={128}
            />
            <p className="text-[11px] text-white/40">{tTv('scanToJoin')}</p>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-violet-300/70">
          {tOnline('visibility.title')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {VISIBILITY_OPTIONS.map((value) => {
            const active = visibility === value
            const Icon = VISIBILITY_ICON[value]
            return (
              <button
                key={value}
                type="button"
                disabled={!isHost}
                onClick={() => updateSettings({ visibility: value })}
                title={tOnline(`visibility.${value}Desc`)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all disabled:cursor-not-allowed',
                  active
                    ? 'border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg'
                    : 'border-white/10 bg-white/5 text-white/60',
                  isHost && !active && 'hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-bold">{tOnline(`visibility.${value}`)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {isHost && visibility !== 'public' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-violet-300/70">
            {tOnline('invites.inviteFriend')}
          </p>
          {friends.length === 0 ? (
            <p className="text-sm text-white/40">{tOnline('invites.noFriendsToInvite')}</p>
          ) : (
            <ul className="space-y-2">
              {friends
                .filter((f) => !room.members.some((m) => m.userId === f.userId))
                .map((f) => {
                  const invited = invitedIds.has(f.userId)
                  return (
                    <li
                      key={f.userId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', f.isOnline ? 'bg-emerald-400' : 'bg-white/20')} />
                        <span className="truncate text-sm font-medium text-white">{f.displayName}</span>
                      </div>
                      <button
                        type="button"
                        disabled={invited}
                        onClick={() => handleInviteFriend(f.userId)}
                        aria-label={tOnline('invites.inviteFriend')}
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                          invited ? 'bg-white/10 text-white/40' : 'bg-violet-600 text-white hover:bg-violet-500'
                        )}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {invited ? tOnline('invites.pending') : tOnline('invites.inviteFriend')}
                      </button>
                    </li>
                  )
                })}
            </ul>
          )}
        </div>
      )}

      {gameId === 'toucher-coule' && (() => {
        const tcMode = (room.settings.tcMode ?? '1v1') as (typeof TC_MODE_OPTIONS)[number]
        const perTeam = TC_PLAYERS_PER_TEAM[tcMode]
        const teams = room.settings.tcTeams ?? {}
        const myTeam = user ? teams[user.id] : undefined
        const teamMembers = (team: 'A' | 'B') =>
          room.members.filter((m) => teams[m.userId] === team).slice(0, perTeam)
        return (
          <>
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-sky-300/70">
                {tTc('mode')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {TC_MODE_OPTIONS.map((value) => {
                  const active = tcMode === value
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!isHost}
                      onClick={() => updateSettings({ tcMode: value })}
                      title={tTc(`modes.${value}.desc`)}
                      className={cn(
                        'rounded-xl border px-2 py-3 text-center transition-all disabled:cursor-not-allowed',
                        active
                          ? 'border-transparent bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-500/25'
                          : 'border-white/10 bg-white/5 text-white/60',
                        isHost && !active && 'hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <span className="block text-sm font-bold">{tTc(`modes.${value}.label`)}</span>
                      <span className={cn('mt-0.5 block text-[10px] leading-tight', active ? 'text-white/80' : 'text-white/35')}>
                        {tTc(`modes.${value}.desc`)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-sky-300/70">
                {tTc('teams')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((team) => {
                  const inTeam = teamMembers(team)
                  const slots = Array.from({ length: perTeam })
                  const isMine = myTeam === team
                  return (
                    <div
                      key={team}
                      className={cn(
                        'rounded-xl border p-2.5',
                        team === 'A' ? 'border-sky-400/25 bg-sky-500/10' : 'border-rose-400/25 bg-rose-500/10'
                      )}
                    >
                      <p className={cn('mb-2 text-xs font-bold', team === 'A' ? 'text-sky-300' : 'text-rose-300')}>
                        {team === 'A' ? tTc('teamA') : tTc('teamB')}
                      </p>
                      <ul className="mb-2 space-y-1">
                        {slots.map((_, i) => {
                          const member = inTeam[i]
                          return (
                            <li
                              key={i}
                              className={cn(
                                'truncate rounded-lg px-2 py-1 text-xs',
                                member ? 'bg-black/25 font-medium text-white' : 'bg-white/5 text-white/35'
                              )}
                            >
                              {member
                                ? `${member.preferences?.icon ? `${member.preferences.icon} ` : ''}${member.displayName}`
                                : tTc('botSlot')}
                            </li>
                          )
                        })}
                      </ul>
                      {!isMine && (
                        <button
                          type="button"
                          onClick={() => setTeam(team)}
                          className={cn(
                            'w-full rounded-lg py-1.5 text-xs font-semibold text-white transition-colors',
                            team === 'A' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-rose-600 hover:bg-rose-500'
                          )}
                        >
                          {tTc('joinTeam')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-white/40">{tTc('botsFill')}</p>
            </div>
          </>
        )
      })()}

      {gameId === 'petit-buveur' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            {tPb('difficulty')}
          </p>
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

      {/* Nombre de bots ajoutés (hôte) : permet de lancer sous le minimum d'humains. */}
      {game?.botsFillable && (() => {
        const botsCount = Math.max(0, room.settings.botsCount ?? 0)
        const maxBots = Math.max(0, (game.maxPlayers ?? 12) - room.members.length)
        return (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">🤖 {tOnline('botsFill.title')}</p>
                <p className="mt-0.5 text-[11px] text-white/45">
                  {tOnline('botsFill.hint', { min: game.minPlayers ?? 2 })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-2 py-1.5">
                <button
                  type="button"
                  disabled={!isHost || botsCount <= 0}
                  onClick={() => updateSettings({ botsCount: botsCount - 1 })}
                  className="game-grid-cell flex h-8 w-8 items-center justify-center rounded-lg bg-white/8 text-lg font-black text-white transition-colors hover:bg-white/15 disabled:opacity-30"
                  aria-label="-1 bot"
                >
                  −
                </button>
                <span className="w-6 text-center text-lg font-black tabular-nums text-white">
                  {botsCount}
                </span>
                <button
                  type="button"
                  disabled={!isHost || botsCount >= maxBots}
                  onClick={() => updateSettings({ botsCount: botsCount + 1 })}
                  className="game-grid-cell flex h-8 w-8 items-center justify-center rounded-lg bg-white/8 text-lg font-black text-white transition-colors hover:bg-white/15 disabled:opacity-30"
                  aria-label="+1 bot"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {gameId === 'quiz' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-cyan-400/70">
            {tQuiz('questionCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[10, 15, 20].map((value) => {
              const active = (room.settings.quizCount ?? 10) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ quizCount: value })}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-center transition-all disabled:cursor-not-allowed',
                    active
                      ? 'border-transparent bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg'
                      : 'border-white/10 bg-white/5 text-white/60',
                    isHost && !active && 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                    {tQuiz('questions')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'loup-garou' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-indigo-400/70">
            {tLg('debate')}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => {
              const active = (room.settings.lgDebateMin ?? 3) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ lgDebateMin: value })}
                  className={cn(
                    'rounded-xl border px-2 py-3 text-center transition-all disabled:cursor-not-allowed',
                    active
                      ? 'border-transparent bg-gradient-to-r from-slate-600 to-indigo-500 text-white shadow-lg'
                      : 'border-white/10 bg-white/5 text-white/60',
                    isHost && !active && 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block text-[9px]', active ? 'text-white/80' : 'text-white/35')}>
                    {tLg('minutes')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/45">
          <Users className="h-3.5 w-3.5 text-violet-300" />
          Joueurs ({room.members.length})
        </div>
        <ul className="space-y-2">
          {room.members.map((m) => {
            const isFriend = friends.some((f) => f.userId === m.userId)
            const incomingReq = incoming.find((r) => r.userId === m.userId)
            const outgoingPending = outgoing.some((r) => r.userId === m.userId)
            return (
              <li
                key={m.userId}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                  m.isReady ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-black/20'
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base">
                  {m.preferences?.icon ?? (m.isHost ? '👑' : '🌐')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">
                    {m.displayName}
                    {m.isSelf && <span className="ml-1 text-xs text-white/40">(vous)</span>}
                  </p>
                  <p className={cn('text-xs', m.isReady ? 'text-emerald-300/80' : 'text-white/45')}>
                    {m.isReady ? '✓ Prêt' : 'Pas encore prêt'}
                  </p>
                </div>
                {!m.isSelf && (
                  isFriend ? (
                    <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {tFriends('alreadyFriend')}
                    </span>
                  ) : incomingReq ? (
                    <button
                      type="button"
                      onClick={() => acceptRequest(incomingReq.id)}
                      className="shrink-0 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
                    >
                      {tFriends('accept')}
                    </button>
                  ) : outgoingPending ? (
                    <span className="shrink-0 text-[10px] text-white/35">{tFriends('requestSent')}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendRequestToUser(m.userId)}
                      aria-label={tFriends('sendRequest')}
                      title={tFriends('sendRequest')}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-violet-500/15 hover:text-violet-300"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  )
                )}
                {m.isHost && <Crown className="h-4 w-4 shrink-0 text-amber-400" />}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          onClick={() => setReady(!selfMember?.isReady)}
          className={cn(
            'w-full rounded-2xl border py-5 text-base font-semibold transition-all',
            selfMember?.isReady
              ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20'
              : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
          )}
        >
          {selfMember?.isReady ? '✓ Je suis prêt — annuler' : 'Me déclarer prêt'}
        </Button>

        {isHost ? (
          <Button
            onClick={() => launchGame()}
            disabled={!room.canLaunch || loading}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-5 text-lg font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="mr-2 h-5 w-5" />
            {(() => {
              // Minimum PAR JEU (affichage — la vérité serveur est dans le
              // registre game-adapters, synchronisée par test avec GAMES).
              // Les bots ajoutés comptent dans le total.
              const meta = GAMES.find((g) => g.id === gameId)
              const bots = meta?.botsFillable ? Math.max(0, room.settings.botsCount ?? 0) : 0
              const minPlayers = Math.max(1, (meta?.minPlayers ?? 2) - bots)
              return room.canLaunch
                ? 'Lancer la partie'
                : room.members.length < minPlayers
                  ? `En attente de joueurs (min. ${minPlayers})`
                  : `En attente (${room.members.filter((m) => m.isReady).length}/${room.members.length} prêts)`
            })()}
          </Button>
        ) : (
          <p className="text-center text-sm text-white/50">
            En attente que {room.members.find((m) => m.isHost)?.displayName} lance la partie…
          </p>
        )}
      </div>

      {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}
    </LobbyShell>
  )
}
