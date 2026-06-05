"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Home, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { motion, AnimatePresence } from 'framer-motion'

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

const difficultyOptions: { value: Difficulty; label: string; desc: string; active: string }[] = [
  { value: 'facile',    label: '🌱 Facile',   desc: 'Moins de gorgées, idéal pour débuter',   active: 'from-emerald-500 to-green-600 shadow-emerald-500/30' },
  { value: 'normal',   label: '🌟 Normal',   desc: 'Équilibré pour une soirée agréable',      active: 'from-amber-500 to-yellow-600 shadow-amber-500/30' },
  { value: 'difficile',label: '🔥 Difficile',desc: 'Plus de défis et de gorgées',            active: 'from-orange-500 to-red-600 shadow-orange-500/30' },
  { value: 'extreme',  label: '💀 Extrême',  desc: 'Cul sec possible — réservé aux experts', active: 'from-red-600 to-rose-700 shadow-red-500/30' },
]

export default function PetitBuveurPage() {
  const [gameStarted, setGameStarted] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [showRules, setShowRules] = useState(false)
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => setGameStarted(false)

  if (gameStarted) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={handleGameEnd}
        difficulty={difficulty}
      />
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      {/* Blobs animés */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/20 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-orange-600/15 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/15 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-4 py-8 pb-12">
        {/* Barre de nav */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/jeux"
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
          >
            <Home className="h-4 w-4" />
            Retour
          </Link>
          <span className="text-xs font-medium text-white/30">🍺 Jeu de plateau</span>
        </div>

        {/* Hero */}
        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-4xl shadow-lg shadow-amber-500/30">
            🍺
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Le Petit Buveur</h1>
          <p className="text-sm text-white/50">Avance sur le plateau sans être trop saoul !</p>
        </div>

        {/* Joueurs sélectionnés */}
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            Joueurs sélectionnés
          </p>
          {selectedPlayers.length === 0 ? (
            <p className="text-center text-sm text-white/35">
              Aucun joueur — rendez-vous sur la page Joueurs.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedPlayers.map(p => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium"
                >
                  <span>{p.preferences?.icon ?? '👤'}</span>
                  <span>{p.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Difficulté */}
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            Difficulté
          </p>
          <div className="grid grid-cols-2 gap-2">
            {difficultyOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDifficulty(opt.value)}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${
                  difficulty === opt.value
                    ? `border-transparent bg-gradient-to-r ${opt.active} text-white shadow-lg`
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="block text-sm font-bold">{opt.label}</span>
                <span className={`mt-0.5 block text-xs ${difficulty === opt.value ? 'text-white/80' : 'text-white/35'}`}>
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Règles (collapsible) */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
          <button
            onClick={() => setShowRules(v => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:text-white"
            aria-expanded={showRules}
          >
            <span>Règles du jeu</span>
            {showRules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <AnimatePresence>
            {showRules && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 border-t border-white/10 px-4 py-3 text-sm text-white/55">
                  <p>🎲 Lance le dé à ton tour et avance du nombre de cases.</p>
                  <p>🍺 Selon la case atterrie, bois des gorgées ou relève un défi.</p>
                  <p>⚡ Les cases spéciales déclenchent des effets : échanges, malédictions, protections...</p>
                  <p>🏆 Le premier à atteindre la case 30 gagne la partie !</p>
                  <p className="pt-1 text-xs text-white/30">⚠️ À consommer avec modération.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Message si pas assez de joueurs */}
        {selectedPlayers.length < 2 && (
          <p className="mb-3 text-center text-sm text-white/40">
            Sélectionne au moins 2 joueurs pour commencer.
          </p>
        )}

        {/* Bouton démarrer */}
        <button
          onClick={() => setGameStarted(true)}
          disabled={selectedPlayers.length < 2}
          className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Commencer la partie
        </button>
      </div>
    </div>
  )
}
