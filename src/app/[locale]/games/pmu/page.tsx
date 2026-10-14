"use client"

import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Player } from '@/lib/players'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useRouter } from '@/i18n/navigation'
import { LocalGamePrelobby } from '@/components/game/LocalGamePrelobby'

export default function PMUPage() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()
  const selectedPlayers: Player[] = players.filter(p => selectedIds.includes(p.id))

  if (selectedPlayers.length >= 2) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={() => router.push('/jeux')}
      />
    )
  }

  return (
    <LocalGamePrelobby gameId="pmu" players={selectedPlayers} onStart={() => undefined} />
  )
}
