"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { getColorFromClass } from '@/lib/playerUtils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import Game, { DifficultyLevel } from './components/game'

const DIFFICULTIES: {
  id: DifficultyLevel
  label: string
  range: string
  desc: string
  emoji: string
  colorFrom: string
  colorTo: string
}[] = [
  {
    id: 'easy',
    label: 'Facile',
    range: '1–2 gorgées',
    desc: 'Idéal pour débuter',
    emoji: '🌱',
    colorFrom: '#10b981',
    colorTo: '#14b8a6',
  },
  {
    id: 'medium',
    label: 'Moyen',
    range: '1–3 gorgées',
    desc: 'Le bon équilibre',
    emoji: '🔥',
    colorFrom: '#f59e0b',
    colorTo: '#f97316',
  },
  {
    id: 'hard',
    label: 'Difficile',
    range: '1–4 gorgées',
    desc: 'Pour les courageux',
    emoji: '💀',
    colorFrom: '#ef4444',
    colorTo: '#e11d48',
  },
]

export default function PlinkoPage() {
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium')
  const [cumulative, setCumulative] = useState(false)
  const [gameKey, setGameKey] = useState(0)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const canStart = selectedPlayers.length >= 2

  if (gameStarted) {
    return (
      <Game
        key={gameKey}
        players={selectedPlayers}
        onGameEnd={() => { setGameStarted(false); setGameKey(k => k + 1) }}
        onRestartGame={() => setGameKey(k => k + 1)}
        difficulty={difficulty}
        isCumulativeMode={cumulative}
      />
    )
  }

  if (!canStart) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07060b] px-4 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-violet-600/20 blur-[110px]" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-purple-700/25 blur-[100px]" />
        </div>
        <div className="relative flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500 to-violet-600 text-4xl shadow-2xl">
            🎯
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white">Plinko</h1>
            <p className="mt-2 text-sm text-white/55">Lancez des balles, distribuez des gorgées</p>
          </div>
          <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/80">
            Aucun joueur sélectionné. Retournez sur la page Joueurs pour constituer votre équipe (minimum 2).
          </div>
          <Link
            href="/joueurs"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Sélectionner des joueurs
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07060b] px-4 py-10 text-white">
      {/* Blobs décoratifs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-purple-700/25 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm space-y-6">

        {/* En-tête */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-600 to-purple-700 text-3xl shadow-xl">
            🎯
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Plinko</h1>
            <p className="mt-1 text-sm text-white/50">Lancez des balles, distribuez des gorgées</p>
          </div>
        </div>

        {/* Joueurs */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/35">
            Joueurs — {selectedPlayers.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedPlayers.map(p => {
              const bg = getColorFromClass(p.preferences.color)
              return (
                <div key={p.id} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                  <Avatar className="h-6 w-6 border border-white/20" style={{ backgroundColor: bg }}>
                    <AvatarFallback className="text-[10px] font-bold text-white" style={{ backgroundColor: bg }}>
                      {p.preferences.icon || p.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium text-white/80">{p.name}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Difficulté */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/35">Difficulté</p>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map(d => {
              const active = difficulty === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={cn(
                    'relative overflow-hidden rounded-2xl border p-3 text-left transition-all duration-150 active:scale-95',
                    active ? 'border-white/25' : 'border-white/10 hover:border-white/20',
                  )}
                >
                  <div
                    className={cn('absolute inset-0 transition-opacity', active ? 'opacity-30' : 'opacity-8')}
                    style={{ background: `linear-gradient(135deg, ${d.colorFrom}, ${d.colorTo})` }}
                  />
                  <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl transition-opacity"
                    style={{ background: `linear-gradient(to bottom, ${d.colorFrom}, ${d.colorTo})`, opacity: active ? 1 : 0.3 }} />
                  <div className="relative">
                    <span className="block text-xl">{d.emoji}</span>
                    <span className={cn('mt-1 block text-xs font-bold', active ? 'text-white' : 'text-white/60')}>{d.label}</span>
                    <span className="block text-[10px] text-white/40">{d.range}</span>
                    {active && <CheckCircle2 className="mt-1 h-3 w-3 text-white/70" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Mode cumulatif */}
        <button
          onClick={() => setCumulative(v => !v)}
          className={cn(
            'relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.99]',
            cumulative ? 'border-violet-500/40' : 'border-white/10 hover:border-white/20',
          )}
        >
          <div className={cn('absolute inset-0 transition-opacity', cumulative ? 'opacity-20' : 'opacity-0')}
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }} />
          <div className="relative flex items-start gap-3">
            <div className={cn(
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
              cumulative ? 'border-violet-400 bg-violet-500' : 'border-white/20 bg-white/[0.05]',
            )}>
              {cumulative && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
            </div>
            <div>
              <p className={cn('text-sm font-semibold', cumulative ? 'text-white' : 'text-white/70')}>Mode Cumulatif</p>
              <p className="mt-0.5 text-xs text-white/40">Les effets multiplicateurs et +/- s&apos;accumulent sur le tour</p>
            </div>
          </div>
        </button>

        {/* Bouton lancer */}
        <button
          onClick={() => setGameStarted(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:from-violet-500 hover:to-purple-600 active:scale-[0.98]"
        >
          Commencer la partie
        </button>

        <Link
          href="/jeux"
          className="flex items-center justify-center gap-2 text-sm text-white/35 transition-colors hover:text-white/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux jeux
        </Link>
      </div>
    </main>
  )
}
