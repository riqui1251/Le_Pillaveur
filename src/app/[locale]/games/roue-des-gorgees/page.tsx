"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Home, User } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import Game from './components/game'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

type RiskLevel = 'faible' | 'moyen' | 'eleve'

/** Ordre d'affichage du sélecteur ; les libellés vivent sous games.roue-des-gorgees.settings.risks. */
const RISK_LEVELS: RiskLevel[] = ['faible', 'moyen', 'eleve']
const MIN_SEGMENTS = 15
const MAX_SEGMENTS = 36

export default function RoueDesGorgeesPage() {
  const t = useTranslations('games.roue-des-gorgees')
  const tPlayers = useTranslations('players')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const [gameStarted, setGameStarted] = useState(false)
  const [activeTab, setActiveTab] = useState<'players'|'game'>('players')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('moyen')
  const [segmentCount, setSegmentCount] = useState<number>(16)

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const handleGameEnd = () => {
    setGameStarted(false)
    setActiveTab('players')
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <Link href="/">
          <Button variant="outline" size="icon">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(v as 'players'|'game')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="players">
            <User className="mr-2 h-4 w-4" />
            {t('settings.tab')}
          </TabsTrigger>
          <TabsTrigger value="game" disabled={!gameStarted}>{t('settings.gameTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="space-y-4">
          <Card className="p-4">
            <SelectedPlayersDisplay players={selectedPlayers} />
          </Card>

          <Card className="p-4">
            <h2 className="text-xl font-semibold mb-4">{t('settings.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm text-slate-300">{t('settings.riskLabel')}</div>
                <Select value={riskLevel} onValueChange={(v)=>setRiskLevel(v as RiskLevel)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('settings.riskPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>{t(`settings.risks.${level}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>{t('settings.segments')}</span>
                  <span className="text-slate-200 font-medium">{segmentCount}</span>
                </div>
                <Slider value={[segmentCount]} onValueChange={(v)=>setSegmentCount(Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, v[0])))} min={MIN_SEGMENTS} max={MAX_SEGMENTS} step={1} />
                <div className="text-xs text-slate-400">{t('settings.segmentsMin', { min: MIN_SEGMENTS })}</div>
              </div>
            </div>
            <Button className="mt-4 w-full" disabled={selectedPlayers.length < 2} onClick={()=>{setGameStarted(true); setActiveTab('game')}}>
              {tPlayers('startGame')}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="game">
          {gameStarted && (
            <Game
              players={selectedPlayers}
              onGameEnd={handleGameEnd}
              updatePlayerStats={updatePlayerStats}
              riskLevel={riskLevel}
              segmentCount={segmentCount}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}


