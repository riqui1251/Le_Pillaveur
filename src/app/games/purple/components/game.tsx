/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect } from 'react'
import { Player, getPlayerGameBoost } from '@/lib/players'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import useScreenSize from '@/hooks/useScreenSize'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'

// Types de cartes
type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'V' | 'D' | 'R' | 'A'
type CardSuit = '♠' | '♥' | '♦' | '♣'

// Types de paris
type BetType = 'rouge' | 'double-rouge' | 'noir' | 'double-noir' | 'purple' | 'double-purple'

const cardSuits: CardSuit[] = ['♠', '♥', '♦', '♣']

// Configuration des paris : nb cartes, gorgées si erreur, fonction de vérification
const BET_CONFIG: Record<BetType, { cards: number; gulps: number; label: string }> = {
  'rouge': { cards: 1, gulps: 1, label: 'Rouge' },
  'double-rouge': { cards: 2, gulps: 2, label: 'Double rouge' },
  'noir': { cards: 1, gulps: 1, label: 'Noir' },
  'double-noir': { cards: 2, gulps: 2, label: 'Double noir' },
  'purple': { cards: 2, gulps: 2, label: 'Purple' },
  'double-purple': { cards: 4, gulps: 4, label: 'Double Purple' },
}

// Interface pour une carte
interface PlayingCard {
  value: CardValue
  suit: CardSuit
  color: 'red' | 'black'
}

interface GameProps {
  players: Player[]
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number, totalDrinks?: number, wins?: number }) => void
  gameMode: GameMode
}

const getSpecialEffectClass = (effect: string | null | undefined): string => {
  if (!effect) return '';
  switch (effect) {
    case 'red': return 'special-player-name-red';
    case 'blue': return 'special-player-name-blue';
    case 'rainbow': return 'special-player-name-rainbow';
    case 'gold': return 'special-player-name-gold';
    case 'fire': return 'special-player-name-fire';
    case 'neon': return 'special-player-name-neon';
    default: return '';
  }
}

const isSpecialPlayer = (player: any): boolean => {
  if (!player) return false;
  if (player?.preferences?.specialEffect) return true;
  const name = typeof player === 'string' ? player.toLowerCase() : player?.name?.toLowerCase();
  return name === 'sim' || name === 'riqui';
}

// Vérifier si les cartes tirées correspondent au pari
function checkBetResult(bet: BetType, drawnCards: PlayingCard[]): boolean {
  const colors = drawnCards.map(c => c.color)
  
  switch (bet) {
    case 'rouge':
      return colors.length === 1 && colors[0] === 'red'
    case 'double-rouge':
      return colors.length === 2 && colors.every(c => c === 'red')
    case 'noir':
      return colors.length === 1 && colors[0] === 'black'
    case 'double-noir':
      return colors.length === 2 && colors.every(c => c === 'black')
    case 'purple':
      if (colors.length !== 2) return false
      return (colors[0] === 'red' && colors[1] === 'black') || (colors[0] === 'black' && colors[1] === 'red')
    case 'double-purple':
      if (colors.length !== 4) return false
      const rb = colors[0] === 'red' && colors[1] === 'black' && colors[2] === 'red' && colors[3] === 'black'
      const br = colors[0] === 'black' && colors[1] === 'red' && colors[2] === 'black' && colors[3] === 'red'
      return rb || br
    default:
      return false
  }
}

