"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Player } from '@/types/game'

interface GameProps {
  players: Player[]
  onGameEnd: () => void
}

interface Bet {
  number: number
  amount: number
}

const BET_AMOUNTS = [1, 5, 10, 20, 50]
const DICE_NUMBERS = [1, 2, 3, 4, 5, 6]

export default function Game({ players, onGameEnd }: GameProps) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [diceValue, setDiceValue] = useState<number | null>(null)
  const [gameOver, setGameOver] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>(
    players.reduce((acc, player) => ({ ...acc, [player.id]: 50 }), {} as Record<string, number>)
  )
  const [bets, setBets] = useState<Record<string, Bet>>({})
  const [currentBet, setCurrentBet] = useState<Bet>({ number: 1, amount: 1 })

  const handleBetChange = (field: keyof Bet, value: number) => {
    setCurrentBet(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const placeBet = () => {
    const currentPlayerId = players[currentPlayerIndex].id
    const currentScore = scores[currentPlayerId]

    if (currentBet.amount > currentScore) {
      alert("Vous n'avez pas assez de points pour cette mise !")
      return
    }

    setBets(prev => ({
      ...prev,
      [currentPlayerId]: currentBet
    }))

    // Mettre à jour le score après la mise
    setScores(prev => ({
      ...prev,
      [currentPlayerId]: prev[currentPlayerId] - currentBet.amount
    }))

    // Passer au joueur suivant
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
    setCurrentPlayerIndex(nextPlayerIndex)
  }

  const allPlayersHaveBet = players.every(player => bets[player.id])

  const rollDice = () => {
    setIsRolling(true)
    setDiceValue(null)

    // Animation de 2 secondes
    setTimeout(() => {
      const value = Math.floor(Math.random() * 6) + 1
      setDiceValue(value)
      setIsRolling(false)

      // Distribuer les gains
      const newScores = { ...scores }
      Object.entries(bets).forEach(([playerId, bet]) => {
        if (bet.number === value) {
          newScores[playerId] += bet.amount * 2
        }
      })

      setScores(newScores)
      setBets({})

      // Vérifier si un joueur a gagné
      const winner = Object.entries(newScores).find(([, score]) => score >= 100)
      if (winner) {
        setGameOver(true)
      }
    }, 2000)
  }

  const resetGame = () => {
    setScores(players.reduce((acc, player) => ({ ...acc, [player.id]: 50 }), {} as Record<string, number>))
    setCurrentPlayerIndex(0)
    setDiceValue(null)
    setGameOver(false)
    setBets({})
    setCurrentBet({ number: 1, amount: 1 })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
              {bets[player.id] && (
                <p className="text-sm text-gray-500">
                  Mise: {bets[player.id].amount} sur {bets[player.id].number}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!gameOver && (
        <Card className="p-4">
          <div className="space-y-4">
            {!allPlayersHaveBet ? (
              <>
                <h3 className="text-xl font-semibold">
                  Tour de {players[currentPlayerIndex].name}
                </h3>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Choisissez un nombre</label>
                  <div className="grid grid-cols-6 gap-2">
                    {DICE_NUMBERS.map((number) => (
                      <Button
                        key={number}
                        variant={currentBet.number === number ? "default" : "outline"}
                        onClick={() => handleBetChange('number', number)}
                        className="w-full"
                      >
                        {number}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium">Choisissez votre mise</label>
                  <div className="grid grid-cols-5 gap-2">
                    {BET_AMOUNTS.map((amount) => (
                      <Button
                        key={amount}
                        variant={currentBet.amount === amount ? "default" : "outline"}
                        onClick={() => handleBetChange('amount', amount)}
                        className="w-full"
                        disabled={amount > scores[players[currentPlayerIndex].id]}
                      >
                        {amount}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button onClick={placeBet} className="w-full">
                  Placer la mise
                </Button>
              </>
            ) : (
              <div className="text-center space-y-4">
                <h3 className="text-xl font-semibold">
                  Tous les joueurs ont misé !
                </h3>
                <Button 
                  onClick={rollDice} 
                  className="w-full"
                  disabled={isRolling}
                >
                  {isRolling ? "Lancement en cours..." : "Lancer le dé"}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="text-center">
        {(diceValue || isRolling) && (
          <div className={`text-6xl font-bold mb-4 ${isRolling ? 'animate-bounce animate-spin' : ''}`}>
            🎲 {isRolling ? '?' : diceValue}
          </div>
        )}
        
        {gameOver && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">
              {players.find(p => scores[p.id] >= 100)?.name} a gagné avec {Math.max(...Object.values(scores))} points!
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