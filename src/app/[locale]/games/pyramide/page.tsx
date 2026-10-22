"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Layers, Minus, Plus, Shuffle } from 'lucide-react'
import Game from './components/game'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import {
  LocalGamePrelobby,
  PrelobbyChoice,
  PrelobbyDisclosure,
  PrelobbySection,
} from '@/components/game/LocalGamePrelobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MIN_HEIGHT = 3
const MAX_HEIGHT = 6

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
  const rules = gameMode === 'fun'
    ? [t('page.rules.fun.flip'), t('page.rules.fun.drink'), t('page.rules.fun.summit')]
    : [t('page.rules.classic.prelude'), t('page.rules.classic.memorize'), t('page.rules.classic.give')]

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
              icon={value === 'fun'
                ? <Shuffle className="h-5 w-5 text-gold" />
                : <Layers className="h-5 w-5 text-gold" />}
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
        action={<span className="text-xs text-cream/70">{rowsCardsLabel}</span>}
      >
        {/* Sélecteur − N + : le curseur natif faisait 6 px de haut, une cible
            ratée sur deux au doigt, et sans surface visible sur le feutre. */}
        <div className="flex items-center justify-center gap-5">
          <Button
            variant="quiet"
            size="gameIcon"
            aria-label={t('page.heightLess')}
            disabled={pyramidHeight <= MIN_HEIGHT}
            onClick={() => setPyramidHeight(h => Math.max(MIN_HEIGHT, h - 1))}
          >
            <Minus aria-hidden className="h-5 w-5" />
          </Button>
          <p aria-live="polite" className="w-12 text-center font-display text-3xl font-bold leading-none tabular-nums text-gold">
            <span aria-hidden>{pyramidHeight}</span>
            <span className="sr-only">{rowsCardsLabel}</span>
          </p>
          <Button
            variant="quiet"
            size="gameIcon"
            aria-label={t('page.heightMore')}
            disabled={pyramidHeight >= MAX_HEIGHT}
            onClick={() => setPyramidHeight(h => Math.min(MAX_HEIGHT, h + 1))}
          >
            <Plus aria-hidden className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-3 flex flex-col items-center gap-0.5" aria-hidden="true">
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
      </PrelobbySection>

      <PrelobbyDisclosure
        label={t('page.rulesTitle')}
        open={showRules}
        onToggle={() => setShowRules(v => !v)}
      >
        <div className="space-y-1.5 text-sm text-cream/70">
          {rules.map((rule, i) => (
            <p key={i}>{rule}</p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
