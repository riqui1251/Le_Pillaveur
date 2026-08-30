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
  if (!max || max >= 20) return `${min}+`
  if (max === min) return `${min}`
  return `${min}-${max}`
}

/**
 * Tuile de jeu « Vitrine » : mini-carte à jouer verticale — coin rang+enseigne,
 * icône en vedette teintée par la famille (♥♦ rouge carreau, ♠♣ encre), titre
 * Playfair centré. La description vit dans le briefing du lobby, pas ici :
 * les 13 jeux tiennent sur un seul écran.
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
    // Visiteur sans session : laisser passer vers la page du jeu, qui propose
    // « Essayer avec des bots » (online) ou la vitrine locale — surtout pas
    // le détour par la gestion de joueurs locaux.
    if (!user) return
    if (selectedIds.length === 0) {
      e.preventDefault()
      router.push("/joueurs")
    }
  }

  return (
    <Link href={game.path} onClick={handleClick} className="group block h-full" title={game.description}>
      <PlayingCard
        suit={game.suit}
        rank={game.rank}
        className={cn(
          "h-full transition-all duration-200",
          "group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)]",
          "group-active:scale-[0.98]"
        )}
      >
        <article className="flex h-full min-h-[5.5rem] flex-col items-center px-1.5 pb-1.5 pt-3 text-center sm:min-h-[6rem]">
          <div className={cn(red ? "text-suit-red" : "text-[#24201A]")}>{icon}</div>
          <h3 className="mt-1 line-clamp-2 font-display text-[11px] font-bold leading-tight text-[#24201A] sm:text-xs">
            {game.title}
          </h3>
          {players && (
            <span className="mt-auto pt-0.5 text-[9px] font-bold text-[#6B6455]" aria-label={`${players} joueurs`}>
              {players} j.
            </span>
          )}
        </article>
      </PlayingCard>
    </Link>
  )
}
