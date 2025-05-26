"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Player } from '@/types/game'

interface GameProps {
  players: Player[]
  onGameEnd: () => void
}

export default function Game({ players, onGameEnd }: GameProps) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [diceValue, setDiceValue] = useState<number | null>(null)
  const [gameOver, setGameOver] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>(
    players.reduce((acc, player) => ({ ...acc, [player.id]: 0 }), {} as Record<string, number>)
  )

  const rollDice = () => {
    const value = Math.floor(Math.random() * 6) + 1
    setDiceValue(value)
    
    const currentPlayerId = players[currentPlayerIndex].id
    const newScores: Record<string, number> = {
      ...scores,
      [currentPlayerId]: scores[currentPlayerId] + value
    }
    setScores(newScores)

    if (newScores[currentPlayerId] >= 50) {
      setGameOver(true)
    } else {
      setCurrentPlayerIndex((currentPlayerIndex + 1) % players.length)
    }
  }

  const resetGame = () => {
    setScores(players.reduce((acc, player) => ({ ...acc, [player.id]: 0 }), {} as Record<string, number>))
    setCurrentPlayerIndex(0)
    setDiceValue(null)
    setGameOver(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {players.map((player, index) => (
          <Card 
            key={player.id} 
            className={index === currentPlayerIndex ? 'border-2 border-blue-500' : ''}
          >
            <CardHeader>
              <CardTitle className="text-lg">{player.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">Score: {scores[player.id]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-center">
        {diceValue && (
          <div className="text-6xl font-bold mb-4">
            🎲 {diceValue}
          </div>
        )}
        
        {!gameOver ? (
          <Button 
            onClick={rollDice}
            className="w-full"
          >
            Lancer le dé
          </Button>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">
              {players[currentPlayerIndex].name} a gagné avec {scores[players[currentPlayerIndex].id]} points!
            </h2>
            <div className="flex gap-2">
              <Button onClick={resetGame} className="flex-1">
                Nouvelle partie
              </Button>
              <Button onClick={onGameEnd} variant="outline" className="flex-1">
                Retour au menu
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 