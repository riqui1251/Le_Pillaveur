"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { LocalGamePrelobby, PrelobbyChoice, PrelobbySection } from '@/components/game/LocalGamePrelobby'
import Game, { DifficultyLevel } from './components/game'

const DIFFICULTY_IDS: DifficultyLevel[] = ['easy', 'medium', 'hard']
const DIFFICULTY_ICONS: Record<DifficultyLevel, string> = { easy: '🌱', medium: '🔥', hard: '💀' }

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
          {DIFFICULTY_IDS.map(id => (
            <PrelobbyChoice
              key={id}
              active={difficulty === id}
              onClick={() => setDifficulty(id)}
              icon={DIFFICULTY_ICONS[id]}
              title={t(`page.difficulties.${id}.label`)}
              description={t(`page.difficulties.${id}.range`)}
            />
          ))}
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
