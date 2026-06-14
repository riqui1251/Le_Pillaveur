"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Game from './components/game'
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export default function PyramidePage() {
  const t = useTranslations('games.pyramide')
  const tPlayers = useTranslations('players')
  const tCommon = useTranslations('common')
  const { players } = usePlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [pyramidHeight, setPyramidHeight] = useState(5)
  const [gameMode, setGameMode] = useState<'fun' | 'classic'>('fun')
  const [deckCount, setDeckCount] = useState<1 | 2>(1)
  const [cardsToSelect, setCardsToSelect] = useState<4 | 5>(4)
  const [showRules, setShowRules] = useState(false)
  const { selectedIds } = useSelectedPlayers()

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const canStart = selectedPlayers.length >= 2

  if (gameStarted && canStart) {
    return (
      <Game
        players={selectedPlayers}
        pyramidHeight={pyramidHeight}
        onGameEnd={() => setGameStarted(false)}
        gameMode={gameMode}
        deckCount={deckCount}
        cardsToSelect={cardsToSelect}
      />
    )
  }

  const totalCards = (pyramidHeight * (pyramidHeight + 1)) / 2
  const funRules = t.raw('page.rulesFun') as string[]
  const classicRules = t.raw('page.rulesClassic') as string[]

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden bg-[#07060b] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-amber-600/15 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-yellow-500/10 blur-[110px]" />
      </div>

      <div className="relative w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500 to-orange-600 text-3xl shadow-xl">
            🔺
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">{t('title')}</h1>
            <p className="mt-1 text-sm text-white/50">{t('tagline')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/60">{t('page.gameMode')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['fun', 'classic'] as const).map(value => (
              <button
                key={value}
                onClick={() => setGameMode(value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl border p-4 text-center transition-all',
                  gameMode === value
                    ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                    : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                )}
              >
                <span className="text-2xl">{value === 'fun' ? '🎲' : '🃏'}</span>
                <span className={cn('font-bold text-sm', gameMode === value ? 'text-amber-300' : 'text-white/80')}>{t(`page.modes.${value}.label`)}</span>
                <span className="text-[10px] text-white/40">{t(`page.modes.${value}.desc`)}</span>
              </button>
            ))}
          </div>
        </div>

        {gameMode === 'classic' && (
          <div className="rounded-2xl border border-amber-800/20 bg-amber-950/20 p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/60">{t('page.decks')}</p>
              <div className="flex gap-2">
                {([1, 2] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setDeckCount(n)}
                    className={cn(
                      'flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all',
                      deckCount === n
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.07]'
                    )}
                  >
                    {n === 1 ? t('page.deck52') : t('page.deck104')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/60">{t('page.cardsPerPlayer')}</p>
              <div className="flex gap-2">
                {([4, 5] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setCardsToSelect(n)}
                    className={cn(
                      'flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all',
                      cardsToSelect === n
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.07]'
                    )}
                  >
                    {t('page.cardsCount', { n })}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="pyramid-height" className="text-xs font-semibold uppercase tracking-widest text-amber-400/70">{t('page.height')}</label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold text-amber-300">{pyramidHeight}</span>
              <span className="text-xs text-white/50">{t('page.rowsCards', { rows: pyramidHeight, cards: totalCards })}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5 py-1" aria-hidden="true">
            {Array.from({ length: pyramidHeight }, (_, i) => (
              <div key={i} className="flex gap-0.5">
                {Array.from({ length: i + 1 }, (_, j) => (
                  <div
                    key={j}
                    className={cn(
                      'h-3 w-3 rounded-sm transition-all',
                      i === 0 ? 'bg-red-500/70' : 'bg-amber-500/50'
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50" aria-hidden="true">3</span>
            <input
              id="pyramid-height"
              type="range"
              min={3}
              max={6}
              step={1}
              value={pyramidHeight}
              aria-valuetext={t('page.rowsCards', { rows: pyramidHeight, cards: totalCards })}
              onChange={e => setPyramidHeight(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-amber-500"
            />
            <span className="text-xs text-white/50" aria-hidden="true">6</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/35">
            {tCommon('players')} — {selectedPlayers.length}
          </p>
          {selectedPlayers.length === 0 ? (
            <p className="text-sm text-white/30 italic">{t('page.noPlayersSelected')}</p>
          ) : (
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
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
          <button
            onClick={() => setShowRules(v => !v)}
            aria-expanded={showRules}
            aria-controls="rules-panel"
            className="flex w-full items-center justify-between px-4 py-3 text-sm text-white/60 hover:text-white/80"
          >
            <span className="font-medium">{t('page.rulesTitle')}</span>
            {showRules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showRules && (
            <div id="rules-panel" className="border-t border-white/10 px-4 pb-4 pt-3 text-xs text-white/60 space-y-1.5">
              {(gameMode === 'fun' ? funRules : classicRules).map((rule, i) => (
                <p key={i}>{rule}</p>
              ))}
            </div>
          )}
        </div>

        {!canStart ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/80 text-center">
              {t('page.needPlayers')}
            </div>
            <Link
              href="/joueurs"
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {tPlayers('selectTitle')}
            </Link>
          </div>
        ) : (
          <button
            onClick={() => setGameStarted(true)}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:from-amber-400 hover:to-orange-500 active:scale-[0.98]"
          >
            {tPlayers('startGame')}
          </button>
        )}

        <Link
          href="/jeux"
          className="flex items-center justify-center gap-2 text-sm text-white/30 transition-colors hover:text-white/55"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('page.backToGames')}
        </Link>
      </div>
    </main>
  )
}
