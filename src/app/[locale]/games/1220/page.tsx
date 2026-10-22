"use client"

import dynamic from "next/dynamic"
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useRouter } from "@/i18n/navigation"
import { useAuth } from '@/components/providers/AuthProvider'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { OnlineGameStage } from '@/components/online/OnlineGameStage'
import { GameShowcase } from '@/components/online/GameShowcase'
import { LocalGamePrelobby } from '@/components/game/LocalGamePrelobby'

// Les deux moteurs — le jeu local (un téléphone qui tourne autour de la
// table) et sa version en ligne (lobby, briefing, bibliothèque d'animation) —
// sont chargés À LA DEMANDE selon le mode : la page livrait les deux et n'en
// montrait qu'un. Pas de `ssr: false` : le serveur ne rend ni l'un ni l'autre
// (session inconnue, aucun joueur en mémoire), et le même squelette — en-tête
// du catalogue, zone qui pulse — tient la place le temps que le morceau arrive.
const Game1220Online = dynamic(
  () => import('@/components/online/Game1220Online').then((m) => m.Game1220Online),
  { loading: () => <OnlineGameSkeleton gameId="1220" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="1220" />,
})

export default function Game1220Page() {
  const { user, loading } = useAuth()
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  // Compte pas encore connu : la vitrine du jeu, bouton principal désactivé —
  // c'est le HTML rendu au build, celui que lit Googlebot (l'écran local, lui,
  // attend ses joueurs). Un compte en ligne ne voit plus l'écran local le
  // temps que la session réponde.
  if (loading) {
    return <GameShowcase gameId="1220" pending />
  }

  // Mode en ligne : lobby + partie serveur-autoritaire (indépendant du flux local).
  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <Game1220Online />
      </OnlineGameStage>
    )
  }

  if (selectedPlayers.length >= 2) {
    return <Game players={selectedPlayers} onGameEnd={() => router.push("/jeux")} />
  }

  return <LocalGamePrelobby gameId="1220" players={selectedPlayers} onStart={() => undefined} />
}
