"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { useLinkStatus } from "next/link"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { LocalizedGameMeta } from "@/lib/games-i18n"
import { PlayingCard, suitIsRed } from "@/components/ui/PlayingCard"
import { cn } from "@/lib/utils"
import { ReactNode, useTransition } from "react"
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
 * Voile « ça s'ouvre » posé sur la carte le temps de la navigation. Sur un
 * réseau de soirée, toucher une tuile laissait 1 à 3 s sans AUCUN retour :
 * les joueurs tapaient une deuxième fois ou décrétaient que « ça marche
 * pas ». `useLinkStatus` lit le statut du <Link> parent par contexte — il
 * doit donc vivre dans un composant ENFANT du lien, pas dans GameCard.
 * `forced` couvre le détour par /joueurs (router.push après preventDefault),
 * que le lien ne voit jamais passer et dont il ne saurait rien.
 */
function OpeningVeil({ forced, label }: { forced: boolean; label: string }) {
  const { pending } = useLinkStatus()
  if (!pending && !forced) return null
  return (
    <div
      role="status"
      aria-label={label}
      // Le voile couvre toute la carte : un second tap l'atteint lui, et on
      // l'avale ici — sinon il relancerait la navigation (ou la redirection)
      // déjà en cours.
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-[#24201A]/25"
    >
      <Loader2 className="h-5 w-5 animate-spin text-[#24201A]" aria-hidden />
    </div>
  )
}

/**
 * Tuile de jeu « Vitrine » : mini-carte à jouer verticale — coin rang+enseigne,
 * icône en vedette teintée par la famille (♥♦ rouge carreau, ♠♣ encre), titre
 * Playfair centré et accroche sur deux lignes — 22 noms de code sans un mot
 * d'explication ne se choisissent pas au doigt.
 */
export function GameCard({ game, icon }: GameCardProps) {
  const t = useTranslations("hub.jeux")
  const router = useRouter()
  const { user } = useAuth()
  const { selectedIds } = useSelectedPlayers()
  // Détour par /joueurs : le lien est court-circuité (preventDefault), son
  // statut reste donc « idle » — c'est cette transition qui porte le retour
  // visuel à sa place, jusqu'à ce que la page des joueurs soit montée.
  const [redirecting, startRedirect] = useTransition()
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
      // `?next=` : une fois les joueurs cochés, /joueurs renvoie directement
      // vers le jeu choisi au lieu de laisser retrouver la tuile dans le hub.
      // Encodé comme les autres émetteurs (useRequireSelectedPlayers,
      // SelectedPlayersDisplay) : searchParams.get le rend tel quel à la
      // garde, qui le compare à l'exact au catalogue.
      startRedirect(() => {
        router.push(`/joueurs?next=${encodeURIComponent(game.path)}`)
      })
    }
  }

  // `touch-manipulation` : ni délai de 300 ms ni zoom sur un double tap — le
  // doigt impatient ne doit rien déclencher d'autre que la navigation.
  return (
    <Link href={game.path} onClick={handleClick} className="group block h-full touch-manipulation" title={game.description}>
      <PlayingCard
        suit={game.suit}
        rank={game.rank}
        className={cn(
          "h-full transition-all duration-200",
          "group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)]",
          "group-active:scale-[0.98]"
        )}
      >
        {/* Badge 🤖 « jouable avec des bots » — coin haut-droit, libre sur la
            mini-carte (le rang+enseigne occupe haut-gauche et bas-droite). */}
        {game.botsFillable && (
          <span
            role="img"
            aria-label={t("botsBadge")}
            title={t("botsBadge")}
            className="absolute right-1 top-0.5 select-none text-[10px] opacity-60 transition-opacity group-hover:opacity-90"
          >
            🤖
          </span>
        )}
        <article className="flex h-full min-h-[7rem] flex-col items-center px-1.5 pb-1.5 pt-3 text-center sm:min-h-[7.5rem]">
          <div className={cn(red ? "text-suit-red" : "text-[#24201A]")}>{icon}</div>
          <h3 className="mt-1 line-clamp-2 font-display text-[11px] font-bold leading-tight text-[#24201A] sm:text-xs">
            {game.title}
          </h3>
          {/* L'accroche ne vivait que dans le `title=` du lien : invisible au
              doigt, le hub n'était qu'une liste de noms de code. Deux lignes
              maximum — au-delà, la colonne de 375/3 px déborde de la carte
              (le `title=` du lien garde le texte entier au survol). */}
          <p className="mt-0.5 line-clamp-2 text-[9px] leading-[1.25] text-[#6B6455] sm:text-[10px]">
            {game.description}
          </p>
          {players && (
            <span className="mt-auto pt-0.5 text-[9px] font-bold text-[#6B6455]" aria-label={`${players} joueurs`}>
              {players} j.
            </span>
          )}
        </article>
        <OpeningVeil forced={redirecting} label={t("opening")} />
      </PlayingCard>
    </Link>
  )
}
