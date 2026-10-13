"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Game from './components/game'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import {
  LocalGamePrelobby,
  PrelobbyChoice,
  PrelobbyDisclosure,
  PrelobbySection,
} from '@/components/game/LocalGamePrelobby'
import { cn } from '@/lib/utils'

export default function PyramidePage() {
  const t = useTranslations('games.pyramide')
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
  const rowsCardsLabel = t('page.rowsCards', { rows: pyramidHeight, cards: totalCards })
  const funRules = t.raw('page.rulesFun') as string[]
  const classicRules = t.raw('page.rulesClassic') as string[]

  return (
    <LocalGamePrelobby
      gameId="pyramide"
      players={selectedPlayers}
      description={t('tagline')}
      onStart={() => setGameStarted(true)}
    >
      <PrelobbySection label={t('page.gameMode')}>
        <div className="grid grid-cols-2 gap-2">
          {(['fun', 'classic'] as const).map(value => (
            <PrelobbyChoice
              key={value}
              active={gameMode === value}
              onClick={() => setGameMode(value)}
              icon={value === 'fun' ? '🎲' : '🃏'}
              title={t(`page.modes.${value}.label`)}
              description={t(`page.modes.${value}.desc`)}
            />
          ))}
        </div>
      </PrelobbySection>

      {gameMode === 'classic' && (
        <>
          <PrelobbySection label={t('page.decks')}>
            <div className="flex gap-2">
              {([1, 2] as const).map(n => (
                <PrelobbyChoice
                  key={n}
                  className="flex-1"
                  active={deckCount === n}
                  onClick={() => setDeckCount(n)}
                  title={n === 1 ? t('page.deck52') : t('page.deck104')}
                />
              ))}
            </div>
          </PrelobbySection>

          <PrelobbySection label={t('page.cardsPerPlayer')}>
            <div className="flex gap-2">
              {([4, 5] as const).map(n => (
                <PrelobbyChoice
                  key={n}
                  className="flex-1"
                  active={cardsToSelect === n}
                  onClick={() => setCardsToSelect(n)}
                  title={t('page.cardsCount', { n })}
                />
              ))}
            </div>
          </PrelobbySection>
        </>
      )}

      <PrelobbySection
        label={t('page.height')}
        action={
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-bold text-gold">{pyramidHeight}</span>
            <span className="text-xs text-cream/60">{rowsCardsLabel}</span>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-0.5 py-1" aria-hidden="true">
          {Array.from({ length: pyramidHeight }, (_, i) => (
            <div key={i} className="flex gap-0.5">
              {Array.from({ length: i + 1 }, (_, j) => (
                <div
                  key={j}
                  className={cn('h-3 w-3 rounded-sm transition-all', i === 0 ? 'bg-suit-red/80' : 'bg-gold/50')}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-cream/50" aria-hidden="true">3</span>
          <input
            id="pyramid-height"
            type="range"
            min={3}
            max={6}
            step={1}
            value={pyramidHeight}
            aria-label={t('page.height')}
            aria-valuetext={rowsCardsLabel}
            onChange={e => setPyramidHeight(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-black/30 accent-amber-500"
          />
          <span className="text-xs text-cream/50" aria-hidden="true">6</span>
        </div>
      </PrelobbySection>

      <PrelobbyDisclosure
        label={t('page.rulesTitle')}
        open={showRules}
        onToggle={() => setShowRules(v => !v)}
      >
        <div className="space-y-1.5 text-sm text-cream/70">
          {(gameMode === 'fun' ? funRules : classicRules).map((rule, i) => (
            <p key={i}>{rule}</p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
