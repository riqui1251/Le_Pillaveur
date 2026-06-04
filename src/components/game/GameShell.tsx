"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FullscreenButton } from "@/components/ui/fullscreen-button"
import { cn } from "@/lib/utils"

export interface GameShellProps {
  /** Titre affiché dans l'en-tête du jeu. */
  title: string
  /** Contenu principal du jeu (plateau, cartes, etc.). */
  children: React.ReactNode
  /** Lien de retour (par défaut le catalogue des jeux). Ignoré si onBack est fourni. */
  backHref?: string
  /** Callback de retour (ex. revenir à l'écran de configuration). Prioritaire sur backHref. */
  onBack?: () => void
  /** Élément optionnel aligné à droite dans l'en-tête (ex. score, infos). */
  headerRight?: React.ReactNode
  /** Barre d'action collée en bas (boutons principaux du jeu), avec gestion safe-area. */
  actionBar?: React.ReactNode
  /** Largeur maximale de la surface de jeu (CSS, défaut 900px). */
  maxWidth?: number | string
  /** Centre verticalement le contenu quand il reste de la place. */
  center?: boolean
  /** Affiche le bouton plein écran (défaut: true). */
  showFullscreen?: boolean
  /** Occupe toute la hauteur visible (100dvh). Défaut: false (s'adapte à l'imbrication). */
  fill?: boolean
  className?: string
  contentClassName?: string
}

/**
 * Coquille commune à tous les jeux : en-tête cohérent (retour, titre, plein écran),
 * surface de jeu responsive (largeur fluide plafonnée) et barre d'action basse
 * respectant les zones sûres (encoches/barres système).
 *
 * Conçue pour fonctionner aussi bien sur desktop que sur mobile sans code spécifique
 * à chaque appareil : la mise à l'échelle des éléments de jeu se fait via GameStage
 * ou des unités fluides (clamp/%), pas via des tailles figées.
 */
export function GameShell({
  title,
  children,
  backHref = "/jeux",
  onBack,
  headerRight,
  actionBar,
  maxWidth = 900,
  center = false,
  showFullscreen = true,
  fill = false,
  className,
  contentClassName,
}: GameShellProps) {
  const surfaceStyle = {
    "--game-max-w": typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
  } as React.CSSProperties

  return (
    <div
      className={cn(
        "relative flex flex-col",
        fill ? "min-h-[100dvh]" : "min-h-[70vh]",
        className
      )}
    >
      {/* En-tête sticky : retour, titre centré, plein écran + slot droit */}
      <header className="safe-top sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div
          className="game-surface flex items-center gap-2 py-2 pl-14 pr-3 sm:pr-4"
          style={surfaceStyle}
        >
          {onBack ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Retour"
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <Link href={backHref} aria-label="Retour" className="shrink-0">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          )}

          <h1 className="min-w-0 flex-1 truncate text-center text-lg font-bold sm:text-xl">
            {title}
          </h1>

          <div className="flex shrink-0 items-center gap-1">
            {headerRight}
            {showFullscreen && <FullscreenButton />}
          </div>
        </div>
      </header>

      {/* Surface de jeu : largeur fluide plafonnée, padding bas si barre d'action */}
      <main
        className={cn(
          "game-surface flex w-full flex-1 flex-col px-3 py-4 sm:px-4",
          center && "justify-center",
          actionBar && "pb-28",
          contentClassName
        )}
        style={surfaceStyle}
      >
        {children}
      </main>

      {/* Barre d'action basse, safe-area aware */}
      {actionBar && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/90 backdrop-blur">
          <div
            className="game-surface flex items-center gap-2 px-3 py-3 sm:px-4"
            style={surfaceStyle}
          >
            {actionBar}
          </div>
        </div>
      )}
    </div>
  )
}

export default GameShell
