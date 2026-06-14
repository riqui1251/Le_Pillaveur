"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePlayers } from '@/hooks/usePlayers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Home } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import Game from './components/game'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

const DIFFICULTY_KEYS: Difficulty[] = ['facile', 'normal', 'difficile', 'extreme']

export default function TrialPoursuitePage() {
  const t = useTranslations('games.trial-poursuite')
  const tc = useTranslations('common')
  const { players, updatePlayerStats } = usePlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('config')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [gameKey, setGameKey] = useState(0)
  const { selectedIds } = useSelectedPlayers()

  const handleReturnToSelection = () => {
    setGameStarted(false)
    setActiveTab('config')
    setGameKey(prev => prev + 1)
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  const handleGameEnd = () => {
    handleReturnToSelection()
  }

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('page.title')}</h1>
        <Link href="/" className="flex items-center gap-2">
          <Home className="w-5 h-5" />
          {tc('back')}
        </Link>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config">{t('page.configTab')}</TabsTrigger>
            <TabsTrigger value="game" disabled={!gameStarted}>{t('page.gameTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-bold mb-4">{t('page.configTitle')}</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('page.difficulty')}
                  </label>
                  <Select value={difficulty} onValueChange={(value: Difficulty) => setDifficulty(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <span>{t(`page.difficulties.${key}.emoji`)}</span>
                            <div>
                              <div className="font-medium">{t(`page.difficulties.${key}.name`)}</div>
                              <div className="text-xs text-gray-500">{t(`page.difficulties.${key}.description`)}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            <div className="text-center">
              <Button 
                onClick={() => {
                  setGameStarted(true)
                  setActiveTab('game')
                }}
                disabled={selectedPlayers.length < 2}
                size="lg"
                className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold px-8 py-3 text-lg disabled:opacity-50"
              >
                {t('page.startRace')}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="game">
            {gameStarted && (
              <Game 
                players={selectedPlayers}
                onGameEnd={handleGameEnd}
                difficulty={difficulty}
                updatePlayerStats={updatePlayerStats}
                key={gameKey}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
