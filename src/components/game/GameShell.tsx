"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FullscreenButton } from "@/components/ui/fullscreen-button"
import { cn } from "@/lib/utils"
import { gameActionBarPadding } from "@/components/game/GameFixedActionBar"

export interface GameShellProps {
  title: string
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

export function GameShell({
  title,
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
              aria-label={t('back')}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <Link href={backHref} aria-label={t('back')} className="shrink-0">
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
