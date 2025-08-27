'use client'

import Link from 'next/link'

type Tile = { title: string; href: string; emoji: string; desc: string }

const tiles: Tile[] = [
  { title: 'Plinko', href: '/games/plinko', emoji: '🔵', desc: 'Classique revisité' },
  { title: 'PMU', href: '/games/pmu', emoji: '🏇', desc: 'Parie et trinque' },
  { title: 'Petit Buveur', href: '/games/petit-buveur', emoji: '🎲', desc: 'Défis légers' },
  { title: 'Hi/Lo', href: '/games/hi-lo', emoji: '🃏', desc: 'Plus haut / plus bas' },
  { title: 'Pyramide', href: '/games/pyramide', emoji: '🔺', desc: 'Retourne et progresse' },
  { title: 'Roulette Russe', href: '/games/roulette-russe', emoji: '☠️', desc: 'Ose tenter ta chance' },
  { title: 'Monsieur 3', href: '/games/monsieur-3', emoji: '🎲', desc: 'Évite le 3' },
  { title: 'Ballon Surprise', href: '/games/ballon-surprise', emoji: '🎈', desc: 'Choisis et croise les doigts' },
  { title: 'The Choice', href: '/games/the-choice', emoji: '🎯', desc: 'Chaque choix compte' },
  { title: 'Petits Points', href: '/games/petits-points', emoji: '🎯', desc: 'Précision rapide' },
  { title: 'Course Ballons', href: '/games/course-ballons', emoji: '🎈', desc: 'Éclate au plus vite' },
]

export default function MobilePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-slate-900 text-white">
      <div className="px-5 py-6 space-y-6">
        {/* Hero */}
        <section className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Jeux à Boire</h1>
          <p className="text-sm text-slate-300">Sélection rapide, interface légère, pensée mobile</p>
        </section>

        {/* Grille 2 colonnes permanente */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300">Jeux disponibles</h2>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(tile => (
              <Link key={tile.href} href={tile.href} className="rounded-xl bg-slate-800/80 border border-white/10 p-4 active:scale-[0.99] transition">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{tile.emoji}</span>
                  <div>
                    <div className="text-sm font-semibold">{tile.title}</div>
                    <div className="text-[10px] text-slate-400">{tile.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* All games link */}
        <section className="pt-2">
          <Link href="/" className="block text-center text-sm text-slate-300 underline underline-offset-4">
            Voir l’accueil complet
          </Link>
        </section>
      </div>
    </main>
  )
}
