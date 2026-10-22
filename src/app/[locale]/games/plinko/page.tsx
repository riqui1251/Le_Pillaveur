"use client"

import { useState, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { Flame, Skull, Sprout } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { LocalGamePrelobby, PrelobbyChoice, PrelobbySection } from '@/components/game/LocalGamePrelobby'
import Game, { DifficultyLevel } from './components/game'

const DIFFICULTY_IDS: DifficultyLevel[] = ['easy', 'medium', 'hard']
const DIFFICULTY_ICONS: Record<DifficultyLevel, ComponentType<{ className?: string }>> = { easy: Sprout, medium: Flame, hard: Skull }

export default function PlinkoPage() {
  const t = useTranslations('games.plinko')
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium')
  const [cumulative, setCumulative] = useState(false)
  const [gameKey, setGameKey] = useState(0)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

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

  return (
    <LocalGamePrelobby
      gameId="plinko"
      players={selectedPlayers}
      description={t('tagline')}
      onStart={() => setGameStarted(true)}
    >
      <PrelobbySection label={t('page.difficulty')}>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTY_IDS.map(id => {
            const Icon = DIFFICULTY_ICONS[id]
            return (
              <PrelobbyChoice
                key={id}
                active={difficulty === id}
                onClick={() => setDifficulty(id)}
                icon={<Icon className="h-5 w-5 text-gold" />}
                title={t(`page.difficulties.${id}.label`)}
                description={t(`page.difficulties.${id}.range`)}
              />
            )
          })}
        </div>
      </PrelobbySection>

      <PrelobbyChoice
        className="rounded-2xl px-4"
        active={cumulative}
        onClick={() => setCumulative(v => !v)}
        title={t('page.cumulativeMode')}
        description={t('page.cumulativeDesc')}
      />
    </LocalGamePrelobby>
  )
}
