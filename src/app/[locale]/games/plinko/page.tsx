"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import Game, { DifficultyLevel } from './components/game'

const DIFFICULTY_IDS: DifficultyLevel[] = ['easy', 'medium', 'hard']

export default function PlinkoPage() {
  const t = useTranslations('games.plinko')
  const tPlayers = useTranslations('players')
  const tCommon = useTranslations('common')
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
            <h1 className="text-3xl font-extrabold text-white">{t('title')}</h1>
            <p className="mt-2 text-sm text-white/55">{t('tagline')}</p>
          </div>
          <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/80">
            {t('page.noPlayers')}
          </div>
          <Link
            href="/joueurs"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {tPlayers('selectTitle')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07060b] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-purple-700/25 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-600 to-purple-700 text-3xl shadow-xl">
            🎯
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">{t('title')}</h1>
            <p className="mt-1 text-sm text-white/50">{t('tagline')}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/35">
            {tCommon('players')} — {selectedPlayers.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedPlayers.map(p => (
              <div key={p.id} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                <PlayerIcon player={p} size="sm" />
                <span className="text-xs font-medium">
                  <PlayerName player={p} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/35">{t('page.difficulty')}</p>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_IDS.map(id => {
              const active = difficulty === id
              const emoji = id === 'easy' ? '🌱' : id === 'medium' ? '🔥' : '💀'
              const colorFrom = id === 'easy' ? '#10b981' : id === 'medium' ? '#f59e0b' : '#ef4444'
              const colorTo = id === 'easy' ? '#14b8a6' : id === 'medium' ? '#f97316' : '#e11d48'
              return (
                <button
                  key={id}
                  onClick={() => setDifficulty(id)}
                  className={cn(
                    'relative overflow-hidden rounded-2xl border p-3 text-left transition-all duration-150 active:scale-95',
                    active ? 'border-white/25' : 'border-white/10 hover:border-white/20',
                  )}
                >
                  <div
                    className={cn('absolute inset-0 transition-opacity', active ? 'opacity-30' : 'opacity-8')}
                    style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}
                  />
                  <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl transition-opacity"
                    style={{ background: `linear-gradient(to bottom, ${colorFrom}, ${colorTo})`, opacity: active ? 1 : 0.3 }} />
                  <div className="relative">
                    <span className="block text-xl">{emoji}</span>
                    <span className={cn('mt-1 block text-xs font-bold', active ? 'text-white' : 'text-white/60')}>{t(`page.difficulties.${id}.label`)}</span>
                    <span className="block text-[10px] text-white/40">{t(`page.difficulties.${id}.range`)}</span>
                    {active && <CheckCircle2 className="mt-1 h-3 w-3 text-white/70" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

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
              <p className={cn('text-sm font-semibold', cumulative ? 'text-white' : 'text-white/70')}>{t('page.cumulativeMode')}</p>
              <p className="mt-0.5 text-xs text-white/40">{t('page.cumulativeDesc')}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setGameStarted(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:from-violet-500 hover:to-purple-600 active:scale-[0.98]"
        >
          {tPlayers('startGame')}
        </button>

        <Link
          href="/jeux"
          className="flex items-center justify-center gap-2 text-sm text-white/35 transition-colors hover:text-white/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('page.backToGames')}
        </Link>
      </div>
    </main>
  )
}
