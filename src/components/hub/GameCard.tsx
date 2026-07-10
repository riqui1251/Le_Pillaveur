"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { LocalizedGameMeta } from "@/lib/games-i18n"
import { PlayingCard, suitIsRed } from "@/components/ui/PlayingCard"
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

/**
 * Tuile de jeu « Cartes sur Table » : chaque jeu est une carte à jouer crème
 * posée sur le feutre — coin rang+enseigne, icône teintée par la famille
 * (♥♦ rouge carreau, ♠♣ encre), titre en Playfair.
 */
export function GameCard({ game, icon }: GameCardProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { selectedIds } = useSelectedPlayers()
  const isOnline = user?.playMode === "online"
  // Le nombre de joueurs concerne les salles EN LIGNE (en local, c'est libre).
  const players = isOnline ? playersLabel(game.minPlayers, game.maxPlayers) : null
  const red = game.suit ? suitIsRed(game.suit) : false

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isOnline) return
    if (selectedIds.length === 0) {
      e.preventDefault()
      router.push("/joueurs")
    }
  }

  return (
    <Link href={game.path} onClick={handleClick} className="group block">
      <PlayingCard
        suit={game.suit}
        rank={game.rank}
        className={cn(
          "h-full transition-all duration-200",
          "group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)]",
          "group-active:scale-[0.98]"
        )}
      >
        <article className="flex items-center gap-2.5 py-2.5 pl-6 pr-2.5 sm:gap-3 sm:py-3 sm:pr-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border sm:h-10 sm:w-10",
              red
                ? "border-suit-red/30 bg-suit-red/10 text-suit-red"
                : "border-[#24201A]/20 bg-[#24201A]/5 text-[#24201A]"
            )}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-sm font-bold leading-tight text-[#24201A] sm:text-[0.95rem]">
              {game.title}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#6B6455] sm:text-xs">
              {game.description}
            </p>
          </div>
          {players && (
            <span
              className="absolute right-1.5 top-1 rounded-full border border-[#24201A]/15 bg-[#24201A]/5 px-1.5 py-0.5 text-[9px] font-bold text-[#4A443A]"
              aria-label={`${players} joueurs`}
            >
              {players} j.
            </span>
          )}
        </article>
      </PlayingCard>
    </Link>
  )
}
