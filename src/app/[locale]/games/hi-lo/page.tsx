"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { LocalGamePrelobby, PrelobbyChoice, PrelobbySection } from '@/components/game/LocalGamePrelobby'

export type GameMode = 'standard' | 'traversee'

const GAME_MODES: GameMode[] = ['standard', 'traversee']

export default function HiLoPage() {
  const t = useTranslations('games.hi-lo')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [gameMode, setGameMode] = useState<GameMode>('standard')

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  if (gameStarted) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
        gameMode={gameMode}
      />
    )
  }

  return (
    <LocalGamePrelobby gameId="hi-lo" players={selectedPlayers} onStart={() => setGameStarted(true)}>
      <PrelobbySection label={t('page.gameMode')}>
        <div className="grid grid-cols-2 gap-2">
          {GAME_MODES.map(value => (
            <PrelobbyChoice
              key={value}
              active={gameMode === value}
              onClick={() => setGameMode(value)}
              title={t(`page.modes.${value}`)}
            />
          ))}
        </div>
      </PrelobbySection>
    </LocalGamePrelobby>
  )
}
