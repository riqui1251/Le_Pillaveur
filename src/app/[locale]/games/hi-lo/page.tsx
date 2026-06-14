"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import Game from './components/game'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

export type GameMode = 'standard' | 'traversee'

export default function HiLoPage() {
  const t = useTranslations('games.hi-lo')
  const tc = useTranslations('common')
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
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">{t('title')}</h1>
        <Link href="/jeux">
          <Button variant="outline" size="icon" aria-label={t('page.backToGames')}>
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <SelectedPlayersDisplay players={selectedPlayers} />

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-2">{t('page.gameMode')}</h3>
        <Select value={gameMode} onValueChange={(value) => setGameMode(value as GameMode)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('page.selectMode')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">{t('page.modes.standard')}</SelectItem>
            <SelectItem value="traversee">{t('page.modes.traversee')}</SelectItem>
          </SelectContent>
        </Select>
        <Button className="mt-4 w-full" disabled={selectedPlayers.length < 2} onClick={() => setGameStarted(true)}>
          {t('page.start')}
        </Button>
      </Card>
    </div>
  )
}
