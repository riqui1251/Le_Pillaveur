"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { Link } from '@/i18n/navigation'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { PurpleOnline } from '@/components/online/PurpleOnline'
import Game from './components/game'

export type GameMode = 'standard' | 'traversee'

export default function PurplePage() {
  const t = useTranslations('games.purple')
  const tCatalog = useTranslations('games.catalog')
  const tPlayers = useTranslations('players')
  const tCommon = useTranslations('common')
  const tNav = useTranslations('games.1220')
  const { user } = useAuth()
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const canStart = selectedPlayers.length >= 2

  // Mode en ligne : lobby + partie serveur-autoritaire (indépendant du flux local).
  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-[#07060b] sm:top-[3.75rem]">
        <PurpleOnline />
      </div>
    )
  }

  if (gameStarted && canStart) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
        gameMode="standard"
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
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600 to-purple-700 text-4xl shadow-2xl">
            🃏
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white">{t('title')}</h1>
            <p className="mt-2 text-sm text-white/55">{tCatalog('purple.description')}</p>
          </div>
          <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/80">
            {tPlayers('selectionStatus.needMore', { min: 2, current: selectedPlayers.length })}
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
            🃏
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">{t('title')}</h1>
            <p className="mt-1 text-sm text-white/50">{tCatalog('purple.description')}</p>
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
          {tNav('backToGames')}
        </Link>
      </div>
    </main>
  )
}
