"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HubShell } from '@/components/hub/HubShell'
import { SelectedPlayersBar } from '@/components/hub/SelectedPlayersBar'
import { GamesGrid } from '@/components/hub/GamesGrid'
import { OpenLobbiesList } from '@/components/online/OpenLobbiesList'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
import { JoinGate } from '@/components/online/JoinGate'
import { RejoinBanner } from '@/components/online/RejoinBanner'
import { RecentGamesRow } from '@/components/online/RecentGamesRow'
import { PlayModeToggle } from '@/components/auth/PlayModeToggle'
import { AmbianceModeToggle } from '@/components/auth/AmbianceModeToggle'
import { useRequireSelectedPlayers } from '@/hooks/useRequireSelectedPlayers'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GAMES } from '@/lib/games'

export default function GamesHubPage() {
  const t = useTranslations('hub.jeux')
  const tOnline = useTranslations('hub.jeuxOnline')
  const router = useRouter()
  const { user, setPlayMode } = useAuth()
  const { joinRoom, loading: joining } = useOnlineRoom()
  const isOnline = user?.playMode === 'online'
  const { ready, browsing } = useRequireSelectedPlayers('/joueurs', { skipWhenOnline: true })
  const searchParams = useSearchParams()
  const joinAttemptedRef = useRef(false)
  const modeSwitchedRef = useRef(false)
  const [gateCode, setGateCode] = useState<string | null>(null)

  // Deep-link « rejoins ma table » (QR TV ou lien partagé) : ?join=CODE →
  // rejoint la salle et ouvre le jeu. Un visiteur pas encore connecté (ou
  // pas en mode online) garde le code sous le coude en localStorage — il est
  // consommé automatiquement dès qu'il arrive ici connecté en ligne, même
  // après le détour par l'inscription.
  useEffect(() => {
    const raw = searchParams.get('join')?.trim().toUpperCase()
    if (raw && /^[A-Z0-9]{6}$/.test(raw) && (!user || !isOnline)) {
      try {
        window.localStorage.setItem('lp-pending-join', raw)
      } catch {
        // stockage indisponible — le lien ne survivra pas à l'inscription
      }
    }
  }, [searchParams, user, isOnline])

  // Visiteur SANS session avec un code en attente : porte d'entrée « invité
  // ou connexion » (voir JoinGate) au lieu de le laisser errer sur la vitrine.
  useEffect(() => {
    if (user) {
      setGateCode(null)
      return
    }
    const raw = searchParams.get('join')?.trim().toUpperCase()
    let code = raw && /^[A-Z0-9]{6}$/.test(raw) ? raw : null
    if (!code) {
      try {
        const stored = window.localStorage.getItem('lp-pending-join')
        code = stored && /^[A-Z0-9]{6}$/.test(stored) ? stored : null
      } catch {
        code = null
      }
    }
    setGateCode(code)
  }, [searchParams, user])

  // Connecté mais en mode local avec un code en attente (retour de connexion
  // après un scan de QR) : on bascule en ligne d'office — c'est ce que le
  // scan voulait dire — et l'effet de join ci-dessous prend le relais.
  useEffect(() => {
    if (!user || isOnline || modeSwitchedRef.current) return
    const raw = searchParams.get('join')?.trim().toUpperCase()
    let code = raw && /^[A-Z0-9]{6}$/.test(raw) ? raw : null
    if (!code) {
      try {
        const stored = window.localStorage.getItem('lp-pending-join')
        code = stored && /^[A-Z0-9]{6}$/.test(stored) ? stored : null
      } catch {
        code = null
      }
    }
    if (!code) return
    modeSwitchedRef.current = true
    void setPlayMode('online')
  }, [searchParams, user, isOnline, setPlayMode])
  useEffect(() => {
    if (joinAttemptedRef.current || !isOnline || !user) return
    let code = searchParams.get('join')?.trim().toUpperCase() ?? null
    if (!code) {
      try {
        code = window.localStorage.getItem('lp-pending-join')
      } catch {
        code = null
      }
    }
    if (!code || !/^[A-Z0-9]{6}$/.test(code)) return
    joinAttemptedRef.current = true
    try {
      window.localStorage.removeItem('lp-pending-join')
    } catch {
      // rien à nettoyer
    }
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

  // Visiteur sans mode choisi (browsing) : on montre quand même la vitrine.
  if (!isOnline && !ready && !browsing) return null

  const dismissGate = () => {
    try {
      window.localStorage.removeItem('lp-pending-join')
    } catch {
      // rien à nettoyer
    }
    setGateCode(null)
    router.replace('/jeux')
  }

  return (
    <>
    {gateCode && !user && <JoinGate code={gateCode} onDismiss={dismissGate} />}
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
      {isOnline && <RecentGamesRow />}
      {isOnline && <OpenLobbiesList />}

      <GamesGrid />
    </HubShell>
    </>
  )
}
