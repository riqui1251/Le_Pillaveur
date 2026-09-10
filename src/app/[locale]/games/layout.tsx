"use client"

import dynamic from "next/dynamic"
import { useRequireSelectedPlayers } from "@/hooks/useRequireSelectedPlayers"
import { useAuth } from "@/components/providers/AuthProvider"
import { useKeepScreenAwake } from "@/components/tv/use-keep-screen-awake"

/**
 * Vocal de salle — chargé À LA DEMANDE.
 *
 * Il était importé en dur ici, donc livré au navigateur de TOUT joueur
 * ouvrant n'importe quel jeu, y compris en mode LOCAL (un téléphone qui
 * tourne autour de la table) : le dock vocal, la pile WebRTC de
 * `useVoiceChat` et la bibliothèque d'animation partaient avec la page pour
 * un joueur qui n'en verra jamais un pixel. On le sort en morceau séparé,
 * réclamé seulement quand le joueur est en mode « en ligne ».
 *
 * `ssr: false` : le dock est une surcouche flottante qui ne rend rien tant
 * qu'on n'est pas dans une salle — il n'y a donc aucun contenu de premier
 * rendu à préserver, rien ne peut sauter ni clignoter.
 */
const VoiceDock = dynamic(
  () => import("@/components/voice/VoiceDock").then((m) => m.VoiceDock),
  { ssr: false }
)

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth()
  useRequireSelectedPlayers("/joueurs", { skipWhenOnline: true })
  useKeepScreenAwake()

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 px-2 py-1 sm:px-4">
      {/* Coquille « Cartes sur Table » : le visiteur séduit par la vitrine
          (feutre, or, crème) tombait sur un plateau gris anthracite au moment
          décisif et croyait changer de site. Feutre profond, filet or et
          titrage Playfair — décor mesuré, lisibilité d'abord : le texte reste
          crème sur vert sombre, et rien de la mise en page des jeux ne bouge. */}
      <div className="flex min-h-0 w-full flex-1 flex-col space-y-3 rounded-md border border-gold/20 bg-felt-deep/70 p-2 text-cream shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)] [&_h1]:font-display sm:space-y-6 sm:rounded-xl sm:p-6">
        {children}
      </div>
      {/* Vocal de salle — apparaît dès qu'on est dans une salle en ligne,
          pour TOUS les jeux (actuels et futurs), lobby inclus. Le dock se
          masquait déjà tout seul hors salle : la condition ici ne change donc
          rien à l'écran, elle évite seulement de TÉLÉCHARGER le morceau. */}
      {user?.playMode === "online" && <VoiceDock />}
    </div>
  )
}
