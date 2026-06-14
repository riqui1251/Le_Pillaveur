"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type GameActionBarSize = "default" | "tall"

const PADDING_BY_SIZE: Record<GameActionBarSize, string> = {
  default: "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]",
  tall: "pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))]",
}

/** Padding bas à appliquer sur la zone scrollable pour laisser place à la barre fixe. */
export function gameActionBarPadding(size: GameActionBarSize = "default") {
  return PADDING_BY_SIZE[size]
}

interface GameFixedActionBarProps {
  children: ReactNode
  maxWidthClass?: string
  className?: string
}

/** Barre d'action collée en bas de l'écran (safe-area), sans recouvrir le contenu si padding appliqué. */
export function GameFixedActionBar({
  children,
  maxWidthClass = "max-w-xl",
  className,
}: GameFixedActionBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.06]",
        "bg-gradient-to-t from-[#07060b] via-[#07060b]/98 to-[#07060b]/90 backdrop-blur-md",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          maxWidthClass
        )}
      >
        {children}
      </div>
    </div>
  )
}
