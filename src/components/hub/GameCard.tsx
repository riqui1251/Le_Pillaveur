"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { LocalizedGameMeta } from "@/lib/games-i18n"
import { cn } from "@/lib/utils"
import { ReactNode } from "react"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useAuth } from "@/hooks/useAuth"

interface GameCardProps {
  game: LocalizedGameMeta
  icon: ReactNode
}

/** Badge « nombre de joueurs » : 3-12, ou 2+ quand il n'y a pas de vrai plafond. */
function playersLabel(min?: number, max?: number): string | null {
  if (!min) return null
  if (!max || max >= 13) return `${min}+`
  if (max === min) return `${min}`
  return `${min}-${max}`
}

export function GameCard({ game, icon }: GameCardProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { selectedIds } = useSelectedPlayers()
  const isOnline = user?.playMode === "online"
  const from = game.colorFrom || game.fallbackColor
  const to = game.colorTo || game.fallbackColor
  // Le nombre de joueurs concerne les salles EN LIGNE (en local, c'est libre).
  const players = isOnline ? playersLabel(game.minPlayers, game.maxPlayers) : null

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isOnline) return
    if (selectedIds.length === 0) {
      e.preventDefault()
      router.push("/joueurs")
    }
  }

  return (
    <Link href={game.path} onClick={handleClick} className="group block">
      <article
        className={cn(
          "relative overflow-hidden rounded-xl border border-white/10 transition-all duration-200",
          "hover:border-white/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] active:scale-[0.98]"
        )}
      >
        <div
          className="absolute inset-0 opacity-90 transition-opacity group-hover:opacity-100"
          style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/45 via-black/25 to-black/10" />

        <div className="relative flex items-center gap-2.5 p-2.5 sm:gap-3 sm:p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-black/30 backdrop-blur-sm sm:h-10 sm:w-10">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-tight text-white sm:text-[0.9rem]">
              {game.title}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/70 sm:text-xs">
              {game.description}
            </p>
          </div>
          {players && (
            <span
              className="absolute right-1.5 top-1.5 rounded-full border border-white/20 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm"
              aria-label={`${players} joueurs`}
            >
              👥 {players}
            </span>
          )}
        </div>
      </article>
    </Link>
  )
}
