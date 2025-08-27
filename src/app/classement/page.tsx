"use client"

import { useState } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Trophy, Star } from 'lucide-react'
import { Player } from '@/lib/players'
import useScreenSize from '@/hooks/useScreenSize'
import { GAMES } from '@/lib/games'
import { getMetricsForGame } from '@/lib/gameMetrics'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Style CSS pour les effets spéciaux des noms
const specialPlayerNameStyle = `
  @keyframes gradientFlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  .special-player-name-red {
    background: linear-gradient(90deg, #ff0000, #ff6b6b, #ff0000);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
  }
  
  .special-player-name-blue {
    background: linear-gradient(90deg, #0066ff, #00ccff, #0066ff);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
  }
  
  .special-player-name-rainbow {
    background: linear-gradient(90deg, #ff0000, #ffa500, #ffff00, #00ff00, #0000ff, #4b0082, #ee82ee, #ff0000);
    background-size: 400% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 6s linear infinite;
    font-weight: bold;
  }
  
  .special-player-name-gold {
    background: linear-gradient(90deg, #ffd700, #ffcc00, #ffdb58, #ffd700);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
  }
  
  .special-player-name-fire {
    background: linear-gradient(90deg, #ff4500, #ff8c00, #ff4500);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 2s linear infinite;
    font-weight: bold;
  }
  
  .special-player-name-neon {
    background: linear-gradient(90deg, #00ff00, #66ff66, #00ff00);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
  }
  
  .special-player-name {
    background: linear-gradient(90deg, #ff0000, #ff6b6b, #ff0000);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
  }
`

const gamesList = GAMES.map(g => ({ id: g.id, name: g.title, icon: g.emoji }))

