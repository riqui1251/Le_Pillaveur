"use client"

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HubShell } from '@/components/hub/HubShell'
import { SelectedPlayersBar } from '@/components/hub/SelectedPlayersBar'
import { GamesGrid } from '@/components/hub/GamesGrid'
import { OpenLobbiesList } from '@/components/online/OpenLobbiesList'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
import { RejoinBanner } from '@/components/online/RejoinBanner'
import { PlayModeToggle } from '@/components/auth/PlayModeToggle'
import { useRequireSelectedPlayers } from '@/hooks/useRequireSelectedPlayers'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GAMES } from '@/lib/games'

export default function GamesHubPage() {
  const t = useTranslations('hub.jeux')
  const tOnline = useTranslations('hub.jeuxOnline')
  const router = useRouter()
  const { user } = useAuth()
  const { joinRoom, loading: joining } = useOnlineRoom()
  const isOnline = user?.playMode === 'online'
  const { ready } = useRequireSelectedPlayers('/joueurs', { skipWhenOnline: true })
  const searchParams = useSearchParams()
  const joinAttemptedRef = useRef(false)

  // Deep-link « scanner le QR de la TV » : ?join=CODE → rejoint la salle et
  // ouvre le jeu. Uniquement en mode online (sinon on ne toucherait pas à
  // l'état local du joueur) ; le middleware assure déjà que l'utilisateur est
  // connecté avant d'arriver ici.
  useEffect(() => {
    const raw = searchParams.get('join')
    if (!raw || joinAttemptedRef.current || !isOnline || !user) return
    const code = raw.trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code)) return
    joinAttemptedRef.current = true
    void (async () => {
      const joined = await joinRoom({ code })
      if (joined?.gameId) {
        const game = GAMES.find((g) => g.id === joined.gameId)
        if (game) router.replace(game.path)
      }
    })()
  }, [searchParams, isOnline, user, joinRoom, router])

  const handleJoinInvite = async (roomId: string) => {
    const room = await joinRoom({ roomId })
    if (room?.gameId) {
      const game = GAMES.find((g) => g.id === room.gameId)
      if (game) router.push(game.path)
    }
  }

  if (!isOnline && !ready) return null

  return (
    <HubShell
      title={isOnline ? tOnline('title') : t('title')}
      subtitle={isOnline ? tOnline('subtitle') : t('subtitle')}
      headerExtra={
        <div className="flex flex-col items-center gap-4">
          <PlayModeToggle />
          {!isOnline && <SelectedPlayersBar />}
        </div>
      }
    >
      {user?.displayName && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/80">
          {tOnline('connectedAs')}{' '}
          <span className="font-semibold text-amber-200">
            {isOnline ? (user.onlineDisplayName ?? user.displayName) : user.displayName}
          </span>
        </div>
      )}

      {isOnline && <RejoinBanner onJoin={handleJoinInvite} joining={joining} />}
      {isOnline && <FriendInviteBanner onJoin={handleJoinInvite} joining={joining} />}
      {isOnline && <OpenLobbiesList />}

      <GamesGrid />
    </HubShell>
  )
}
