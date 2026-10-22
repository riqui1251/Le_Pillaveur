import type { ReactNode } from 'react'
import { ConnectionBanner } from '@/components/online/ConnectionBanner'
import { cn } from '@/lib/utils'

interface OnlineGameStageProps {
  children: ReactNode
  /** Variante de la scène, ex. `overflow-hidden` pour un plateau qui gère son propre défilement. */
  className?: string
  /**
   * Bandeau « coupure réseau » en tête de scène (défaut : oui). `false` pour
   * un plateau LOCAL posé sur la scène (Petit Buveur) : la coupure d'une salle
   * en ligne n'y a rien à dire.
   */
  connectionBanner?: boolean
}

/**
 * Scène plein écran d'une partie, posée SOUS la barre du site (Navbar : `h-14`,
 * `sm:h-[3.75rem]`) et par-dessus la coquille de games/layout.tsx.
 *
 * Fond `app-felt` : le feutre de la vitrine, qui suit le mode Soft par les
 * variables --felt / --felt-deep. Le calque était en gris anthracite codé en
 * dur : le joueur séduit par la vitrine croyait changer de site au moment de
 * jouer, et le bleu nuit du mode Soft ne s'appliquait jamais en ligne.
 *
 * Le bandeau de connexion est son PREMIER enfant (`sticky top-0` dans le flux
 * qui défile) : le jeu glisse de sa hauteur au lieu d'être recouvert, et celui
 * de la coquille, qui flottait par-dessus les premiers pixels, se tait.
 *
 * z-20, et pas plus : les barres fixes (z-30), la Navbar (z-40) et les
 * dialogues en portail (z-50) passent devant. La scène est un contexte
 * d'empilement : une surcouche rendue DEDANS sans portail reste sous la Navbar,
 * quel que soit son z-index.
 */
export function OnlineGameStage({ children, className, connectionBanner = true }: OnlineGameStageProps) {
  return (
    <div
      className={cn(
        // scroll-pb : un élément atteint au clavier ne s'arrête pas sous la barre d'action fixe.
        'app-felt fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto scroll-pb-36 text-cream sm:top-[3.75rem]',
        className
      )}
    >
      {connectionBanner && <ConnectionBanner placement="stage" />}
      {children}
    </div>
  )
}