export default function Game({ players, onGameEnd, updatePlayerStats }: GameProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [deck, setDeck] = useState<PlayingCard[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [drinkCounter, setDrinkCounter] = useState(0) // Compteur accumulé pour le prochain qui perd
  const [gameResults, setGameResults] = useState<Record<string, number>>({})
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [amountToDrink, setAmountToDrink] = useState(0)
  const [drawnCards, setDrawnCards] = useState<PlayingCard[]>([])
  const [lastBet, setLastBet] = useState<BetType | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [isRevealing, setIsRevealing] = useState(false)
  const [canContinue, setCanContinue] = useState(false) // Après un bon pari : continuer ou passer
  const [cardHistory, setCardHistory] = useState<PlayingCard[]>([]) // Dernières cartes sorties
  
  const { isMobile } = useScreenSize()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (isMounted && players.length >= 2) {
      initializeGame()
    }
  }, [isMounted, players.length])

  const createDeck = (): PlayingCard[] => {
    const values: CardValue[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A']
    const deck: PlayingCard[] = []
    for (const suit of cardSuits) {
      for (const value of values) {
        deck.push({
          value,
          suit,
          color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
        })
      }
    }
    return deck
  }

  const shuffleDeck = (deck: PlayingCard[]): PlayingCard[] => {
    const shuffled = [...deck]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const initializeGame = () => {
    if (players.length === 0) return
    const newDeck = shuffleDeck(createDeck())
    setDeck(newDeck)
    setCurrentPlayerIndex(Math.floor(Math.random() * players.length))
    setDrinkCounter(0)
    setGameResults({})
    setShowResultDialog(false)
    setDrawnCards([])
    setLastBet(null)
    setIsCorrect(null)
    setIsRevealing(false)
    setCanContinue(false)
    setCardHistory([])
  }

  const handleBet = (bet: BetType) => {
    if (isRevealing) return
    
    const config = BET_CONFIG[bet]
    let currentDeck = [...deck]
    
    if (currentDeck.length < config.cards) {
      currentDeck = shuffleDeck(createDeck())
    }
    
    const drawn = currentDeck.slice(0, config.cards)
    const currentCounter = drinkCounter
    setDeck(currentDeck.slice(config.cards))
    setDrawnCards(drawn)
    setLastBet(bet)
    setIsRevealing(true)
    
    setTimeout(() => {
      let isBetCorrect = checkBetResult(bet, drawn)
      const currentPlayer = players[currentPlayerIndex]
      const boost = currentPlayer ? getPlayerGameBoost(currentPlayer, 'purple') : 0
      if (!isBetCorrect && boost > 0 && Math.random() * 100 < boost) {
        isBetCorrect = true
      }
      setIsCorrect(isBetCorrect)
      
      // Ajouter les cartes à l'historique (garder les 6 dernières)
      setCardHistory(prev => [...prev, ...drawn].slice(-6))
      
      if (isBetCorrect) {
        setDrinkCounter(prev => prev + config.gulps)
        setCanContinue(true)
      } else {
        const totalToDrink = currentCounter + config.gulps
        setAmountToDrink(totalToDrink)
        setGameResults(prev => ({
          ...prev,
          [currentPlayer.id]: (prev[currentPlayer.id] || 0) + totalToDrink
        }))
        setDrinkCounter(0)
        setShowResultDialog(true)
      }
      
      setIsRevealing(false)
    }, 800)
  }

  const handleContinue = () => {
    setDrawnCards([])
    setLastBet(null)
    setIsCorrect(null)
    setCanContinue(false)
  }

  const handlePass = () => {
    setCurrentPlayerIndex((prev) => (prev + 1) % Math.max(1, players.length))
    setDrawnCards([])
    setLastBet(null)
    setIsCorrect(null)
    setCanContinue(false)
  }

  const closeResultDialog = () => {
    setShowResultDialog(false)
    setCurrentPlayerIndex((prev) => (prev + 1) % Math.max(1, players.length))
    setDrawnCards([])
    setLastBet(null)
  }

  const getCardStyle = (color: string) => ({
    backgroundColor: 'white',
    color: color === 'red' ? '#e53e3e' : '#1a202c',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    border: '2px solid',
    borderColor: color === 'red' ? '#e53e3e' : '#1a202c'
  })

  const restartGame = () => {
    initializeGame()
  }

  const quitGame = () => {
    // Enregistre la session : 1 partie par joueur + gorgées accumulées
    players.forEach(p => {
      updatePlayerStats(p.id, 'purple', {
        gamesPlayed: 1,
        totalDrinks: gameResults[p.id] || 0,
      })
    })
    onGameEnd()
  }

  const currentPlayer = players[currentPlayerIndex]
  const specialEffectClass = currentPlayer ? getSpecialEffectClass(currentPlayer?.preferences?.specialEffect) : ''

  if (!players || players.length < 2) {
    return <div className="p-6 text-center text-red-500">Au moins 2 joueurs requis.</div>
  }

  if (!isMounted) {
    return <div className="p-6 text-center">Chargement du jeu...</div>
  }

  const betButtons: BetType[] = ['rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple']

  return (
    <div className="space-y-6 flex flex-col min-h-[60vh]">
      <Card className="p-6 flex-1">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Purple</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={restartGame} title="Nouvelle partie">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={quitGame}>
              Retour
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-center space-y-6">
          {currentPlayer && (
            <div className="flex items-center space-x-2 mb-4">
              <Avatar className={`h-10 w-10 ${isSpecialPlayer(currentPlayer) ? 'border-2 border-purple-500 shadow-lg shadow-purple-500/50' : ''}`}>
                <AvatarImage src={currentPlayer?.preferences?.avatar} />
                <AvatarFallback className={currentPlayer?.preferences?.color || 'bg-primary'}>
                  {currentPlayer?.preferences?.icon || (currentPlayer?.name ? currentPlayer.name.charAt(0).toUpperCase() : '?')}
                </AvatarFallback>
              </Avatar>
              <PlayerName player={currentPlayer} className={`font-semibold ${specialEffectClass}`} />
            </div>
          )}

          {/* Cartes tirées */}
          {drawnCards.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {drawnCards.map((card, i) => (
                <div
                  key={i}
                  className="w-20 h-28 sm:w-24 sm:h-36 rounded-lg flex flex-col items-center justify-center text-2xl sm:text-3xl font-bold"
                  style={getCardStyle(card.color)}
                >
                  <div>{card.value}</div>
                  <div>{card.suit}</div>
                </div>
              ))}
            </div>
          )}

          {/* Résultat après révélation */}
          {isCorrect === true && canContinue && (
            <div className="text-center space-y-3">
              <p className="text-green-600 font-semibold text-lg">Correct ! +{lastBet ? BET_CONFIG[lastBet].gulps : 0} au compteur</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={handleContinue} className="bg-purple-600 hover:bg-purple-700">
                  Continuer
                </Button>
                <Button onClick={handlePass} variant="outline">
                  Passer au suivant
                </Button>
              </div>
            </div>
          )}

          {/* Boutons de paris - affichés quand pas de résultat en attente ou après avoir choisi continuer */}
          {!canContinue && !showResultDialog && (
            <div className="flex flex-col gap-2 w-full max-w-md">
              <p className="text-center text-sm text-gray-500 mb-2">Choisis ton pari</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {betButtons.map((bet) => (
                  <Button
                    key={bet}
                    onClick={() => handleBet(bet)}
                    disabled={isRevealing || deck.length < BET_CONFIG[bet].cards}
                    variant="outline"
                    className={`h-auto py-3 border-0 text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${
                      bet.includes('rouge') ? 'bg-gradient-to-br from-red-500 to-red-700' :
                      bet.includes('noir') ? 'bg-gradient-to-br from-gray-700 to-gray-900' :
                      'bg-gradient-to-br from-purple-500 to-purple-700'
                    }`}
                  >
                    <span className="text-xs sm:text-sm">{BET_CONFIG[bet].label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {isRevealing && (
            <p className="text-amber-600 animate-pulse">Révélation...</p>
          )}
        </div>
      </Card>

      {/* Compteur de gorgées et historique des cartes */}
      <div className="space-y-2">
        <div className="py-3 px-4 rounded-lg bg-gradient-to-r from-amber-900/50 to-amber-800/30 border border-amber-600/30 text-center flex flex-col sm:flex-row sm:justify-center sm:gap-6 gap-1">
          <span className="font-semibold text-amber-300">Compteur : {drinkCounter} gorgée{drinkCounter !== 1 ? 's' : ''}</span>
          <span className="text-sm text-gray-400">Cartes : {52 - deck.length}/52</span>
        </div>
        {cardHistory.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {cardHistory.map((card, i) => (
              <div
                key={i}
                className="w-10 h-14 sm:w-12 sm:h-16 rounded flex flex-col items-center justify-center text-xs sm:text-sm font-bold shrink-0"
                style={getCardStyle(card.color)}
              >
                <span>{card.value}</span>
                <span>{card.suit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogue mauvaise réponse */}
      <Dialog open={showResultDialog} onOpenChange={(open) => { if (!open) closeResultDialog() }}>
        <DialogContent className={isMobile ? 'w-[95%] max-w-lg p-4' : ''}>
          <DialogHeader>
            <DialogTitle className="text-red-600">Mauvaise combinaison !</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-center text-lg font-semibold">
              {currentPlayer?.name} doit boire {amountToDrink} gorgée{amountToDrink !== 1 ? 's' : ''} !
            </p>
          </div>
          <DialogFooter>
            <Button onClick={closeResultDialog} className={isMobile ? 'w-full' : ''}>
              Compris !
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}