export default function ClassementPage() {
  const { players, topPlayers, mostActivePlayers } = usePlayers()
  const [activeTab, setActiveTab] = useState('global')
  const [selectedGame, setSelectedGame] = useState('')
  const [selectedMetricByGame, setSelectedMetricByGame] = useState<Record<string, string>>({})
  const { isMobile } = useScreenSize()

  // Couleur avatar
  const getColorFromClass = (colorClass: string): string => {
    if (!colorClass) return '#9ca3af'
    if (colorClass.startsWith('bg-')) {
      const parts = colorClass.replace('bg-', '').split('-')
      const base = parts[0]
      const map: Record<string, string> = {
        red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', 
        purple: '#a855f7', pink: '#ec4899', indigo: '#6366f1', orange: '#f97316', 
        teal: '#14b8a6', cyan: '#06b6d4', rose: '#f43f5e', emerald: '#10b981'
      }
      return map[base] || '#9ca3af'
    }
    return colorClass
  }

  // Effet spécial noms
  const getSpecialEffectClass = (player: Player): string => {
    if (!player?.preferences?.specialEffect) return ''
    return `special-player-name-${player.preferences.specialEffect}`
  }

  // Stats globales
  const totalPlayers = players.length
  const totalGamesPlayedAll = players.reduce((sum, p) => sum + (p.stats.gamesPlayed || 0), 0)

  // Composant pour afficher une ligne de joueur
  const PlayerRow = ({ player, index, metric }: { player: Player; index: number; metric?: string }) => (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-6 text-center text-sm font-semibold text-stone-500">
          {index + 1}
        </div>
        <Avatar className="h-8 w-8" style={{ backgroundColor: getColorFromClass(player.preferences.color) }}>
          {player.preferences.avatar ? (
            <AvatarImage src={player.preferences.avatar} alt={player.name} />
          ) : (
            <AvatarFallback className="text-white text-sm font-medium">
              {player.preferences.icon || player.name[0].toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className={getSpecialEffectClass(player) || 'font-medium text-stone-700'}>
          {player.name}
        </div>
      </div>
      <div className="text-sm text-stone-600 font-medium">
        {metric || `${player.stats.wins || 0} victoires`}
      </div>
    </div>
  )

  return (
    <div className="container mx-auto p-4 max-w-4xl">

      
      {/* En-tête simplifié */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Classement</h1>
        <p className="text-gray-600">
          {totalPlayers} joueurs • {totalGamesPlayedAll} parties • {gamesList.length} jeux
        </p>
      </div>

      {/* Sélecteur de vue */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => setActiveTab('global')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'global' 
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' 
              : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <Trophy className="h-4 w-4" />
          Global
        </button>
        
        <Select value={selectedGame} onValueChange={(value) => {
          setSelectedGame(value)
          setActiveTab('game')
        }}>
          <SelectTrigger className={`w-[200px] ${
            activeTab === 'game' && selectedGame 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
              : 'bg-stone-50 border-stone-200 text-stone-600'
          }`}>
            <SelectValue placeholder="Choisir un jeu" />
          </SelectTrigger>
          <SelectContent>
            {gamesList.map((game, gameIndex) => (
              <SelectItem key={`game-select-${game.id}-${gameIndex}`} value={game.id}>
                {game.icon} {game.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Vue Global */}
      {activeTab === 'global' && (
        <div className="space-y-6">
          <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {/* Top 10 Victoires */}
            <Card className="border border-stone-200 shadow-sm bg-stone-50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-stone-700">
                  <Trophy className="h-5 w-5 text-amber-600" />
                  Top 10 Victoires
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topPlayers.slice(0, 10).map((player, index) => (
                  <PlayerRow 
                    key={`global-victories-${player.id}-${index}`}
                    player={player} 
                    index={index} 
                    metric={`${player.stats.wins || 0} victoires`}
                  />
                ))}
                {topPlayers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Aucune donnée
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 Parties */}
            <Card className="border border-stone-200 shadow-sm bg-stone-50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-stone-700">
                  <Star className="h-5 w-5 text-indigo-600" />
                  Top 10 Parties
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {mostActivePlayers.slice(0, 10).map((player, index) => (
                  <PlayerRow 
                    key={`global-games-${player.id}-${index}`}
                    player={player} 
                    index={index} 
                    metric={`${player.stats.gamesPlayed || 0} parties`}
                  />
                ))}
                {mostActivePlayers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Aucune donnée
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Vue par jeu */}
      {activeTab === 'game' && selectedGame && (
        <div className="space-y-6">
          {(() => {
            const game = gamesList.find(g => g.id === selectedGame)
            if (!game) return null
            
            return (
              <Card className="border border-stone-200 shadow-sm bg-stone-50">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg text-stone-700">
                      <span>{game.icon}</span>
                      {game.name}
                    </CardTitle>
                    <Select
                      value={selectedMetricByGame[game.id] || getMetricsForGame(game.id)[0]?.id || ''}
                      onValueChange={(val) => setSelectedMetricByGame(prev => ({ ...prev, [game.id]: val }))}
                    >
                      <SelectTrigger className="w-[200px] bg-stone-50 border-stone-200 text-stone-600">
                        <SelectValue placeholder="Métrique" />
                      </SelectTrigger>
                      <SelectContent>
                        {getMetricsForGame(game.id).map((m, mIndex) => (
                          <SelectItem key={`metric-${game.id}-${m.id}-${mIndex}`} value={m.id}>
                            {m.icon ?? '📈'} {m.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(() => {
                    const metrics = getMetricsForGame(game.id)
                    const currentMetric = metrics.find(m => m.id === (selectedMetricByGame[game.id] || metrics[0]?.id))
                    
                    if (!currentMetric) {
                      return <div className="text-center py-8 text-gray-500">Aucune métrique disponible</div>
                    }

                    const sorted = [...players]
                      .filter(p => (currentMetric.getValue(p) ?? 0) > 0)
                      .sort((a, b) => currentMetric.getValue(b) - currentMetric.getValue(a))
                      .slice(0, 10)

                    if (sorted.length === 0) {
                      return <div className="text-center py-8 text-gray-500">Aucune donnée</div>
                    }

                    return sorted.map((player, index) => (
                      <PlayerRow 
                        key={`game-${game.id}-metric-${currentMetric.id || 'default'}-player-${player.id}-idx-${index}`}
                        player={player} 
                        index={index} 
                        metric={currentMetric.format ? currentMetric.format(currentMetric.getValue(player)) : String(currentMetric.getValue(player))}
                      />
                    ))
                  })()}
                </CardContent>
              </Card>
            )
          })()}
        </div>
      )}
    </div>
  )
}