/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowUp, ArrowDown, RotateCcw, Trophy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { motion } from 'framer-motion'
import useScreenSize from '@/hooks/useScreenSize'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'
import type { HiLoSyncedState } from '@/lib/online-game-state'
import type { OnlineGameSync } from '@/lib/online-sync-types'
import { useSyncedOnlineGame } from '@/hooks/useSyncedOnlineGame'

// Types de cartes
type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'V' | 'D' | 'R' | 'A'
type CardSuit = '♠' | '♥' | '♦' | '♣'

// Valeurs des cartes pour la comparaison
const cardValues: Record<CardValue, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'V': 11, 'D': 12, 'R': 13, 'A': 14
}

// Couleurs des cartes
const cardSuits: CardSuit[] = ['♠', '♥', '♦', '♣']

// Easter eggs - Messages spéciaux pour certains joueurs
const simCompliments = [
  'Le tout puissant',
  'Le magnifique',
  'Le grand sage',
  'Le maître',
  'Sa majesté',
  'Le créateur',
  'L\'invincible',
  'Le légendaire',
  'Le suprême',
  'L\'incontestable'
]

const debMessages = [
  'Boit des vrais gorgées',
  'Des gorgées pas des centilitres',
  'Pas que 2 cl !',
  'Boit vraiment cette fois',
  'Pas de triche',
  'Arrête de faire semblant',
  'On t\'a vu tricher',
  'Bois pour de vrai',
  'Pas d\'eau cette fois'
]

// Interface pour une carte
interface PlayingCard {
  value: CardValue
  suit: CardSuit
  color: string // 'red' ou 'black'
}

// Propriétés du composant Game
interface GameProps {
  players: Player[]
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number, totalDrinks?: number, wins?: number }) => void
  gameMode: GameMode
  onlineSync?: OnlineGameSync<HiLoSyncedState>
}

// Fonction pour obtenir la classe CSS de l'effet spécial du joueur
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

// Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l'effet spécial activé)
const isSpecialPlayer = (player: any): boolean => {
  if (!player) return false;
  
  // Si le joueur a explicitement activé l'effet spécial dans ses préférences
  if (player?.preferences?.specialEffect) {
    return true;
  }
  
  // Sinon, vérifier si c'est un des noms spéciaux par défaut
  const name = typeof player === 'string' 
    ? player.toLowerCase() 
    : player?.name?.toLowerCase();
  return name === 'sim' || name === 'riqui';
}

