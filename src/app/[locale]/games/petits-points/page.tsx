"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { User, Shield, Lock, AlertCircle, Home } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Link } from '@/i18n/navigation'
import Game from './components/game'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

const DIFFICULTY_KEYS: Difficulty[] = ['facile', 'normal', 'difficile', 'extreme']

export default function PetitsPointsPage() {
  const t = useTranslations('games.petits-points')
  const [gameStarted, setGameStarted] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [activeTab, setActiveTab] = useState('players')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const rules = t.raw('page.rules') as string[]

  const handleGameEnd = () => {
    setGameStarted(false)
    setActiveTab('players')
  }

  return (
    <div className="container mx-auto p-4">
      {gameStarted ? (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={handleGameEnd}
            className="flex items-center gap-2 mb-4"
          >
            <Home className="h-4 w-4" />
            {t('page.back')}
          </Button>
          <Game
            players={selectedPlayers}
            onGameEnd={handleGameEnd}
            difficulty={difficulty}
            updatePlayerStats={updatePlayerStats}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">🎯 {t('title')}</h1>
            <p className="text-muted-foreground text-center mb-6">
              {t('tagline')}
            </p>

            <Link href="/" className="mx-auto mb-4">
              <Button variant="outline" className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                {t('page.backHome')}
              </Button>
            </Link>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 md:grid-cols-3 mb-4">
              <TabsTrigger value="players" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="hidden md:inline">{t('page.tabs.players')}</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden md:inline">{t('page.tabs.settings')}</span>
              </TabsTrigger>
              <TabsTrigger value="account" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                <span className="hidden md:inline">{t('page.tabs.account')}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="players" className="w-full">
              <div className="card p-4 mb-4">
                <SelectedPlayersDisplay players={selectedPlayers} />
                <Button className="mt-4 w-full" disabled={selectedPlayers.length < 2} onClick={() => setGameStarted(true)}>
                  {t('page.start')}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-4">{t('page.difficulty')}</h2>
                <div className="mb-4">
                  <Select
                    value={difficulty}
                    onValueChange={(value) => setDifficulty(value as Difficulty)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('page.selectDifficulty')} />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`page.difficulties.${key}.label`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2"><strong>{t('page.difficultyDescriptionsTitle')}</strong></p>
                  <ul className="list-disc list-inside space-y-1">
                    {DIFFICULTY_KEYS.map((key) => (
                      <li key={key}>
                        <strong>{t(`page.difficulties.${key}.name`)}:</strong>{' '}
                        {t(`page.difficulties.${key}.description`)}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-4">{t('page.rulesTitle')}</h2>
                <div className="text-sm text-muted-foreground space-y-2">
                  {rules.map((rule, index) => (
                    <p key={index}>{index + 1}. {rule}</p>
                  ))}
                  <p className="font-semibold mt-2">{t('page.rulesNote')}</p>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="account" className="space-y-4">
              <Card className="p-4">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold mb-4">{t('page.accountTitle')}</h2>
                  <div className="flex items-center space-x-4">
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                    <p className="text-sm text-muted-foreground">{t('page.accountReserved')}</p>
                  </div>

                  <div className="mt-4">
                    <Input
                      type="password"
                      placeholder={t('page.passwordPlaceholder')}
                      className="mb-2"
                    />
                    <Button variant="default" className="w-full">
                      {t('page.accountAccess')}
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
