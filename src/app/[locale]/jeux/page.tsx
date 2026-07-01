"use client"

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HubShell } from '@/components/hub/HubShell'
import { SelectedPlayersBar } from '@/components/hub/SelectedPlayersBar'
import { GamesGrid } from '@/components/hub/GamesGrid'
import { OpenLobbiesList } from '@/components/online/OpenLobbiesList'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
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
      step="jeux"
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

      {isOnline && <FriendInviteBanner onJoin={handleJoinInvite} joining={joining} />}
      {isOnline && <OpenLobbiesList />}

      <GamesGrid />
    </HubShell>
  )
}