export default function Game({ players, onGameEnd, updatePlayerStats, gameMode, onlineSync }: GameProps) {
  // État pour vérifier si le composant est monté (côté client)
  const [isMounted, setIsMounted] = useState(false);
  
  // État du jeu
  const [deck, setDeck] = useState<PlayingCard[]>([])
  const [currentCard, setCurrentCard] = useState<PlayingCard | null>(null)
  const [nextCard, setNextCard] = useState<PlayingCard | null>(null)
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [drinkCounter, setDrinkCounter] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [lastGuess, setLastGuess] = useState<'higher' | 'lower' | 'equal' | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [gameResults, setGameResults] = useState<Record<string, number>>({})
  const [showGameOver, setShowGameOver] = useState(false)
  const [showIncorrectDialog, setShowIncorrectDialog] = useState(false)
  const [isFlipping, setIsFlipping] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  // État pour suivre si on a une égalité non devinée
  const [isUnguessedEqual, setIsUnguessedEqual] = useState(false)
  // Indices pour les messages aléatoires (pour éviter les problèmes d'hydratation)
  const [complimentIndex, setComplimentIndex] = useState(0)
  const [debMessageIndex, setDebMessageIndex] = useState(0)
  // État pour suivre les cartes identiques
  const [sameCardCount, setSameCardCount] = useState<Record<string, number>>({})
  
  // États spécifiques au mode Traversée
  const [activePlayers, setActivePlayers] = useState<Player[]>([])
  const [correctGuessesInRow, setCorrectGuessesInRow] = useState(0)
  const [targetGuesses, setTargetGuesses] = useState(5) // Par défaut pour 2 joueurs
  
  const { isMobile } = useScreenSize();

  const stateRef = useRef({
    deck, currentCard, nextCard, currentPlayerIndex, drinkCounter, gameOver,
    showResult, lastGuess, isCorrect, gameResults, showGameOver, showIncorrectDialog,
    isFlipping, isProcessing, isUnguessedEqual, activePlayers, correctGuessesInRow,
    targetGuesses, sameCardCount,
  })

  useEffect(() => {
    stateRef.current = {
      deck, currentCard, nextCard, currentPlayerIndex, drinkCounter, gameOver,
      showResult, lastGuess, isCorrect, gameResults, showGameOver, showIncorrectDialog,
      isFlipping, isProcessing, isUnguessedEqual, activePlayers, correctGuessesInRow,
      targetGuesses, sameCardCount,
    }
  }, [
    deck, currentCard, nextCard, currentPlayerIndex, drinkCounter, gameOver,
    showResult, lastGuess, isCorrect, gameResults, showGameOver, showIncorrectDialog,
    isFlipping, isProcessing, isUnguessedEqual, activePlayers, correctGuessesInRow,
    targetGuesses, sameCardCount,
  ])

  const applyFromServer = useCallback((s: HiLoSyncedState) => {
    setDeck(s.deck as PlayingCard[])
    setCurrentCard(s.currentCard as PlayingCard | null)
    setNextCard(s.nextCard as PlayingCard | null)
    setCurrentPlayerIndex(s.currentPlayer)
    setDrinkCounter(s.drinkCounter)
    setGameOver(s.gameOver)
    setShowResult(s.showResult)
    setLastGuess(s.lastGuess)
    setIsCorrect(s.isCorrect)
    setGameResults(s.gameResults)
    setShowGameOver(s.showGameOver)
    setShowIncorrectDialog(s.showIncorrectDialog)
    setIsFlipping(s.isFlipping)
    setIsProcessing(s.isProcessing)
    setIsUnguessedEqual(s.isUnguessedEqual)
    setActivePlayers(players.filter(p => s.activePlayerIds.includes(p.id)))
    setCorrectGuessesInRow(s.correctGuessesInRow)
    setTargetGuesses(s.targetGuesses)
  }, [players])

  const buildSyncedState = useCallback((extra?: Partial<HiLoSyncedState>): HiLoSyncedState | null => {
    if (!onlineSync) return null
    const cur = stateRef.current
    const mode = onlineSync.remoteState?.gameMode ?? gameMode
    return {
      version: onlineSync.stateVersion + 1,
      memberUserIds: onlineSync.memberUserIds,
      gameStarted: true,
      currentPlayer: extra?.currentPlayer ?? cur.currentPlayerIndex,
      gameMode: mode,
      deck: (extra?.deck ?? cur.deck) as HiLoSyncedState['deck'],
      currentCard: (extra?.currentCard !== undefined ? extra.currentCard : cur.currentCard) as HiLoSyncedState['currentCard'],
      nextCard: (extra?.nextCard !== undefined ? extra.nextCard : cur.nextCard) as HiLoSyncedState['nextCard'],
      drinkCounter: extra?.drinkCounter ?? cur.drinkCounter,
      gameOver: extra?.gameOver ?? cur.gameOver,
      showResult: extra?.showResult ?? cur.showResult,
      lastGuess: extra?.lastGuess !== undefined ? extra.lastGuess : cur.lastGuess,
      isCorrect: extra?.isCorrect !== undefined ? extra.isCorrect : cur.isCorrect,
      gameResults: extra?.gameResults ?? cur.gameResults,
      showGameOver: extra?.showGameOver ?? cur.showGameOver,
      showIncorrectDialog: extra?.showIncorrectDialog ?? cur.showIncorrectDialog,
      isFlipping: extra?.isFlipping ?? cur.isFlipping,
      isProcessing: extra?.isProcessing ?? cur.isProcessing,
      isUnguessedEqual: extra?.isUnguessedEqual ?? cur.isUnguessedEqual,
      activePlayerIds: extra?.activePlayerIds ?? cur.activePlayers.map(p => p.id),
      correctGuessesInRow: extra?.correctGuessesInRow ?? cur.correctGuessesInRow,
      targetGuesses: extra?.targetGuesses ?? cur.targetGuesses,
      rematchVotes: onlineSync.remoteState?.rematchVotes ?? [],
    }
  }, [onlineSync, gameMode])

  const { isOnline, isMyTurn, pushState } = useSyncedOnlineGame({
    onlineSync,
    applyRemoteState: applyFromServer,
    buildState: buildSyncedState,
    isBlockingRemote: () =>
      (stateRef.current.isFlipping || stateRef.current.isProcessing) && Boolean(onlineSync?.canInteract),
  })

  const effectiveGameMode = isOnline && onlineSync?.remoteState?.gameMode
    ? onlineSync.remoteState.gameMode
    : gameMode

  // Vérifier si le composant est monté (côté client)
  useEffect(() => {
    setIsMounted(true);
    
    // Initialiser les indices aléatoires une seule fois après le montage
    setComplimentIndex(Math.floor(Math.random() * simCompliments.length));
    setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
  }, []);

  // Initialisation du jeu (local uniquement)
  useEffect(() => {
    if (isMounted && !isOnline) {
      initializeGame();
    }
  }, [isMounted, isOnline]);

  // Effet pour passer automatiquement au tour suivant après un délai en cas de bonne réponse
  useEffect(() => {
    if (!isMounted) return;
    if (isOnline && !isMyTurn) return;

    if (showResult && isCorrect && !isProcessing) {
      setIsProcessing(true)
      const timer = setTimeout(() => {
        nextTurn()
        setIsProcessing(false)
      }, 1500) // Délai de 1.5 secondes
      
      return () => clearTimeout(timer)
    }
  }, [showResult, isCorrect, isMounted, isProcessing, isOnline, isMyTurn]);

  // Initialiser le jeu
  const initializeGame = () => {
    const newDeck = createDeck()
    const shuffledDeck = shuffleDeck(newDeck)
    setDeck(shuffledDeck)
    
    // Tirer la première carte
    const firstCard = shuffledDeck[0]
    const remainingDeck = shuffledDeck.slice(1)
    
    setCurrentCard(firstCard)
    setDeck(remainingDeck)
    setNextCard(null)
    
    // Sélection aléatoire du premier joueur en mode standard
    if (effectiveGameMode === 'standard') {
      const randomPlayerIndex = Math.floor(Math.random() * players.length);
      setCurrentPlayerIndex(randomPlayerIndex);
    } else {
      // En mode traversée, on commence toujours par le premier joueur
      setCurrentPlayerIndex(0);
    }
    
    setDrinkCounter(1)
    setGameOver(false)
    setShowResult(false)
    setLastGuess(null)
    setIsCorrect(null)
    setGameResults({})
    setShowIncorrectDialog(false)
    setIsFlipping(false)
    setIsProcessing(false)
    
    // Initialisation pour le mode Traversée
    if (effectiveGameMode === 'traversee') {
      // Calcul de l'objectif basé sur le nombre de joueurs
      // 5 pour 2 joueurs, +2 par joueur supplémentaire
      const target = 5 + (Math.max(0, players.length - 2) * 2)
      setTargetGuesses(target)
      setCorrectGuessesInRow(0)
      setActivePlayers([...players]) // Copie du tableau des joueurs
    }
    
    // Générer de nouveaux indices aléatoires pour les messages
    if (isMounted) {
      setComplimentIndex(Math.floor(Math.random() * simCompliments.length));
      setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
    }
  }

  // Créer un jeu de cartes complet
  const createDeck = (): PlayingCard[] => {
    const values: CardValue[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A']
    const deck: PlayingCard[] = []

    // Ajouter les cartes standard
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

  // Mélanger le jeu de cartes
  const shuffleDeck = (deck: PlayingCard[]): PlayingCard[] => {
    const shuffled = [...deck]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Régénérer le deck si nécessaire
  const regenerateDeckIfNeeded = (): PlayingCard[] => {
    if (deck.length < 2) {
      const newDeck = createDeck();
      return shuffleDeck(newDeck);
    }
    return deck;
  }

  // Gérer la prédiction du joueur
  const handleGuess = (guess: 'higher' | 'lower' | 'equal') => {
    if (!currentCard || gameOver || isFlipping || isProcessing) return
    if (isOnline && !isMyTurn) return

    const cur = stateRef.current
    let currentDeck = cur.deck.length < 2 ? shuffleDeck(createDeck()) : [...cur.deck]
    const nextCardFromDeck = currentDeck[0]
    const remainingDeck = currentDeck.slice(1)

    setNextCard(nextCardFromDeck)
    setDeck(remainingDeck)
    setLastGuess(guess)
    setIsFlipping(true)

    if (isOnline) {
      void pushState({
        isFlipping: true,
        lastGuess: guess,
        nextCard: nextCardFromDeck as HiLoSyncedState['nextCard'],
        deck: remainingDeck as HiLoSyncedState['deck'],
      })
    }

    const currentValue = cardValues[currentCard.value]
    const nextValue = cardValues[nextCardFromDeck.value]

    let correct = false
    if (guess === 'higher' && nextValue > currentValue) correct = true
    else if (guess === 'lower' && nextValue < currentValue) correct = true
    else if (guess === 'equal' && nextValue === currentValue) correct = true

    const unguessedEqual = nextValue === currentValue && guess !== 'equal'

    setTimeout(() => {
      const mode = effectiveGameMode
      const playerIdx = cur.currentPlayerIndex
      const counter = cur.drinkCounter
      const traverseePlayers = [...cur.activePlayers]
      const guessesInRow = cur.correctGuessesInRow
      const target = cur.targetGuesses
      let newResults = { ...cur.gameResults }
      let newCounter = counter
      let newGuessesInRow = guessesInRow
      let newActivePlayers = traverseePlayers
      let newActiveIds = traverseePlayers.map(p => p.id)
      let ended = false

      if (!isOnline) {
        const cardKey = `${nextCardFromDeck.value}-${nextCardFromDeck.suit}`
        const updatedSameCardCount = { ...cur.sameCardCount }
        updatedSameCardCount[cardKey] = (updatedSameCardCount[cardKey] || 0) + 1
        setSameCardCount(updatedSameCardCount)

        if (updatedSameCardCount[cardKey] > 4) {
          const currentPlayer = mode === 'traversee' ? traverseePlayers[playerIdx] : players[playerIdx]
          if (currentPlayer) {
            newResults = {
              ...newResults,
              [currentPlayer.id]: (newResults[currentPlayer.id] || 0) + counter,
            }
            setGameResults(newResults)
          }
          setIsCorrect(correct)
          setShowResult(true)
          setIsFlipping(false)
          endGame(true)
          setShowIncorrectDialog(true)
          return
        }
      }

      setIsUnguessedEqual(unguessedEqual)
      setIsCorrect(correct)
      setShowResult(true)
      setIsFlipping(false)

      if (mode === 'standard') {
        if (correct) {
          newCounter = guess === 'equal' ? counter + 3 : counter + 1
          setDrinkCounter(newCounter)
        } else {
          const currentPlayer = players[playerIdx]
          newResults = {
            ...newResults,
            [currentPlayer.id]: (newResults[currentPlayer.id] || 0) + counter,
          }
          setGameResults(newResults)
          setShowIncorrectDialog(true)
        }
      } else if (mode === 'traversee') {
        if (correct) {
          newGuessesInRow = guessesInRow + 1
          newCounter = guess === 'equal' ? counter + 3 : counter + 1
          setCorrectGuessesInRow(newGuessesInRow)
          setDrinkCounter(newCounter)

          if (guess === 'equal') {
            newActivePlayers = traverseePlayers.filter((_, index) => index !== playerIdx)
            newActiveIds = newActivePlayers.map(p => p.id)
            setActivePlayers(newActivePlayers)
            if (newActivePlayers.length === 0) ended = true
          }
          if (newGuessesInRow >= target) ended = true
        } else if (unguessedEqual) {
          traverseePlayers.forEach(player => {
            newResults = {
              ...newResults,
              [player.id]: (newResults[player.id] || 0) + 1,
            }
          })
          setGameResults(newResults)
          setShowIncorrectDialog(true)
        } else {
          traverseePlayers.forEach(player => {
            newResults = {
              ...newResults,
              [player.id]: (newResults[player.id] || 0) + counter,
            }
          })
          setGameResults(newResults)
          newGuessesInRow = 0
          setCorrectGuessesInRow(0)
          setShowIncorrectDialog(true)
        }
      }

      if (isOnline) {
        void pushState({
          deck: remainingDeck as HiLoSyncedState['deck'],
          nextCard: nextCardFromDeck as HiLoSyncedState['nextCard'],
          lastGuess: guess,
          isCorrect: correct,
          isFlipping: false,
          showResult: true,
          isUnguessedEqual: unguessedEqual,
          drinkCounter: newCounter,
          gameResults: newResults,
          showIncorrectDialog: !correct,
          correctGuessesInRow: newGuessesInRow,
          activePlayerIds: newActiveIds,
        })
      }

      if (ended) endGame()
    }, 600)
  }

  // Fermer la fenêtre de mauvais choix
  const closeIncorrectDialog = () => {
    if (isOnline && !isMyTurn) return
    setShowIncorrectDialog(false)

    const shouldResetCounter =
      !isCorrect && !(isUnguessedEqual && effectiveGameMode === 'traversee')

    if (shouldResetCounter) {
      setDrinkCounter(1)
    }

    if (isOnline) {
      void pushState({
        showIncorrectDialog: false,
        drinkCounter: shouldResetCounter ? 1 : stateRef.current.drinkCounter,
      })
    }
  }

  // Passer au tour suivant
  const nextTurn = () => {
    if (gameOver) return
    if (isOnline && !isMyTurn) return

    const cur = stateRef.current
    let nextPlayerIndex = cur.currentPlayerIndex
    let newCounter = cur.drinkCounter

    if (effectiveGameMode === 'standard') {
      nextPlayerIndex = (cur.currentPlayerIndex + 1) % players.length
      setCurrentPlayerIndex(nextPlayerIndex)
      if (!cur.isCorrect && !cur.showIncorrectDialog) {
        newCounter = 1
        setDrinkCounter(1)
      }
    } else if (effectiveGameMode === 'traversee') {
      if (cur.activePlayers.length === 0) {
        endGame()
        return
      }
      nextPlayerIndex = (cur.currentPlayerIndex + 1) % cur.activePlayers.length
      setCurrentPlayerIndex(nextPlayerIndex)
      if (!cur.isCorrect && !cur.showIncorrectDialog && !cur.isUnguessedEqual) {
        newCounter = 1
        setDrinkCounter(1)
      }
    }

    const newCurrentCard = cur.nextCard
    setCurrentCard(newCurrentCard)
    setNextCard(null)
    setShowResult(false)
    setLastGuess(null)
    setIsCorrect(null)
    setIsUnguessedEqual(false)
    setIsProcessing(false)

    if (isMounted) {
      setComplimentIndex(Math.floor(Math.random() * simCompliments.length))
      setDebMessageIndex(Math.floor(Math.random() * debMessages.length))
    }

    if (isOnline) {
      void pushState({
        currentPlayer: nextPlayerIndex,
        currentCard: newCurrentCard as HiLoSyncedState['currentCard'],
        nextCard: null,
        showResult: false,
        lastGuess: null,
        isCorrect: null,
        isUnguessedEqual: false,
        isProcessing: false,
        drinkCounter: newCounter,
      })
    }
  }

  // Terminer le jeu
  const endGame = (due5Cards = false) => {
    setGameOver(true)
    setShowGameOver(true)

    const cur = stateRef.current
    let winnerId = null;

    if (effectiveGameMode === 'standard') {
      // Mode standard: le gagnant est celui qui a bu le moins de gorgées
      let minDrinks = Infinity;
      
      // Trouver le joueur avec le moins de gorgées bues
      for (const playerId in cur.gameResults) {
        if (cur.gameResults[playerId] < minDrinks) {
          minDrinks = cur.gameResults[playerId];
          winnerId = playerId;
        }
      }

      if (winnerId === null && players.length > 0) {
        winnerId = players[players.length - 1].id;
      }
    } else if (effectiveGameMode === 'traversee') {
      if (cur.correctGuessesInRow >= cur.targetGuesses) {
        winnerId = cur.activePlayers[cur.currentPlayerIndex]?.id || null;
      } else {
        let minDrinks = Infinity;

        for (const playerId in cur.gameResults) {
          if (cur.gameResults[playerId] < minDrinks) {
            minDrinks = cur.gameResults[playerId];
            winnerId = playerId;
          }
        }
      }
    }

    if (isOnline) {
      void pushState({
        gameOver: true,
        showGameOver: true,
        gameResults: cur.gameResults,
      })
    } else {
      players.forEach(player => {
        const drinks = cur.gameResults[player.id] || 0
        const isWinner = player.id === winnerId

        updatePlayerStats(player.id, 'hi-lo', {
          gamesPlayed: 1,
          wins: isWinner ? 1 : 0,
          totalDrinks: drinks,
        })
      })
    }

    void due5Cards // conservé pour compatibilité locale (5 cartes identiques)
  }

  // Redémarrer le jeu
  const restartGame = () => {
    if (isOnline) return
    setShowGameOver(false)
    setSameCardCount({})
    initializeGame()
  }

  // Quitter le jeu
  const quitGame = () => {
    if (isOnline) {
      void onlineSync?.leaveToMenu?.()
      return
    }
    onGameEnd()
  }

  // Obtenir le joueur actuel en mode Traversée
  const getCurrentPlayer = (): Player | undefined => {
    if (effectiveGameMode === 'traversee') {
      return activePlayers[currentPlayerIndex];
    } else {
      return players[currentPlayerIndex];
    }
  }

  const canAct = !isOnline || isMyTurn

  // Fonction pour obtenir un message personnalisé pour le joueur actuel
  const getPersonalizedMessage = (player: Player): string => {
    if (!player || !player.name) return "Joueur doit boire des gorgées !";
    
    const name = player.name.toLowerCase();
    
    if (name === 'sim' || name === 'riqui') {
      const compliment = simCompliments[complimentIndex];
      return `"${compliment}" ${player.name} doit boire ${drinkCounter} gorgées !`;
    } 
    else if (name === 'deb') {
      const message = debMessages[debMessageIndex];
      return `${player.name} doit boire ${drinkCounter} gorgées et ${message} !`;
    }
    
    return `${player.name} doit boire ${drinkCounter} gorgées !`;
  }

  // Style de carte adapté au thème sombre
  const getCardStyle = (color: string) => {
    return {
      backgroundColor: 'white',
      color: color === 'red' ? '#e53e3e' : '#1a202c',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      border: '2px solid',
      borderColor: color === 'red' ? '#e53e3e' : '#1a202c'
    }
  }

  if (!isMounted) {
    return <div className="p-6 text-center">Chargement du jeu...</div>;
  }

  if (isOnline && !onlineSync?.remoteState?.gameStarted) {
    return <div className="p-6 text-center">Chargement de la partie…</div>
  }

  // Obtenir le joueur actuel
  const currentPlayer = getCurrentPlayer();
  const specialEffectClass = currentPlayer ? getSpecialEffectClass(currentPlayer?.preferences?.specialEffect) : '';

  const cardsPlayed = 52 - deck.length - (currentCard ? 1 : 0) - (nextCard ? 1 : 0)

  const headerRight = (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-semibold">Gorgées : {drinkCounter}</span>
        <span className="text-[10px] text-gray-400">{cardsPlayed}/52</span>
      </div>
      {!isOnline && (
        <Button variant="outline" size="icon" onClick={restartGame} aria-label="Recommencer">
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
    </div>
  )

  const actionBar = !gameOver ? (
    isOnline && !isMyTurn ? (
      <p className="w-full text-center text-sm text-muted-foreground">
        Au tour de <span className="font-semibold">{onlineSync?.activePlayerName ?? '…'}</span>
      </p>
    ) : !showResult ? (
      <div className="flex w-full justify-center gap-2">
        <Button onClick={() => handleGuess('higher')} variant="outline" className="flex-1 max-w-[10rem]" disabled={!canAct || isFlipping || isProcessing}>
          <ArrowUp className="mr-1 h-4 w-4" />
          Plus haut
        </Button>
        <Button onClick={() => handleGuess('equal')} variant="outline" className="flex-1 max-w-[8rem]" disabled={!canAct || isFlipping || isProcessing}>
          <span className="mr-1">=</span>
          Égalité
        </Button>
        <Button onClick={() => handleGuess('lower')} variant="outline" className="flex-1 max-w-[10rem]" disabled={!canAct || isFlipping || isProcessing}>
          <ArrowDown className="mr-1 h-4 w-4" />
          Plus bas
        </Button>
      </div>
    ) : !isCorrect ? (
      <Button onClick={nextTurn} className="mx-auto w-full max-w-xs" disabled={!canAct}>Suivant</Button>
    ) : (
      <div className="w-full text-center font-semibold text-green-500">Correct ! Prochain joueur…</div>
    )
  ) : null

  return (
    <>
    <GameShell title="Hi/Lo" onBack={quitGame} headerRight={headerRight} actionBar={actionBar} maxWidth={760}>
        {effectiveGameMode === 'traversee' && (
          <div className="mb-2 text-center text-sm">
            <span className="font-medium">Mode Traversée</span>
            <span className="ml-2">Objectif : {correctGuessesInRow}/{targetGuesses} bonnes réponses</span>
          </div>
        )}

        {effectiveGameMode === 'traversee' && (
          <div className="mb-4 flex gap-2 flex-wrap justify-center">
            {players.map(player => {
              const isActive = activePlayers.some(p => p.id === player.id);
              return (
                <div 
                  key={player.id} 
                  className={`p-1 px-2 rounded-full text-xs flex items-center gap-1 ${
                    isActive ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                  <PlayerName player={player} />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col items-center space-y-6">
          {/* Joueur actuel */}
          {currentPlayer && (
            <div className="flex items-center space-x-2 mb-4">
              <Avatar className={`h-10 w-10 ${isSpecialPlayer(currentPlayer) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                <AvatarImage src={currentPlayer?.preferences?.avatar} />
                <AvatarFallback className={currentPlayer?.preferences?.color || 'bg-primary'}>
                  {currentPlayer?.preferences?.icon || (currentPlayer?.name ? currentPlayer.name.charAt(0).toUpperCase() : '?')}
                </AvatarFallback>
              </Avatar>
              <PlayerName player={currentPlayer} className={`font-semibold ${specialEffectClass}`} />
            </div>
          )}

          {/* Cartes */}
          <div className="flex justify-center items-center gap-3 sm:gap-8">
            {/* Carte actuelle */}
            {currentCard && (
              <div 
                className="w-[clamp(5rem,26vw,8rem)] h-[clamp(7.5rem,39vw,12rem)] rounded-lg flex flex-col items-center justify-center text-[clamp(1.5rem,8vw,2.25rem)] font-bold relative"
                style={getCardStyle(currentCard.color)}
              >
                <div>{currentCard.value}</div>
                <div>{currentCard.suit}</div>
              </div>
            )}

            {/* Carte suivante avec animation */}
            <div className="relative w-[clamp(5rem,26vw,8rem)] h-[clamp(7.5rem,39vw,12rem)]">
              {isFlipping ? (
                <motion.div
                  className="absolute w-full h-full"
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: 180 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="absolute w-full h-full backface-hidden rounded-lg flex items-center justify-center text-gray-400 bg-white border-2 border-gray-300">
                    ?
                  </div>
                  <div 
                    className="absolute w-full h-full backface-hidden rounded-lg flex flex-col items-center justify-center text-[clamp(1.5rem,8vw,2.25rem)] font-bold"
                    style={{
                      transform: 'rotateY(180deg)',
                      backgroundColor: 'white',
                      color: nextCard?.color === 'red' ? '#e53e3e' : '#1a202c',
                      border: '2px solid',
                      borderColor: nextCard?.color === 'red' ? '#e53e3e' : '#1a202c'
                    }}
                  >
                    {nextCard && (
                      <>
                        <div>{nextCard.value}</div>
                        <div>{nextCard.suit}</div>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : showResult ? (
                <div 
                  className="w-full h-full rounded-lg flex flex-col items-center justify-center text-[clamp(1.5rem,8vw,2.25rem)] font-bold"
                  style={nextCard ? getCardStyle(nextCard.color) : {}}
                >
                  {nextCard && (
                    <>
                      <div>{nextCard.value}</div>
                      <div>{nextCard.suit}</div>
                    </>
                  )}
                </div>
              ) : (
                <div className="w-full h-full rounded-lg flex items-center justify-center text-gray-400 bg-white border-2 border-gray-300">
                  ?
                </div>
              )}
            </div>
          </div>

          {/* Indicateur de progression du paquet de cartes */}
          <div className="w-full max-w-xs mt-2">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                style={{ 
                  width: `${((52 - deck.length - (currentCard ? 1 : 0) - (nextCard ? 1 : 0)) / 52) * 100}%`,
                  backgroundColor: deck.length < 10 ? '#f56565' : '#3b82f6' 
                }}
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1 text-gray-500">
              <span>{52 - deck.length - (currentCard ? 1 : 0) - (nextCard ? 1 : 0)} jouées</span>
              <span>{deck.length + (nextCard ? 1 : 0)} restantes</span>
            </div>
          </div>

        </div>
    </GameShell>

      {/* Dialogue de fin de jeu */}
      <Dialog open={showGameOver} onOpenChange={setShowGameOver}>
        <DialogContent className={`${isMobile ? 'w-[95%] max-w-lg p-3 sm:p-6' : ''}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Trophy className="mr-2 h-5 w-5 text-yellow-500" />
              {effectiveGameMode === 'traversee' && correctGuessesInRow >= targetGuesses 
                ? "Félicitations !" 
                : sameCardCount[`${nextCard?.value}-${nextCard?.suit}`] > 4
                  ? "5 cartes identiques ! Fin de la partie"
                  : "Fin de la partie"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {effectiveGameMode === 'traversee' && correctGuessesInRow >= targetGuesses && (
              <p className="font-medium text-green-600">
                Vous avez atteint l&apos;objectif de {targetGuesses} bonnes réponses consécutives !
              </p>
            )}
            
            {sameCardCount[`${nextCard?.value}-${nextCard?.suit}`] > 4 && (
              <p className="font-medium text-orange-600">
                5 cartes identiques ({nextCard?.value} {nextCard?.suit}) sont apparues ! Fin de la partie.
              </p>
            )}
            
            <h3 className="font-semibold">Résultats:</h3>
            <ul className={`space-y-2 ${isMobile ? 'max-h-[40vh] overflow-y-auto pr-2' : ''}`}>
              {players.map(player => {
                const specialEffectClass = getSpecialEffectClass(player?.preferences?.specialEffect);
                const isSpecial = isSpecialPlayer(player);
                return (
                  <li key={player.id} className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <Avatar className={`h-8 w-8 ${isSpecial ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                        <AvatarImage src={player?.preferences?.avatar} />
                        <AvatarFallback className={player?.preferences?.color || 'bg-primary'}>
                          {player?.preferences?.icon || (player?.name ? player.name.charAt(0).toUpperCase() : '?')}
                        </AvatarFallback>
                      </Avatar>
                      <PlayerName player={player} className={`${specialEffectClass || ''} ${isMobile ? 'text-sm' : ''}`} />
                    </div>
                    <span>{gameResults[player.id] || 0} gorgées</span>
                  </li>
                );
              })}
            </ul>
          </div>
          
          <DialogFooter className={`flex ${isMobile ? 'flex-col space-y-2' : 'space-x-2'}`}>
            <Button 
              variant="outline" 
              onClick={restartGame}
              className={isMobile ? 'w-full' : ''}
            >
              Rejouer
            </Button>
            <Button onClick={quitGame} className={isMobile ? 'w-full' : ''}>
              Quitter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue pour mauvais choix */}
      <Dialog open={showIncorrectDialog} onOpenChange={setShowIncorrectDialog}>
        <DialogContent className={`bg-red-50 border-red-200 ${isMobile ? 'w-[95%] max-w-lg p-4' : ''}`}>
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {isUnguessedEqual && effectiveGameMode === 'traversee' ? "Égalité non devinée !" : "Mauvaise réponse !"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {effectiveGameMode === 'standard' ? (
              <p className="text-center text-lg font-semibold text-black">
                {currentPlayer ? getPersonalizedMessage(currentPlayer) : "Joueur doit boire des gorgées !"}
              </p>
            ) : (
              <div className="text-center text-black">
                {isUnguessedEqual ? (
                  <p className="text-lg font-semibold mb-2">
                    C&apos;est une égalité ! Tous les joueurs boivent 1 gorgée.
                  </p>
                ) : (
                  <p className="text-lg font-semibold mb-2">
                    Tous les joueurs doivent boire {drinkCounter} gorgées !
                  </p>
                )}
                <p className="text-sm">
                  {!isUnguessedEqual && "La série de bonnes réponses repart à zéro. "}
                  {activePlayers.length > 1 && 
                    ` C'est maintenant au tour de ${activePlayers[(currentPlayerIndex + 1) % activePlayers.length]?.name}`}
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={closeIncorrectDialog} className={isMobile ? 'w-full' : ''} disabled={!canAct}>
              Compris !
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        
        @keyframes gradientFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        /* Effet rouge */
        .special-player-name-red {
          background: linear-gradient(90deg, #ff0000, #ff6b6b, #ff0000);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: gradientFlow 3s linear infinite;
          font-weight: bold;
          text-shadow: 0 0 5px rgba(255, 0, 0, 0.3);
        }
        
        /* Effet bleu */
        .special-player-name-blue {
          background: linear-gradient(90deg, #0066ff, #00ccff, #0066ff);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: gradientFlow 3s linear infinite;
          font-weight: bold;
          text-shadow: 0 0 5px rgba(0, 102, 255, 0.3);
        }
        
        /* Effet arc-en-ciel */
        .special-player-name-rainbow {
          background: linear-gradient(90deg, #ff0000, #ffa500, #ffff00, #00ff00, #0000ff, #4b0082, #ee82ee, #ff0000);
          background-size: 400% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: gradientFlow 6s linear infinite;
          font-weight: bold;
          text-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
        }
        
        /* Effet or */
        .special-player-name-gold {
          background: linear-gradient(90deg, #ffd700, #ffcc00, #ffdb58, #ffd700);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: gradientFlow 3s linear infinite;
          font-weight: bold;
          text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
        }
        
        /* Effet feu */
        .special-player-name-fire {
          background: linear-gradient(90deg, #ff4500, #ff8c00, #ff4500);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: gradientFlow 2s linear infinite;
          font-weight: bold;
          text-shadow: 0 0 8px rgba(255, 69, 0, 0.7);
        }
        
        /* Effet néon */
        .special-player-name-neon {
          background: linear-gradient(90deg, #00ff00, #66ff66, #00ff00);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: gradientFlow 3s linear infinite;
          font-weight: bold;
          text-shadow: 0 0 10px rgba(0, 255, 0, 0.8);
        }
      `}</style>
    </>
  )
} 