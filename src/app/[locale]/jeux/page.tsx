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
import { AmbianceModeToggle } from '@/components/auth/AmbianceModeToggle'
import { useRequireSelectedPlayers } from '@/hooks/useRequireSelectedPlayers'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GAMES } from '@/lib/games'
import { Link } from '@/i18n/navigation'
import { FlaskConical } from 'lucide-react'

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
      compact
      title={isOnline ? tOnline('title') : t('title')}
      subtitle={isOnline ? tOnline('subtitle') : t('subtitle')}
      headerExtra={
        <div className="space-y-2">
          {/* Chrome condensé (Vitrine) : les deux bascules sur UNE ligne —
              l'ambiance en icônes seules, le libellé reste en title/aria. */}
          <div className="flex items-center gap-2">
            <PlayModeToggle className="max-w-none flex-[1.4]" />
            {isOnline && <AmbianceModeToggle dense className="max-w-none flex-1" />}
          </div>
          {!isOnline && <SelectedPlayersBar />}
          {user?.displayName && (
            <p className="flex items-center justify-end gap-1.5 px-1 text-[11px] text-white/45">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {isOnline ? (user.onlineDisplayName ?? user.displayName) : user.displayName}
            </p>
          )}
        </div>
      }
    >

      {isOnline && <RejoinBanner onJoin={handleJoinInvite} joining={joining} />}
      {isOnline && <FriendInviteBanner onJoin={handleJoinInvite} joining={joining} />}
      {isOnline && <OpenLobbiesList />}

      <Link
        href="/test-nouveaux-jeux"
        className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5 text-sm text-amber-200 transition-colors hover:bg-amber-400/[0.12]"
      >
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
        Tester les 5 nouveaux jeux (Bluff, Espion, Tabou, Crobard, Téléphone Dessiné)
      </Link>

      <GamesGrid />
    </HubShell>
  )
}
