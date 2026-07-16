"use client"

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ArrowLeft, ChevronDown, Copy, Check, Crown, Globe, Lock, Mail, LogOut, Play, Plus, Settings, Share2, Users, UserPlus, Tv, Trophy, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { useFriends } from '@/hooks/useFriends'
import { GAMES, type GameMeta } from '@/lib/games'
import { GameIconById } from '@/components/hub/GameIconById'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
import { GameBriefing } from '@/components/online/GameBriefing'
import { RejoinBanner } from '@/components/online/RejoinBanner'
import { OnlinePlayerIcon } from '@/components/online/OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { JoinQR } from '@/components/tv/JoinQR'
import { cn } from '@/lib/utils'
import { imposteurCountFor, maxImposteurCount, IMPOSTEUR_MIN_PLAYERS } from '@/lib/imposteur/engine'

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
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/15 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-amber-600/10 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/10 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-lg px-4 py-8 pb-12">{children}</div>
    </div>
  )
}

/** Position d'un siège autour de la table ovale (siège 0 en haut, sens horaire). */
function seatPos(index: number, count: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count
  return {
    left: `${50 + 42 * Math.cos(angle)}%`,
    top: `${50 + 40 * Math.sin(angle)}%`,
  }
}

/** Formats d'équipes Toucher-Coulé. */
const TC_MODE_OPTIONS = ['1v1', '2v2', '3v3', '4v4'] as const
const TC_PLAYERS_PER_TEAM: Record<(typeof TC_MODE_OPTIONS)[number], number> = {
  '1v1': 1,
  '2v2': 2,
  '3v3': 3,
  '4v4': 4,
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
  const [showSettings, setShowSettings] = useState(false)
  // Choix ouvert/privé proposé au clic « Ouvrir une table » (modifiable
  // ensuite dans les réglages du lobby).
  const [choosingVisibility, setChoosingVisibility] = useState(false)
  useEffect(() => {
    setChoosingVisibility(false)
  }, [room?.id])

  // Partage du lien de la table (boucle virale n°1) : partage natif si
  // disponible (mobile), sinon copie dans le presse-papier. Le lien
  // /jeux?join=CODE fonctionne même pour un ami SANS compte : le code est
  // mémorisé et consommé après son inscription (voir jeux/page.tsx).
  const [linkShared, setLinkShared] = useState(false)
  const shareTableLink = async () => {
    if (!room) return
    const url = `${window.location.origin}/${locale}/jeux?join=${room.code}`
    const gameTitle = game?.title ?? 'Le Pillaveur'
    const text = `Rejoins ma table ${gameTitle} sur Le Pillaveur ! Code : ${room.code}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Le Pillaveur', text, url })
        return
      }
    } catch {
      // Partage annulé par l'utilisateur : ne pas basculer sur la copie.
      return
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setLinkShared(true)
      setTimeout(() => setLinkShared(false), 2000)
    } catch {
      // Presse-papier indisponible — tant pis.
    }
  }
  const [showInvite, setShowInvite] = useState(false)
  const [seatSel, setSeatSel] = useState<string | null>(null)
  const [top5, setTop5] = useState<Map<string, number>>(new Map())
  const tTv = useTranslations('tv')
  const locale = useLocale()
  const tPb = useTranslations('games.petit-buveur.page')
  const tTc = useTranslations('games.toucher-coule.lobby')
  const tQuiz = useTranslations('games.quiz.lobby')
  const tLg = useTranslations('games.loup-garou.lobby')
  const tMenteur = useTranslations('games.menteur.lobby')
  const tImposteur = useTranslations('games.imposteur.lobby')
  const tBluff = useTranslations('games.bluff.lobby')
  const tSf = useTranslations('games.sans-filtre.lobby')
  const tMc = useTranslations('games.mots-codes.lobby')
  const tEspion = useTranslations('games.espion.lobby')
  const tTabou = useTranslations('games.tabou.lobby')
  const tCrobard = useTranslations('games.crobard.lobby')
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

  // Badge « top 5 » : classement de CE jeu, pour repérer d'un coup d'œil les
  // meilleurs joueurs de la table avant de lancer.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/online/rankings?gameId=${gameId}`, { credentials: 'include' })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { rows: { userId: string; position: number }[] }
        if (cancelled) return
        setTop5(new Map(data.rows.slice(0, 5).map((r) => [r.userId, r.position])))
      } catch {
        // Badge purement décoratif : un échec réseau ne doit rien casser.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameId])

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

  // Briefing tuto synchronisé : tout le monde lit les règles avant le début.
  if (inThisGameRoom && room && room.status === 'briefing') {
    return (
      <LobbyShell>
        <GameBriefing room={room} gameId={gameId} />
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
          <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
            <Globe className="h-3 w-3" /> En ligne
          </span>
        </div>

        {/* Guichet : la carte du jeu tient sur une ligne — l'écran sert à
            REJOINDRE (code, tables ouvertes) ; créer attend en zone pouce. */}
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#D8CCAE] bg-cream px-3 py-2.5 text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#24201A]/15 bg-[#24201A]/5">
            <GameIconById id={gameId} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold leading-tight">{game?.title}</h1>
            <p className="text-[11px] text-[#6B6455]">
              {game?.minPlayers ?? 2}
              {game?.maxPlayers && game.maxPlayers < 20 ? `-${game.maxPlayers}` : '+'} joueurs
            </p>
          </div>
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
            <RejoinBanner onJoin={(roomId) => joinRoom({ roomId })} joining={loading} />
            <FriendInviteBanner onJoin={(roomId) => joinRoom({ roomId })} joining={loading} />

            <div className="mb-5">
              <p className="mb-2 flex items-center gap-2 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/75">
                {tOnline('joinByCode.label')}
                <span aria-hidden className="h-px flex-1 bg-gold/15" />
              </p>
              <div className="flex gap-2">
                {/* Cases façon OTP : un input invisible par-dessus, les cases
                    ne font qu'afficher — gros caractères, saisie directe. */}
                <div className="relative flex min-w-0 flex-1 gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={cn(
                        'flex h-12 flex-1 items-center justify-center rounded-xl border font-display text-xl font-black',
                        joinCode[i]
                          ? 'border-gold/40 bg-felt-deep/70 text-white'
                          : 'border-gold/20 bg-felt-deep/50 text-white/20'
                      )}
                    >
                      {joinCode[i] ?? '•'}
                    </span>
                  ))}
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJoinByCode()
                    }}
                    aria-label={tOnline('joinByCode.label')}
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={6}
                    className="absolute inset-0 h-full w-full cursor-text opacity-0"
                  />
                </div>
                <Button
                  onClick={handleJoinByCode}
                  disabled={loading || joinCode.trim().length !== 6}
                  className="h-12 shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
                >
                  {tOnline('joinByCode.submit')}
                </Button>
              </div>
            </div>
          </>
        )}

        {gameLobbies.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-2 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/75">
              Tables ouvertes · {gameLobbies.length}
              <span aria-hidden className="h-px flex-1 bg-gold/15" />
            </p>
            <ul className="space-y-2">
              {gameLobbies.map((lobby) => (
                <li
                  key={lobby.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gold/10 bg-felt-deep/60 px-3 py-2.5 transition-colors hover:border-amber-400/30"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/20 bg-gold/10">
                      <Crown className="h-4 w-4 text-amber-300" aria-hidden />
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
                    className="shrink-0 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-400 hover:to-amber-500"
                  >
                    Rejoindre
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}

        {/* « Ouvrir une table » : l'action de création attend en zone pouce.
            Le clic propose d'abord le choix ouvert/privé (modifiable ensuite
            dans les réglages du lobby). */}
        {!wrongRoom && (
          <>
            <div aria-hidden className="h-16" />
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-felt-deep/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
              <div className="mx-auto w-full max-w-lg">
                {!choosingVisibility ? (
                  <Button
                    onClick={() => setChoosingVisibility(true)}
                    disabled={loading}
                    className="h-12 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:opacity-50"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {loading ? 'Création…' : 'Ouvrir une table'}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-center text-xs font-semibold uppercase tracking-wide text-white/50">
                      Qui peut rejoindre ta table ?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void createRoom(gameId, { visibility: 'public' })}
                        disabled={loading}
                        className="flex flex-col items-center gap-1 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-200">
                          <Globe className="h-4 w-4" /> Ouverte
                        </span>
                        <span className="text-[10px] leading-tight text-white/45">
                          Visible dans la liste des lobbies
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void createRoom(gameId, { visibility: 'private' })}
                        disabled={loading}
                        className="flex flex-col items-center gap-1 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-bold text-amber-200">
                          <Lock className="h-4 w-4" /> Privée
                        </span>
                        <span className="text-[10px] leading-tight text-white/45">
                          Sur code, QR ou invitation
                        </span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChoosingVisibility(false)}
                      disabled={loading}
                      className="w-full py-1 text-center text-xs text-white/40 transition-colors hover:text-white/70"
                    >
                      {loading ? 'Création…' : 'Annuler'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
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
        <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
          <Globe className="h-3 w-3" /> En ligne
        </span>
      </div>

      {/* La Table Ronde : les joueurs sont assis autour du feutre (même
          langage que le mode TV), le code trône au centre — le toucher le
          copie. Toucher un siège ouvre les actions d'amitié du joueur. */}
      <div className="relative mx-auto mb-1 h-64 w-full max-w-sm flex-none">
        <div
          className="absolute inset-x-3 inset-y-5 rounded-[50%] border-[3px] border-gold/40 shadow-[inset_0_10px_30px_rgba(0,0,0,0.45),0_10px_24px_-10px_rgba(0,0,0,0.6)]"
          style={{ background: 'radial-gradient(ellipse at 50% 38%, #17594A 0%, #0F4034 62%, #0C352B 100%)' }}
        >
          <div aria-hidden className="absolute inset-2 rounded-[50%] border border-gold/20" />
        </div>
        {room.members.map((m, i) => {
          const memberCosmetics = { preferences: m.preferences, level: m.level, role: m.role }
          return (
            <button
              key={m.userId}
              type="button"
              disabled={m.isSelf}
              onClick={() => setSeatSel((v) => (v === m.userId ? null : m.userId))}
              className="absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={seatPos(i, room.members.length)}
            >
              <span className="relative">
                <OnlinePlayerIcon
                  icon={m.preferences?.icon ?? (m.isHost ? '👑' : '🌐')}
                  cosmetics={memberCosmetics}
                  className="h-9 w-9 border border-[#D8CCAE] bg-cream text-base text-[#24201A] shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)]"
                />
                <span
                  aria-label={m.isReady ? 'Prêt' : 'Pas encore prêt'}
                  title={m.isReady ? 'Prêt' : 'Pas encore prêt'}
                  className={cn(
                    'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-felt-deep',
                    m.isReady ? 'bg-emerald-400' : 'bg-white/25'
                  )}
                />
                {m.isHost && <Crown className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 text-amber-400" />}
              </span>
              <span className="flex max-w-16 items-center gap-0.5 text-[10px] leading-tight text-white/85">
                <span className="truncate">{m.isSelf ? 'Toi' : m.displayName}</span>
                {top5.has(m.userId) && (
                  <span className="shrink-0 font-bold text-amber-300" title={tOnline('top5Badge', { rank: top5.get(m.userId) ?? 0 })}>
                    #{top5.get(m.userId)}
                  </span>
                )}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={copyCode}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#D8CCAE] bg-cream px-4 py-1.5 text-center text-[#24201A] shadow-[0_8px_18px_-8px_rgba(0,0,0,0.6)]"
        >
          <span className="block text-[8px] font-bold uppercase tracking-[0.24em] text-[#6B6455]">Table</span>
          <span className="block font-display text-xl font-black tracking-[0.16em]">{room.code}</span>
          <span className="flex items-center justify-center gap-1 text-[9px] font-semibold text-[#6B6455]">
            {copied ? <Check className="h-2.5 w-2.5 text-emerald-700" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? 'copié !' : 'toucher = copier'}
          </span>
        </button>
      </div>

      {/* Actions d'amitié du siège sélectionné. */}
      {seatSel && (() => {
        const m = room.members.find((x) => x.userId === seatSel)
        if (!m || m.isSelf) return null
        const isFriend = friends.some((f) => f.userId === m.userId)
        const incomingReq = incoming.find((r) => r.userId === m.userId)
        const outgoingPending = outgoing.some((r) => r.userId === m.userId)
        return (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-gold/15 bg-felt-deep/70 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{m.displayName}</span>
            {isFriend ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-300">
                <Users className="h-3.5 w-3.5" />
                {tFriends('alreadyFriend')}
              </span>
            ) : incomingReq ? (
              <button
                type="button"
                onClick={() => acceptRequest(incomingReq.id)}
                className="shrink-0 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
              >
                {tFriends('accept')}
              </button>
            ) : outgoingPending ? (
              <span className="shrink-0 text-xs text-white/40">{tFriends('requestSent')}</span>
            ) : (
              <button
                type="button"
                onClick={() => sendRequestToUser(m.userId)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {tFriends('sendRequest')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSeatSel(null)}
              aria-label="Fermer"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white/40 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })()}

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => void shareTableLink()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20"
        >
          {linkShared ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          {linkShared ? 'Lien copié !' : 'Partager'}
        </button>
        <button
          type="button"
          onClick={() => setShowTv((v) => !v)}
          aria-expanded={showTv}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white/80 transition-colors hover:text-white"
        >
          <Tv className="h-3.5 w-3.5 text-amber-300" />
          {tTv('modeTv')}
        </button>
        {isHost && visibility !== 'public' && (
          <button
            type="button"
            onClick={() => setShowInvite((v) => !v)}
            aria-expanded={showInvite}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white/80 transition-colors hover:text-white"
          >
            <Mail className="h-3.5 w-3.5 text-amber-300" />
            {tOnline('invites.inviteFriend')}
          </button>
        )}
      </div>

      {showTv && (
        <div className="mb-3 flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center">
          <p className="text-xs leading-relaxed text-white/60">{tTv('modeTvHint')}</p>
          <p className="rounded-xl border border-[#D8CCAE] bg-cream px-5 py-2 font-mono text-3xl font-black tracking-[0.3em] text-[#24201A]">
            {room.code}
          </p>
          <JoinQR
            url={`${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/jeux?join=${room.code}`}
            size={128}
          />
          <p className="text-[11px] text-white/40">{tTv('scanToJoin')}</p>
        </div>
      )}

      {showInvite && isHost && visibility !== 'public' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-300/70">
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
                      className="flex items-center justify-between gap-3 rounded-xl border border-gold/10 bg-felt-deep/60 px-3 py-2"
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
                          invited ? 'bg-white/10 text-white/40' : 'bg-amber-600 text-white hover:bg-amber-500'
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
              <div className="grid grid-cols-4 gap-2">
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
                              {member ? (
                                <>
                                  {member.preferences?.icon && (
                                    <span aria-hidden className="mr-1">
                                      <PlayerAvatarGlyph value={member.preferences.icon} />
                                    </span>
                                  )}
                                  {member.displayName}
                                </>
                              ) : (
                                tTc('botSlot')
                              )}
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

            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-sky-300/70">
                {tTc('variants')}
              </p>
              {(() => {
                const active = Boolean(room.settings.tcPowerups)
                return (
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ tcPowerups: !active })}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition-all disabled:cursor-not-allowed',
                      active
                        ? 'border-transparent bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-lg'
                        : 'border-white/10 bg-white/5 text-white/60',
                      isHost && !active && 'hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className="block text-sm font-black">💣 {tTc('powerups')}</span>
                    <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                      {tTc('powerupsHint')}
                    </span>
                  </button>
                )
              })()}
            </div>
          </>
        )
      })()}

      {/* Réglages de table repliés : le résumé suffit tant qu'on ne touche
          à rien — visibilité, bots et options du jeu vivent dedans.
          (Les équipes Toucher-Coulé restent au-dessus : c'est un choix de
          JOUEUR, pas un réglage d'hôte.) */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:text-white"
        >
          <Settings className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="shrink-0">Réglages</span>
          <span className="min-w-0 flex-1 truncate text-left text-xs font-normal text-white/40">
            · {tOnline(`visibility.${visibility}`)}
            {(room.settings.botsCount ?? 0) > 0 && ` · ${room.settings.botsCount} bot${(room.settings.botsCount ?? 0) > 1 ? 's' : ''}`}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/40 transition-transform', showSettings && 'rotate-180')} />
        </button>
        <div className={cn('border-t border-white/10 p-4 pb-0', !showSettings && 'hidden')}>

      <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-300/70">
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
                    ? 'border-transparent bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg'
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

      {gameId === 'bluff' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-rose-400/70">
            {tBluff('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[6, 8, 10].map((value) => {
              const active = (room.settings.bluffRounds ?? 8) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ bluffRounds: value })}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-center transition-all disabled:cursor-not-allowed',
                    active
                      ? 'border-transparent bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg'
                      : 'border-white/10 bg-white/5 text-white/60',
                    isHost && !active && 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                    {tBluff('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'sans-filtre' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            {tSf('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 8, 12].map((value) => {
              const active = (room.settings.sfRounds ?? 8) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ sfRounds: value })}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-center transition-all disabled:cursor-not-allowed',
                    active
                      ? 'border-transparent bg-gradient-to-r from-zinc-700 to-amber-600 text-white shadow-lg'
                      : 'border-white/10 bg-white/5 text-white/60',
                    isHost && !active && 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                    {tSf('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'espion' && (
        <>
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-cyan-400/70">
              {tEspion('discussionMin')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 7].map((value) => {
                const active = (room.settings.espionDiscussionMin ?? 5) === value
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ espionDiscussionMin: value })}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-center transition-all disabled:cursor-not-allowed',
                      active
                        ? 'border-transparent bg-gradient-to-r from-slate-600 to-cyan-500 text-white shadow-lg'
                        : 'border-white/10 bg-white/5 text-white/60',
                      isHost && !active && 'hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className="block text-lg font-black">{value}</span>
                    <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                      {tEspion('minutes')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-cyan-400/70">
              {tEspion('roundsToWin')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 7].map((value) => {
                const active = (room.settings.espionRoundsToWin ?? 3) === value
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ espionRoundsToWin: value })}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-center transition-all disabled:cursor-not-allowed',
                      active
                        ? 'border-transparent bg-gradient-to-r from-slate-600 to-cyan-500 text-white shadow-lg'
                        : 'border-white/10 bg-white/5 text-white/60',
                      isHost && !active && 'hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className="block text-lg font-black">{value}</span>
                    <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                      {tEspion('rounds')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {gameId === 'mots-codes' && (() => {
        const teams = room.settings.mcTeams ?? {}
        const teamMembers = (team: 'A' | 'B') => room.members.filter((m) => teams[m.userId] === team)
        const myTeam = user ? teams[user.id] : undefined
        return (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
              {tMc('teams')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((team) => {
                const inTeam = teamMembers(team)
                const isMine = myTeam === team
                return (
                  <div
                    key={team}
                    className={cn(
                      'rounded-xl border p-2.5',
                      team === 'A' ? 'border-amber-400/25 bg-amber-500/10' : 'border-red-400/25 bg-red-500/10'
                    )}
                  >
                    <p className={cn('mb-2 text-xs font-bold', team === 'A' ? 'text-amber-300' : 'text-red-300')}>
                      {team === 'A' ? tMc('teamGold') : tMc('teamRed')}
                    </p>
                    <ul className="mb-2 min-h-[1.75rem] space-y-1">
                      {inTeam.length === 0 && (
                        <li className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/35">{tMc('autoSlot')}</li>
                      )}
                      {inTeam.map((member) => (
                        <li key={member.userId} className="truncate rounded-lg bg-black/25 px-2 py-1 text-xs font-medium text-white">
                          {member.preferences?.icon && (
                            <span aria-hidden className="mr-1">
                              <PlayerAvatarGlyph value={member.preferences.icon} />
                            </span>
                          )}
                          {member.displayName}
                        </li>
                      ))}
                    </ul>
                    {!isMine && (
                      <button
                        type="button"
                        onClick={() => setTeam(team)}
                        className={cn(
                          'w-full rounded-lg py-1.5 text-xs font-semibold transition-colors',
                          team === 'A' ? 'bg-amber-600 text-black hover:bg-amber-500' : 'bg-red-700 text-white hover:bg-red-600'
                        )}
                      >
                        {tMc('joinTeam')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-white/40">{tMc('teamsHint')}</p>
          </div>
        )
      })()}

      {gameId === 'tabou' && (() => {
        const teams = room.settings.tabouTeams ?? {}
        const teamMembers = (team: 'A' | 'B') => room.members.filter((m) => teams[m.userId] === team)
        const myTeam = user ? teams[user.id] : undefined
        return (
          <>
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
                {tTabou('teams')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((team) => {
                  const inTeam = teamMembers(team)
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
                        {team === 'A' ? tTabou('teamA') : tTabou('teamB')}
                      </p>
                      <ul className="mb-2 min-h-[1.75rem] space-y-1">
                        {inTeam.length === 0 && (
                          <li className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/35">{tTabou('botSlot')}</li>
                        )}
                        {inTeam.map((member) => (
                          <li key={member.userId} className="truncate rounded-lg bg-black/25 px-2 py-1 text-xs font-medium text-white">
                            {member.preferences?.icon && (
                              <span aria-hidden className="mr-1">
                                <PlayerAvatarGlyph value={member.preferences.icon} />
                              </span>
                            )}
                            {member.displayName}
                          </li>
                        ))}
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
                          {tTabou('joinTeam')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-white/40">{tTabou('botsFill')}</p>
            </div>

            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
                {tTabou('targetScore')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[15, 20, 25].map((value) => {
                  const active = (room.settings.tabouTargetScore ?? 20) === value
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!isHost}
                      onClick={() => updateSettings({ tabouTargetScore: value })}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-center transition-all disabled:cursor-not-allowed',
                        active
                          ? 'border-transparent bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg'
                          : 'border-white/10 bg-white/5 text-white/60',
                        isHost && !active && 'hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <span className="block text-lg font-black">{value}</span>
                      <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                        {tTabou('points')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )
      })()}

      {gameId === 'crobard' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            {tCrobard('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[6, 8, 10].map((value) => {
              const active = (room.settings.crobardRounds ?? 8) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ crobardRounds: value })}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-center transition-all disabled:cursor-not-allowed',
                    active
                      ? 'border-transparent bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                      : 'border-white/10 bg-white/5 text-white/60',
                    isHost && !active && 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                    {tCrobard('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'loup-garou' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
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
                      ? 'border-transparent bg-gradient-to-r from-slate-600 to-amber-500 text-white shadow-lg'
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
          {/* Loup supplémentaire : proposé uniquement aux tables de 5 (à 4,
              2 loups gagneraient d'entrée — le moteur l'ignore de toute façon). */}
          {room.members.length + (room.settings.botsCount ?? 0) === 5 && (
            <button
              type="button"
              disabled={!isHost}
              onClick={() => updateSettings({ lgExtraWolf: !room.settings.lgExtraWolf })}
              className={cn(
                'mt-2 w-full rounded-xl border px-3 py-3 text-left transition-all disabled:cursor-not-allowed',
                room.settings.lgExtraWolf
                  ? 'border-transparent bg-gradient-to-r from-slate-600 to-amber-500 text-white shadow-lg'
                  : 'border-white/10 bg-white/5 text-white/60',
                isHost && !room.settings.lgExtraWolf && 'hover:bg-white/10 hover:text-white'
              )}
            >
              <span className="block text-sm font-black">{tLg('extraWolf')}</span>
              <span
                className={cn(
                  'mt-0.5 block text-[10px]',
                  room.settings.lgExtraWolf ? 'text-white/80' : 'text-white/35'
                )}
              >
                {tLg('extraWolfHint')}
              </span>
            </button>
          )}
        </div>
      )}

      {gameId === 'menteur' && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-orange-400/70">
            {tMenteur('variants')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'menteurPalifico' as const, label: tMenteur('palifico'), hint: tMenteur('palificoHint') },
                { key: 'menteurCalza' as const, label: tMenteur('calza'), hint: tMenteur('calzaHint') },
              ]
            ).map(({ key, label, hint }) => {
              const active = Boolean(room.settings[key])
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ [key]: !active })}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-left transition-all disabled:cursor-not-allowed',
                    active
                      ? 'border-transparent bg-gradient-to-r from-orange-600 to-red-500 text-white shadow-lg'
                      : 'border-white/10 bg-white/5 text-white/60',
                    isHost && !active && 'hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="block text-sm font-black">{label}</span>
                  <span className={cn('mt-0.5 block text-[10px]', active ? 'text-white/80' : 'text-white/35')}>
                    {hint}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'imposteur' && (() => {
        const estPlayers = Math.max(IMPOSTEUR_MIN_PLAYERS, room.members.length + (room.settings.botsCount ?? 0))
        const maxCount = maxImposteurCount(estPlayers)
        const current = Math.min(room.settings.imposteurCount ?? imposteurCountFor(estPlayers), maxCount)
        const options = Array.from({ length: maxCount }, (_, i) => i + 1)
        return (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
              {tImposteur('count')}
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
              {options.map((value) => {
                const active = current === value
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ imposteurCount: value })}
                    className={cn(
                      'rounded-xl border px-2 py-3 text-center transition-all disabled:cursor-not-allowed',
                      active
                        ? 'border-transparent bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg'
                        : 'border-white/10 bg-white/5 text-white/60',
                      isHost && !active && 'hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className="block text-lg font-black">{value}</span>
                    <span className={cn('mt-0.5 block text-[9px]', active ? 'text-white/80' : 'text-white/35')}>
                      {tImposteur(value > 1 ? 'imposteursPlural' : 'imposteurSingular')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

        </div>
      </div>

      {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}

      {!isHost && (
        <p className="mt-2 text-center text-sm text-white/50">
          En attente que {room.members.find((m) => m.isHost)?.displayName} lance la partie…
        </p>
      )}

      {/* Espace réservé pour que la barre fixe ne masque pas le contenu. */}
      <div aria-hidden className="h-20" />

      {/* Prêt + Lancer : fixes en zone pouce, safe-area comprise. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-felt-deep/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3">
          <Button
            onClick={() => setReady(!selfMember?.isReady)}
            className={cn(
              'h-12 rounded-2xl border text-sm font-semibold transition-all',
              isHost ? 'flex-[0.8]' : 'flex-1',
              selfMember?.isReady
                ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20'
                : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
            )}
          >
            {selfMember?.isReady ? '✓ Prêt' : 'Me déclarer prêt'}
          </Button>

          {isHost && (
            <Button
              onClick={() => launchGame()}
              disabled={!room.canLaunch || loading}
              className="h-12 flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="mr-1.5 h-4 w-4" />
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
                    ? `Min. ${minPlayers} joueurs`
                    : `${room.members.filter((m) => m.isReady).length}/${room.members.length} prêts`
              })()}
            </Button>
          )}
        </div>
      </div>
    </LobbyShell>
  )
}
