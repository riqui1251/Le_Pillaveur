"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { User, Home, Settings } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import Game from './components/game'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

export type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

const DIFFICULTY_KEYS: Difficulty[] = ['facile', 'normal', 'difficile', 'extreme']

export default function PenduPage() {
  const t = useTranslations('games.pendu')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('players')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const rules = t.raw('page.rules') as string[]

  const handleGameEnd = () => {
    setGameStarted(false)
    setActiveTab('players')
  }

  const startGame = () => {
    setGameStarted(true)
    setActiveTab('game')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-blue-900 to-indigo-900 text-white">
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              {t('title')}
            </h1>
            <p className="text-purple-200">{t('tagline')}</p>
          </div>
          <Link href="/">
            <Button variant="outline" size="icon" className="border-white/20 text-white hover:bg-white/10">
              <Home className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 bg-white/10">
            <TabsTrigger value="players" className="data-[state=active]:bg-white/20">
              <User className="mr-2 h-4 w-4" />
              {t('page.tabConfig')}
            </TabsTrigger>
            <TabsTrigger value="game" disabled={!gameStarted} className="data-[state=active]:bg-white/20">
              {t('page.tabGame')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-6 mt-6">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <User className="mr-2" />
                {t('page.selectedPlayers')}
              </h3>
              <SelectedPlayersDisplay players={selectedPlayers} />
              {selectedPlayers.length < 2 && (
                <p className="text-amber-300 text-sm mt-2">
                  {t('page.needPlayers')}
                </p>
              )}
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <Settings className="mr-2" />
                {t('page.difficulty')}
              </h3>

              <div className="space-y-4">
                <Select value={difficulty} onValueChange={(value) => setDifficulty(value as Difficulty)}>
                  <SelectTrigger className="w-full bg-white/5 border-white/20 text-white">
                    <SelectValue placeholder={t('page.selectDifficulty')} />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-white/20">
                    {DIFFICULTY_KEYS.map((key) => (
                      <SelectItem key={key} value={key} className="text-white hover:bg-white/10">
                        <div className="flex items-center space-x-2">
                          <span>{t(`page.difficultyEmojis.${key}`)}</span>
                          <span>{t(`difficulty.${key}`)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-2xl">{t(`page.difficultyEmojis.${difficulty}`)}</span>
                    <h4 className="text-lg font-semibold">{t(`difficulty.${difficulty}`)}</h4>
                  </div>
                  <p className="text-purple-200">{t(`page.difficultyDescriptions.${difficulty}`)}</p>
                </div>
              </div>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6">
              <h3 className="text-xl font-semibold mb-4">{t('page.rulesTitle')}</h3>
              <div className="space-y-3 text-purple-200">
                {rules.map((rule, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <span className={`font-bold ${
                      index === 0 ? 'text-yellow-400' :
                      index === 1 ? 'text-yellow-400' :
                      index === 2 ? 'text-blue-400' :
                      index === 3 ? 'text-purple-400' :
                      index === 4 ? 'text-red-400' :
                      'text-green-400'
                    }`}>{index + 1}.</span>
                    <p>{rule}</p>
                  </div>
                ))}
              </div>
            </Card>

            <div className="text-center">
              <Button
                onClick={startGame}
                disabled={selectedPlayers.length < 2}
                size="lg"
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold px-8 py-3 text-lg disabled:opacity-50"
              >
                {t('page.start')}
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
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
