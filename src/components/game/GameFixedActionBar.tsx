"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useVoiceDockAnchored, useVoiceDockStatus } from "@/components/voice/voice-dock-store"

export type GameActionBarSize = "default" | "tall"

const PADDING_BY_SIZE: Record<GameActionBarSize, string> = {
  default: "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]",
  tall: "pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))]",
}

/** Padding bas à appliquer sur la zone scrollable pour laisser place à la barre fixe. */
export function gameActionBarPadding(size: GameActionBarSize = "default") {
  return PADDING_BY_SIZE[size]
}

/**
 * Marge droite et basse d'une barre d'action fixe (à poser sur son conteneur
 * intérieur, avec la marge gauche et haute).
 *
 * Zone sûre du bas toujours. Gouttière de `game-bottom-bar` (3,75 rem à droite
 * sous 720 px) SEULEMENT quand la bulle vocale flottante est à l'écran : posée
 * à droite en z-90, elle chevauchait alors les commandes de droite. Ailleurs
 * (jeu local, bulle rangée par un bouton micro d'en-tête), la gouttière ne
 * faisait que décentrer le bouton principal de 60 px.
 */
export function useGameBottomBarInset(rightPadding = "pr-4") {
  const { available } = useVoiceDockStatus()
  const anchored = useVoiceDockAnchored()
  return available && !anchored
    ? "game-bottom-bar min-[720px]:pr-4"
    : cn("pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]", rightPadding)
}

interface GameFixedActionBarProps {
  children: ReactNode
  maxWidthClass?: string
  /** Classes du calque extérieur (position, fond) ; les marges intérieures sont fixées. */
  className?: string
}

/**
 * Barre d'action collée en bas de l'écran, sans recouvrir le contenu si le
 * padding est appliqué.
 *
 * z-30 : au-dessus de OnlineGameStage (z-20), qui la contient ou la précède.
 */
export function GameFixedActionBar({
  children,
  maxWidthClass = "max-w-xl",
  className,
}: GameFixedActionBarProps) {
  const inset = useGameBottomBarInset()
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-gold/[0.15] bg-felt-deep/95 backdrop-blur-md",
        className
      )}
    >
      <div className={cn("mx-auto pl-4 pt-3", inset, maxWidthClass)}>
        {children}
      </div>
    </div>
  )
}
