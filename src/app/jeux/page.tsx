"use client"

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GAMES } from '@/lib/games'
import { PlinkoIcon, RaceFlagIcon, WheelIcon, BeerIcon, HiLoIcon, PurpleIcon, PyramidIcon, PistolIcon, BalloonIcon, TargetIcon, CrosshairIcon, DieThreeIcon, HangmanIcon, TrialMotoIcon, Dice1220Icon } from '@/components/icons/GameIcons'

function GameIconById({ id, className }: { id: string; className?: string }) {
  if (id === 'plinko') return <PlinkoIcon className={className} />
  if (id === 'pmu') return <RaceFlagIcon className={className} />
  if (id === 'petit-buveur') return <BeerIcon className={className} />
  if (id === 'hi-lo') return <HiLoIcon className={className} />
  if (id === 'purple') return <PurpleIcon className={className} />
  if (id === 'pyramide') return <PyramidIcon className={className} />
  if (id === 'roulette-russe') return <PistolIcon className={className} />
  if (id === 'monsieur-3') return <DieThreeIcon className={className} />
  if (id === 'ballon-surprise') return <BalloonIcon className={className} />
  if (id === 'petits-points') return <CrosshairIcon className={className} />
  if (id === 'roue-des-gorgees') return <WheelIcon className={className} />
  if (id === 'pendu') return <HangmanIcon className={className} />
  if (id === 'trial-poursuite') return <TrialMotoIcon className={className} />
  if (id === '1220') return <Dice1220Icon className={className} />
  return <span className={className}>🎮</span>
}

export default function GamesHubPage() {
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GAMES
    return GAMES.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.id.toLowerCase().includes(q)
    )
  }, [query])

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="relative container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold flex-1 bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300">Tous les jeux</h1>
          <div className="flex gap-2">
            <Button 
              variant={layout === 'grid' ? 'default' : 'outline'} 
              onClick={() => setLayout('grid')}
              className={layout === 'grid' 
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white' 
                : 'border-white/20 text-white hover:bg-white/10'}
            >
              Grille
            </Button>
            <Button 
              variant={layout === 'list' ? 'default' : 'outline'} 
              onClick={() => setLayout('list')}
              className={layout === 'list' 
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white' 
                : 'border-white/20 text-white hover:bg-white/10'}
            >
              Liste
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input
            placeholder="Rechercher un jeu (nom, description)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/60"
          />
        </div>

        {layout === 'grid' ? (
          <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(game => (
              <Link key={game.id} href={game.path} className="group">
                <Card className={`relative overflow-hidden p-4 h-full transition-all transform-gpu group-hover:scale-[1.01] border border-white/10`}
                  style={{ backgroundImage: `linear-gradient(135deg, ${game.colorFrom || game.fallbackColor}, ${game.colorTo || game.fallbackColor})` }}>
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="relative flex items-start gap-3">
                    <div className="shrink-0 text-3xl">
                      <GameIconById id={game.id} className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-white">{game.title}</div>
                      <p className="text-sm text-amber-200/80 line-clamp-2">{game.description}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(game => (
              <Link key={game.id} href={game.path} className="group">
                <Card className={`relative overflow-hidden p-4 transition-transform border border-white/10 hover:scale-[1.01]`}
                  style={{ backgroundImage: `linear-gradient(90deg, ${game.colorFrom || game.fallbackColor}, ${game.colorTo || game.fallbackColor})` }}>
                  <div className="absolute inset-0 bg-black/25" />
                  <div className="relative flex items-center gap-3">
                    <div className="text-2xl shrink-0">
                      <GameIconById id={game.id} className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{game.title}</div>
                      <p className="text-sm text-amber-200/80">{game.description}</p>
                    </div>
                    <span className="text-xs text-amber-300/80">Aller ➔</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}



