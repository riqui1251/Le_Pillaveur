"use client"

import { Player } from '@/lib/players'
import { Card } from '@/components/ui/card'

interface SelectedPlayersDisplayProps {
  players: Player[]
  title?: string
  className?: string
}

export function SelectedPlayersDisplay({ 
  players, 
  title = "Joueurs sélectionnés",
  className = ""
}: SelectedPlayersDisplayProps) {
  // Version simplifiée pour debug
  if (!players || !Array.isArray(players)) {
    return (
      <Card className={`p-4 ${className}`}>
        <p>Erreur de chargement des joueurs</p>
      </Card>
    )
  }

  if (players.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <p>Aucun joueur sélectionné</p>
        <p className="text-xs mt-1">Sélectionnez au moins 2 joueurs sur la page Joueurs</p>
      </Card>
    )
  }

  return (
    <Card className={`p-4 ${className}`}>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="space-y-2">
        {players.map((player, index) => {
          if (!player || !player.id || !player.name) {
            return null
          }
          
          return (
            <div key={player.id} className="p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <span className="player-name-default font-medium">{index + 1}. {player.name}</span>
              {player.stats && (
                <span className="text-sm text-gray-600 ml-2">
                  ({player.stats.gamesPlayed || 0} parties)
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
