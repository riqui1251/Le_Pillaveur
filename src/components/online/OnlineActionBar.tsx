"use client"

import type { ReactNode } from 'react'
import {
  GameFixedActionBar,
  gameActionBarPadding,
  type GameActionBarSize,
} from '@/components/game/GameFixedActionBar'

interface OnlineActionBarProps {
  /** L'action du moment : un bouton, ou une rangée `flex gap-2` de boutons. */
  children: ReactNode
  /** Ligne d'état au-dessus des boutons (« Vote scellé · 5/8 »), lue par le lecteur d'écran. */
  status?: ReactNode
  maxWidthClass?: string
  className?: string
}

/**
 * Barre fixe en bas d'un écran de jeu en ligne : l'action qui fait avancer la
 * partie reste sous le pouce au lieu de monter et descendre avec le contenu
 * (cartes tirées, historique déplié, fil d'indices qui s'allonge).
 *
 * Même barre que GameFixedActionBar, plus une ligne d'état. La région live
 * existe même vide (`sr-only`) : une région qui apparaît en même temps que
 * son texte n'est pas annoncée. Elle ne parle donc que si la barre est DÉJÀ
 * montée quand le statut change : on la garde montée toute la phase de jeu,
 * et ce sont ses enfants (les boutons du tour) qui vont et viennent.
 */
export function OnlineActionBar({
  children,
  status,
  maxWidthClass = 'max-w-xl',
  className,
}: OnlineActionBarProps) {
  const hasStatus = status !== undefined && status !== null && status !== false && status !== ''
  return (
    <GameFixedActionBar maxWidthClass={maxWidthClass} className={className}>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={hasStatus ? 'mb-2 text-center text-sm text-cream/80' : 'sr-only'}
      >
        {hasStatus ? status : null}
      </p>
      {children}
    </GameFixedActionBar>
  )
}

/**
 * Padding bas du flux qui défile sous la barre. `tall` dès qu'il y a une ligne
 * d'état ou deux rangées de boutons.
 */
export function onlineActionBarPadding(size: GameActionBarSize = 'default') {
  return gameActionBarPadding(size)
}
