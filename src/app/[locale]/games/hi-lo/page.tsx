"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { LocalGamePrelobby, PrelobbyChoice, PrelobbySection } from '@/components/game/LocalGamePrelobby'
import { useSoireeRound } from '@/components/soiree/useSoiree'
import { getGameById } from '@/lib/games'
import { HI_LO_SOIREE_MISS_LIMIT } from '@/lib/hi-lo/engine'

export type GameMode = 'standard' | 'traversee'

const GAME_MODES: GameMode[] = ['standard', 'traversee']

export default function HiLoPage() {
  const t = useTranslations('games.hi-lo')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [gameMode, setGameMode] = useState<GameMode>('standard')
  // Mode Soirée : la manche part tout de suite en standard, sans l'avant-partie,
  // et s'arrête quand chacun a loupé deux fois. Quitter la partie ramène
  // l'avant-partie, sans relance d'office.
  const soireeRound = useSoireeRound('hi-lo')
  const [leftGame, setLeftGame] = useState(false)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const soireeStart = soireeRound !== null && !leftGame && selectedPlayers.length >= (getGameById('hi-lo')?.localMinPlayers ?? 2)

  // Le lancement tient ensuite seul : la manche peut se clore avant qu'on quitte la page.
  useEffect(() => {
    if (!soireeStart) return
    setGameMode('standard')
    setGameStarted(true)
  }, [soireeStart])

  if (gameStarted || soireeStart) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={() => {
          setGameStarted(false)
          setLeftGame(true)
        }}
        updatePlayerStats={updatePlayerStats}
        gameMode={gameStarted ? gameMode : 'standard'}
        missLimit={soireeRound ? HI_LO_SOIREE_MISS_LIMIT : null}
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
