"use client"

import { useMemo, useState } from "react"
import { Search, Sparkles } from "lucide-react"
import { GAMES } from "@/lib/games"
import { HubShell } from "@/components/hub/HubShell"
import { SelectedPlayersBar } from "@/components/hub/SelectedPlayersBar"
import { GameCard } from "@/components/hub/GameCard"
import { Input } from "@/components/ui/input"
import {
  PlinkoIcon,
  RaceFlagIcon,
  WheelIcon,
  BeerIcon,
  HiLoIcon,
  PurpleIcon,
  PyramidIcon,
  PistolIcon,
  BalloonIcon,
  CrosshairIcon,
  DieThreeIcon,
  HangmanIcon,
  TrialMotoIcon,
  Dice1220Icon,
} from "@/components/icons/GameIcons"

function GameIconById({ id, className }: { id: string; className?: string }) {
  if (id === "plinko") return <PlinkoIcon className={className} />
  if (id === "pmu") return <RaceFlagIcon className={className} />
  if (id === "petit-buveur") return <BeerIcon className={className} />
  if (id === "hi-lo") return <HiLoIcon className={className} />
  if (id === "purple") return <PurpleIcon className={className} />
  if (id === "pyramide") return <PyramidIcon className={className} />
  if (id === "roulette-russe") return <PistolIcon className={className} />
  if (id === "monsieur-3") return <DieThreeIcon className={className} />
  if (id === "ballon-surprise") return <BalloonIcon className={className} />
  if (id === "petits-points") return <CrosshairIcon className={className} />
  if (id === "roue-des-gorgees") return <WheelIcon className={className} />
  if (id === "pendu") return <HangmanIcon className={className} />
  if (id === "trial-poursuite") return <TrialMotoIcon className={className} />
  if (id === "1220") return <Dice1220Icon className={className} />
  return <span className={className}>🎮</span>
}

export default function GamesHubPage() {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = GAMES.filter(g => !g.hidden)
    if (!q) return visible
    return visible.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
    )
  }, [query])

  return (
    <HubShell
      step="jeux"
      title="Choisissez votre jeu"
      subtitle="Des classiques aux nouveautés — trouvez l'ambiance parfaite pour votre soirée."
      headerExtra={<SelectedPlayersBar />}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            placeholder="Rechercher un jeu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 border-white/10 bg-white/[0.05] pl-10 text-white placeholder:text-white/45 focus-visible:ring-amber-400/40"
          />
        </div>
        <span className="shrink-0 text-xs text-white/45">
          {filtered.length} jeu{filtered.length > 1 ? "x" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
          <Sparkles className="mb-3 h-7 w-7 text-amber-300/60" />
          <p className="font-medium text-white/80">Aucun jeu trouvé</p>
          <p className="mt-1 text-sm text-white/50">Essayez un autre mot-clé.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {filtered.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              icon={<GameIconById id={game.id} className="h-5 w-5 sm:h-6 sm:w-6" />}
            />
          ))}
        </div>
      )}
    </HubShell>
  )
}
