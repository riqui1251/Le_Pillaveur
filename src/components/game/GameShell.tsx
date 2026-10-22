"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FullscreenButton } from "@/components/ui/fullscreen-button"
import { useFullscreenLayoutContext } from "@/components/providers/FullscreenLayoutProvider"
import { cn } from "@/lib/utils"
import { gameActionBarPadding, useGameBottomBarInset } from "@/components/game/GameFixedActionBar"

export interface GameShellProps {
  title: string
  /** Ligne courte sous le titre (manche, joueur du tour…), en contenu inline. */
  headerSubtitle?: React.ReactNode
  children: React.ReactNode
  backHref?: string
  onBack?: () => void
  headerRight?: React.ReactNode
  actionBar?: React.ReactNode
  maxWidth?: number | string
  center?: boolean
  showFullscreen?: boolean
  fill?: boolean
  className?: string
  contentClassName?: string
}

const BACK_BUTTON_CLASS =
  "shrink-0 border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"

export function GameShell({
  title,
  headerSubtitle,
  children,
  backHref = "/jeux",
  onBack,
  headerRight,
  actionBar,
  maxWidth = 900,
  center = false,
  // Le bouton plein écran vit désormais dans le bandeau du site (Navbar) :
  // celui du header de jeu ne s'affiche plus que sur demande explicite.
  showFullscreen = false,
  fill = false,
  className,
  contentClassName,
}: GameShellProps) {
  const t = useTranslations('common')
  const { isFullscreen } = useFullscreenLayoutContext()
  const actionBarInset = useGameBottomBarInset("pr-3 sm:pr-4")
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
      {/* Accroché SOUS la barre du site (Navbar sticky z-40, h-14 puis
          sm:h-[3.75rem]) : à top-0, l'en-tête passait dessous et ses boutons
          devenaient intouchables. En plein écran, c'est .content-container
          qui défile, sous la Navbar : là, top-0 colle déjà sous elle. */}
      <header
        className={cn(
          "sticky z-30 border-b border-gold/20 bg-felt-deep/90 backdrop-blur-xl",
          isFullscreen ? "top-0" : "top-14 sm:top-[3.75rem]"
        )}
      >
        <div
          className="game-surface flex items-center gap-2 px-3 py-1.5 sm:px-4"
          style={surfaceStyle}
        >
          {onBack ? (
            <Button
              variant="ghost"
              size="gameIcon"
              onClick={onBack}
              aria-label={t('back')}
              className={BACK_BUTTON_CLASS}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="gameIcon" className={BACK_BUTTON_CLASS}>
              <Link href={backHref} aria-label={t('back')}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          )}

          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate font-display text-lg font-bold text-gold sm:text-xl">
              {title}
            </h1>
            {headerSubtitle && (
              <p className="truncate text-xs font-medium text-cream/70">{headerSubtitle}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            {showFullscreen && <FullscreenButton className={cn("h-11 w-11 rounded-xl", BACK_BUTTON_CLASS)} />}
          </div>
        </div>
      </header>

      <main
        className={cn(
          "game-surface flex w-full flex-1 flex-col px-3 py-4 sm:px-4",
          center && "justify-center",
          actionBar && gameActionBarPadding("default"),
          contentClassName
        )}
        style={surfaceStyle}
      >
        {children}
      </main>

      {actionBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/[0.15] bg-felt-deep/95 backdrop-blur-md">
          <div
            className={cn("game-surface flex items-center gap-2 pl-3 pt-3 sm:pl-4", actionBarInset)}
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
