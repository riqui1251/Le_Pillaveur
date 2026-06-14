/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect } from 'react'
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

export default function Game({ players, onGameEnd, updatePlayerStats, gameMode }: GameProps) {
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

  // Vérifier si le composant est monté (côté client)
  useEffect(() => {
    setIsMounted(true);
    
    // Initialiser les indices aléatoires une seule fois après le montage
    setComplimentIndex(Math.floor(Math.random() * simCompliments.length));
    setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
  }, []);

  // Initialisation du jeu
  useEffect(() => {
    if (isMounted) {
      initializeGame();
    }
  }, [isMounted]);

  // Effet pour passer automatiquement au tour suivant après un délai en cas de bonne réponse
  useEffect(() => {
    if (!isMounted) return;
    
    if (showResult && isCorrect && !isProcessing) {
      setIsProcessing(true)
      const timer = setTimeout(() => {
        nextTurn()
        setIsProcessing(false)
      }, 1500) // Délai de 1.5 secondes
      
      return () => clearTimeout(timer)
    }
  }, [showResult, isCorrect, isMounted]);

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
    if (gameMode === 'standard') {
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
    if (gameMode === 'traversee') {
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

    // Régénérer le deck si nécessaire
    const currentDeck = regenerateDeckIfNeeded();
    
    // Tirer la prochaine carte
    const nextCardFromDeck = currentDeck[0]
    const remainingDeck = currentDeck.slice(1)
    setNextCard(nextCardFromDeck)
    setDeck(remainingDeck)
    setLastGuess(guess)
    
    // Démarrer l'animation de retournement
    setIsFlipping(true)
    
    // Vérifier si la prédiction est correcte
    const currentValue = cardValues[currentCard.value]
    const nextValue = cardValues[nextCardFromDeck.value]
    
    let correct = false
    if (guess === 'higher' && nextValue > currentValue) {
      correct = true
    } else if (guess === 'lower' && nextValue < currentValue) {
      correct = true
    } else if (guess === 'equal' && nextValue === currentValue) {
      correct = true
    }

    // Vérifier si c'est une égalité que personne n'a choisie (pour le mode traversée)
    const unguessedEqual = nextValue === currentValue && guess !== 'equal';
    setIsUnguessedEqual(unguessedEqual);

    // Vérifier si on a plus de 4 cartes identiques
    const cardKey = `${nextCardFromDeck.value}-${nextCardFromDeck.suit}`
    const updatedSameCardCount = { ...sameCardCount }
    updatedSameCardCount[cardKey] = (updatedSameCardCount[cardKey] || 0) + 1
    setSameCardCount(updatedSameCardCount)

    // Attendre que l'animation soit terminée avant de montrer le résultat
    setTimeout(() => {
      setIsCorrect(correct)
      setShowResult(true)
      setIsFlipping(false)

      // Vérifier si on a plus de 4 cartes identiques pour terminer le jeu
      if (updatedSameCardCount[cardKey] > 4) {
        // Le joueur actuel a perdu
        const currentPlayer = getCurrentPlayer()
        if (currentPlayer) {
          setGameResults(prev => ({
            ...prev,
            [currentPlayer.id]: (prev[currentPlayer.id] || 0) + drinkCounter
          }))
        }
        
        // Terminer la partie car on a atteint 5 cartes identiques
        endGame(true)
        setShowIncorrectDialog(true)
        return
      }

      if (gameMode === 'standard') {
        // Mode standard - Comportement original
        if (correct) {
          // Augmenter le compteur de gorgées (bonus pour égalité correcte)
          if (guess === 'equal') {
            // Bonus pour avoir deviné l'égalité (plus difficile)
            setDrinkCounter(prev => prev + 3)
          } else {
            setDrinkCounter(prev => prev + 1)
          }
        } else {
          // Le joueur doit boire le cumul des gorgées
          const currentPlayer = players[currentPlayerIndex]
          setGameResults(prev => ({
            ...prev,
            [currentPlayer.id]: (prev[currentPlayer.id] || 0) + drinkCounter
          }))
          // Afficher la fenêtre de mauvais choix sans réinitialiser le compteur
          setShowIncorrectDialog(true)
          
          // On ne réinitialise plus le compteur ici, mais dans closeIncorrectDialog
        }
      } else if (gameMode === 'traversee') {
        // Mode traversée
        if (correct) {
          // Augmenter le compteur de bonnes réponses consécutives
          setCorrectGuessesInRow(prev => prev + 1)
          
          // Augmenter le compteur de gorgées comme dans le mode standard
          if (guess === 'equal') {
            // Bonus pour avoir deviné l'égalité (plus difficile)
            setDrinkCounter(prev => prev + 3)
          } else {
            setDrinkCounter(prev => prev + 1)
          }
          
          // Si le joueur a deviné "égalité" correctement, il sort de la partie
          if (guess === 'equal') {
            const updatedPlayers = activePlayers.filter((_, index) => index !== currentPlayerIndex);
            setActivePlayers(updatedPlayers);
            
            // Si plus aucun joueur, fin de la partie
            if (updatedPlayers.length === 0) {
              endGame();
              return;
            }
          }
          
          // Si on a atteint l'objectif, fin de la partie
          if (correctGuessesInRow + 1 >= targetGuesses) {
            endGame();
          }
        } else if (isUnguessedEqual) {
          // Cas spécial: égalité que personne n'a choisie
          // Tous les joueurs boivent 1 gorgée, mais le cumul reste inchangé
          activePlayers.forEach(player => {
            setGameResults(prev => ({
              ...prev,
              [player.id]: (prev[player.id] || 0) + 1
            }));
          });
          
          // Afficher la fenêtre de mauvais choix spéciale pour égalité
          setShowIncorrectDialog(true);
          
          // On ne modifie pas le compteur de gorgées ici
        } else {
          // Mauvaise réponse: tous les joueurs boivent
          activePlayers.forEach(player => {
            setGameResults(prev => ({
              ...prev,
              [player.id]: (prev[player.id] || 0) + drinkCounter
            }));
          });
          
          // Réinitialiser le compteur de bonnes réponses
          setCorrectGuessesInRow(0);
          
          // Afficher la fenêtre de mauvais choix
          setShowIncorrectDialog(true);
          
          // On ne réinitialise plus le compteur ici, mais dans closeIncorrectDialog
        }
      }
    }, 600) // Durée de l'animation
  }

  // Fermer la fenêtre de mauvais choix
  const closeIncorrectDialog = () => {
    setShowIncorrectDialog(false)
    
    // Réinitialiser le compteur à 1 seulement après avoir fermé la boîte de dialogue
    // Si c'est une égalité non devinée en mode traversée, on ne réinitialise pas le compteur
    if (!isCorrect && !(isUnguessedEqual && gameMode === 'traversee')) {
      if (gameMode === 'standard') {
        setDrinkCounter(1)
      } else if (gameMode === 'traversee') {
        setDrinkCounter(1)
      }
    }
  }

  // Passer au tour suivant
  const nextTurn = () => {
    if (gameOver) return

    if (gameMode === 'standard') {
      // Mode standard - comportement original
      // Passer au joueur suivant, que la prédiction soit correcte ou non
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
      setCurrentPlayerIndex(nextPlayerIndex)
      
      // Si la prédiction était incorrecte et que la boîte de dialogue a été fermée,
      // réinitialiser le compteur à 1
      if (!isCorrect && !showIncorrectDialog) {
        setDrinkCounter(1)
      }
    } else if (gameMode === 'traversee') {
      if (activePlayers.length === 0) {
        endGame();
        return;
      }
      
      if (isCorrect) {
        // Passer au joueur suivant en sautant les joueurs inactifs
        const nextIndex = (currentPlayerIndex + 1) % activePlayers.length;
        setCurrentPlayerIndex(nextIndex);
        
        // On garde le nombre de gorgées (il augmente progressivement)
      } else {
        // En cas d'erreur, on repart à 1 avec le joueur suivant
        // Le joueur suivant celui qui s'est trompé
        const nextIndex = (currentPlayerIndex + 1) % activePlayers.length;
        setCurrentPlayerIndex(nextIndex);
        
        // On ne réinitialise plus le compteur ici, mais dans closeIncorrectDialog
        // Si c'est une égalité non devinée, on ne réinitialise pas le compteur
        if (!showIncorrectDialog && !isUnguessedEqual) {
          setDrinkCounter(1);
        }
      }
    }

    // Préparer pour le prochain tour
    setCurrentCard(nextCard)
    setNextCard(null)
    setShowResult(false)
    setLastGuess(null)
    setIsCorrect(null)
    setIsUnguessedEqual(false)
    
    // Générer de nouveaux indices aléatoires pour les messages
    if (isMounted) {
      setComplimentIndex(Math.floor(Math.random() * simCompliments.length));
      setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
    }
  }

  // Terminer le jeu
  const endGame = (due5Cards = false) => {
    setGameOver(true)
    setShowGameOver(true)

    // Déterminer le gagnant selon le mode de jeu
    let winnerId = null;
    
    if (gameMode === 'standard') {
      // Mode standard: le gagnant est celui qui a bu le moins de gorgées
      let minDrinks = Infinity;
      
      // Trouver le joueur avec le moins de gorgées bues
      for (const playerId in gameResults) {
        if (gameResults[playerId] < minDrinks) {
          minDrinks = gameResults[playerId];
          winnerId = playerId;
        }
      }
      
      // Si tous les joueurs ont bu 0 gorgées (cas rare), le dernier joueur est le gagnant
      if (winnerId === null && players.length > 0) {
        winnerId = players[players.length - 1].id;
      }
    } else if (gameMode === 'traversee') {
      // Mode Traversée: Si on arrive ici, c'est soit que l'objectif est atteint
      // soit que tous les joueurs sont sortis (par égalité correcte)
      
      // Si on a atteint l'objectif, le dernier joueur à avoir joué est le gagnant
      if (correctGuessesInRow >= targetGuesses) {
        // Le joueur actuel est le gagnant car c'est lui qui a complété l'objectif
        winnerId = activePlayers[currentPlayerIndex]?.id || null;
      } else {
        // Sinon, le gagnant est celui qui a bu le moins (comme dans le mode standard)
        let minDrinks = Infinity;
        
        for (const playerId in gameResults) {
          if (gameResults[playerId] < minDrinks) {
            minDrinks = gameResults[playerId];
            winnerId = playerId;
          }
        }
      }
    }

    // Mettre à jour les statistiques des joueurs
    players.forEach(player => {
      const drinks = gameResults[player.id] || 0
      const isWinner = player.id === winnerId;
      
      updatePlayerStats(player.id, 'hi-lo', {
        gamesPlayed: 1,
        wins: isWinner ? 1 : 0,
        totalDrinks: drinks
      })
    })
  }

  // Redémarrer le jeu
  const restartGame = () => {
    // Fermer la fenêtre de fin de partie
    setShowGameOver(false)
    // Réinitialiser l'état du jeu
    setSameCardCount({})
    initializeGame()
  }

  // Quitter le jeu
  const quitGame = () => {
    onGameEnd()
  }

  // Obtenir le joueur actuel en mode Traversée
  const getCurrentPlayer = (): Player | undefined => {
    if (gameMode === 'traversee') {
      return activePlayers[currentPlayerIndex];
    } else {
      return players[currentPlayerIndex];
    }
  }

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

  // Si le composant n'est pas encore monté (côté client), afficher un état de chargement ou rien
  if (!isMounted) {
    return <div className="p-6 text-center">Chargement du jeu...</div>;
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
      <Button variant="outline" size="icon" onClick={restartGame} aria-label="Recommencer">
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )

  const actionBar = !gameOver ? (
    !showResult ? (
      <div className="flex w-full justify-center gap-2">
        <Button onClick={() => handleGuess('higher')} variant="outline" className="flex-1 max-w-[10rem]" disabled={isFlipping || isProcessing}>
          <ArrowUp className="mr-1 h-4 w-4" />
          Plus haut
        </Button>
        <Button onClick={() => handleGuess('equal')} variant="outline" className="flex-1 max-w-[8rem]" disabled={isFlipping || isProcessing}>
          <span className="mr-1">=</span>
          Égalité
        </Button>
        <Button onClick={() => handleGuess('lower')} variant="outline" className="flex-1 max-w-[10rem]" disabled={isFlipping || isProcessing}>
          <ArrowDown className="mr-1 h-4 w-4" />
          Plus bas
        </Button>
      </div>
    ) : !isCorrect ? (
      <Button onClick={nextTurn} className="mx-auto w-full max-w-xs">Suivant</Button>
    ) : (
      <div className="w-full text-center font-semibold text-green-500">Correct ! Prochain joueur…</div>
    )
  ) : null

  return (
    <>
    <GameShell title="Hi/Lo" onBack={quitGame} headerRight={headerRight} actionBar={actionBar} maxWidth={760}>
        {gameMode === 'traversee' && (
          <div className="mb-2 text-center text-sm">
            <span className="font-medium">Mode Traversée</span>
            <span className="ml-2">Objectif : {correctGuessesInRow}/{targetGuesses} bonnes réponses</span>
          </div>
        )}

        {gameMode === 'traversee' && (
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
              {gameMode === 'traversee' && correctGuessesInRow >= targetGuesses 
                ? "Félicitations !" 
                : sameCardCount[`${nextCard?.value}-${nextCard?.suit}`] > 4
                  ? "5 cartes identiques ! Fin de la partie"
                  : "Fin de la partie"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {gameMode === 'traversee' && correctGuessesInRow >= targetGuesses && (
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
              {isUnguessedEqual && gameMode === 'traversee' ? "Égalité non devinée !" : "Mauvaise réponse !"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {gameMode === 'standard' ? (
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
            <Button onClick={closeIncorrectDialog} className={isMobile ? 'w-full' : ''}>
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
      `}</style>
    </>
  )
} 