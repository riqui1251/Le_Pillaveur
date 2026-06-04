"use client"

import * as React from "react"
import { useGameViewport } from "@/hooks/useGameViewport"
import { cn } from "@/lib/utils"

export interface GameStageProps {
  /** Largeur "naturelle" du contenu, en px (taille de référence du design). */
  designWidth: number
  /** Hauteur "naturelle" du contenu, en px (taille de référence du design). */
  designHeight: number
  children: React.ReactNode
  /** Échelle maximale (évite de sur-agrandir sur très grand écran). Défaut 1.6. */
  maxScale?: number
  /** Classe du conteneur externe (qui définit l'espace disponible). */
  className?: string
  /** Aligne le contenu mis à l'échelle (défaut: centré). */
  align?: "center" | "start"
}

/**
 * Met à l'échelle proportionnellement un contenu de taille fixe ("design")
 * pour qu'il remplisse au mieux l'espace disponible — comme une scène de jeu.
 *
 * scale = min(largeurDispo / designWidth, hauteurDispo / designHeight)
 *
 * Le contenu est rendu à sa taille de référence puis transformé via CSS,
 * ce qui garde des proportions identiques sur desktop et mobile sans avoir
 * à recoder chaque dimension. Les interactions (clics) suivent la transformation.
 */
export function GameStage({
  designWidth,
  designHeight,
  children,
  maxScale = 1.6,
  className,
  align = "center",
}: GameStageProps) {
  const { ref, width, height } = useGameViewport<HTMLDivElement>()

  const scale = React.useMemo(() => {
    if (!width || !height) return 0
    const s = Math.min(width / designWidth, height / designHeight)
    return Math.min(s, maxScale)
  }, [width, height, designWidth, designHeight, maxScale])

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex w-full flex-1 overflow-hidden",
        align === "center" ? "items-center justify-center" : "items-start justify-center",
        className
      )}
    >
      <div
        style={{
          width: designWidth,
          height: designHeight,
          transform: scale ? `scale(${scale})` : undefined,
          transformOrigin: align === "center" ? "center center" : "top center",
          // Évite un flash à 0 avant la première mesure.
          visibility: scale ? "visible" : "hidden",
        }}
        className="shrink-0"
      >
        {children}
      </div>
    </div>
  )
}

export default GameStage
