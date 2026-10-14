"use client"

import Game from './components/game'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useRouter } from '@/i18n/navigation'
import { LocalGamePrelobby } from '@/components/game/LocalGamePrelobby'

export default function Monsieur3Page() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => router.push('/jeux')

  if (selectedPlayers.length >= 2) {
    return <Game players={selectedPlayers} onGameEnd={handleGameEnd} />
  }

  return <LocalGamePrelobby gameId="monsieur-3" players={selectedPlayers} onStart={() => undefined} />
}
