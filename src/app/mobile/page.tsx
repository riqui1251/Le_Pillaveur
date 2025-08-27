'use client'

import Link from 'next/link'
import { PlinkoIcon, RaceFlagIcon, WheelIcon, BeerIcon, HiLoIcon, PyramidIcon, PistolIcon, BalloonIcon, TargetIcon, CrosshairIcon, DieThreeIcon } from '@/components/icons/GameIcons'
import { GAMES } from '@/lib/games'

type Tile = { title: string; href: string; emoji: string; desc: string }

type IconComponent = (p: { className?: string }) => React.ReactElement
const tiles: (Tile & { Icon: IconComponent; game: any })[] = GAMES.map(g => ({
  title: g.title,
  href: g.path,
  emoji: g.emoji,
  desc: g.description,
  game: g,
  Icon: g.id === 'plinko' ? PlinkoIcon
    : g.id === 'pmu' ? RaceFlagIcon
    : g.id === 'petit-buveur' ? BeerIcon
    : g.id === 'hi-lo' ? HiLoIcon
    : g.id === 'pyramide' ? PyramidIcon
    : g.id === 'roulette-russe' ? PistolIcon
    : g.id === 'monsieur-3' ? DieThreeIcon
    : g.id === 'ballon-surprise' ? BalloonIcon
    : g.id === 'the-choice' ? TargetIcon
    : g.id === 'petits-points' ? CrosshairIcon
    : g.id === 'roue-des-gorgees' ? WheelIcon
    : ((p:{className?:string}) => <span className={p.className}>🎮</span>)
}))

export default function MobilePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-slate-900 text-white">
      <div className="px-5 py-6 space-y-6">
        <section className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Jeux à Boire
          </h1>
          <p className="text-sm text-slate-300">Sélection rapide, interface légère, pensée mobile</p>
        </section>

        {/* Grille 2 colonnes permanente */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300">Jeux disponibles</h2>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(tile => (
              <Link 
                key={tile.href} 
                href={tile.href} 
                className="group relative overflow-hidden rounded-xl border border-white/10 active:scale-[0.99] transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: `linear-gradient(135deg, ${tile.game.colorFrom}, ${tile.game.colorTo})`
                }}
              >
                {/* Overlay sombre pour améliorer la lisibilité */}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
                
                {/* Contenu */}
                <div className="relative p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <tile.Icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white truncate">{tile.title}</div>
                      <div className="text-[10px] text-white/80 line-clamp-2">{tile.desc}</div>
                    </div>
                  </div>
                </div>

                {/* Effet de brillance au survol */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="pt-2">
          <Link 
            href="/" 
            className="block text-center text-sm text-slate-300 underline underline-offset-4 hover:text-white transition-colors"
          >
            Voir l&apos;accueil complet
          </Link>
        </section>
      </div>
    </main>
  )
}


