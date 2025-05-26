/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { RotateCcw, Home, ArrowDown } from 'lucide-react'
import useScreenSize from '@/hooks/useScreenSize'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Player as BasePlayer } from '@/lib/players'
import { usePlayers } from '@/hooks/usePlayers'
import { PlayerName } from '@/components/ui/PlayerName'

// Types de cartes
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
type Value = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
type Card = {
  suit: Suit
  value: Value
  faceUp: boolean
  position: { row: number; col: number }
}

// Valeurs numériques des cartes pour les comparaisons
const cardValues: Record<Value, number> = {
  'A': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13
}

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
  pyramidHeight: number
  gameMode: 'fun' | 'classic'
  deckCount: 1 | 2
  cardsToSelect: 4 | 5
}

export default function Game({ players, onGameEnd, pyramidHeight, gameMode, deckCount, cardsToSelect }: GameProps) {
  const [deck, setDeck] = useState<Card[]>([])
  const [pyramid, setPyramid] = useState<Card[][]>([])
  const [gameOver, setGameOver] = useState(false)
  const [message, setMessage] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [nextCardToFlip, setNextCardToFlip] = useState<{row: number, col: number} | null>(null)
  const [lastFlippedCard, setLastFlippedCard] = useState<{row: number, col: number} | null>(null)
  const [totalCardsFlipped, setTotalCardsFlipped] = useState(0)
  const [totalCards, setTotalCards] = useState(0)
  const [remainingCards, setRemainingCards] = useState<Card[]>([])
  const [currentCard, setCurrentCard] = useState<Card | null>(null)
  const [gameStarted, setGameStarted] = useState(false)
  const [isCardFlipping, setIsCardFlipping] = useState(false)
  const { isMobile, width } = useScreenSize();
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  
  // États pour le mode classique
  const [classicGamePhase, setClassicGamePhase] = useState<'selection' | 'play'>('selection')
  const [selectedCardsByPlayer, setSelectedCardsByPlayer] = useState<Record<string, Card[]>>({})
  const [currentSelectionPlayer, setCurrentSelectionPlayer] = useState<number>(0)
  const [availableCardsForSelection, setAvailableCardsForSelection] = useState<Card[]>([])
  
  // État pour les joueurs qui doivent boire suite à la dernière carte retournée
  const [playersWithLastCard, setPlayersWithLastCard] = useState<string[]>([])
  
  // Définir les couleurs pour les avatars des joueurs
  const playerColors = [
    "bg-green-500",
    "bg-blue-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-yellow-500",
    "bg-indigo-500",
    "bg-red-500",
  ];

  // Ajustement de la hauteur de la pyramide pour les appareils mobiles
  const effectivePyramidHeight = isMobile && pyramidHeight > 5 ? 5 : pyramidHeight;
  // Réduire la taille pour les ordinateurs
  const containerMaxWidth = isMobile ? "100%" : "900px";
  // Ajuster la taille des cartes en fonction du type d'appareil
  const cardWidth = isMobile ? (width < 400 ? 'w-10 h-16' : 'w-12 h-18') : 'w-16 h-24';
  const cardFontSize = isMobile ? (width < 400 ? 'text-sm' : 'text-base') : 'text-xl';
  const suitFontSize = isMobile ? (width < 400 ? 'text-base' : 'text-lg') : 'text-2xl';

  // Fonction d'initialisation du jeu extraite dans un useCallback pour éviter les re-créations inutiles
  const initializeGame = useCallback(() => {
    if (gameMode === 'fun') {
      // Mode Fun - pyramide aléatoire
      // Créer un nouveau jeu de cartes
      const newDeck = createDeck(1) // Toujours un seul paquet en mode Fun
      
      // Mélanger le jeu
      const shuffledDeck = shuffleDeck(newDeck)
      
      // Créer la pyramide de cartes
      const { pyramidCards, remainingDeck } = createPyramid(shuffledDeck, pyramidHeight)
      
      // Mettre à jour les états
      setPyramid(pyramidCards)
      setRemainingCards(remainingDeck)
      setCurrentCard(null)
      setGameOver(false)
      setMessage("")
      setGameStarted(true)
      setIsCardFlipping(false)
      
      // Calculer le nombre total de cartes dans la pyramide
      let totalCardCount = 0
      for (let i = 0; i < pyramidHeight; i++) {
        totalCardCount += i + 1
      }
      setTotalCards(totalCardCount)
      
      // Réinitialiser le compteur de cartes retournées
      setTotalCardsFlipped(0)
      
      // Définir la première carte à retourner (en bas à gauche)
      setNextCardToFlip({ row: pyramidHeight - 1, col: 0 })
      
      // Réinitialiser la dernière carte retournée
      setLastFlippedCard(null)
    } else {
      // Mode Classique - les joueurs sélectionnent leurs cartes
      // Créer un nouveau jeu de cartes selon le nombre choisi
      const newDeck = createDeck(deckCount)
      
      // Mélanger le jeu
      const shuffledDeck = shuffleDeck(newDeck)
      
      // Initialiser l'état des cartes disponibles pour la sélection
      setAvailableCardsForSelection(shuffledDeck)
      
      // Initialiser la phase de sélection
      setClassicGamePhase('selection')
      
      // Initialiser le joueur actuel pour la sélection
      setCurrentSelectionPlayer(0)
      
      // Réinitialiser les cartes sélectionnées par joueur
      const initialSelectedCards: Record<string, Card[]> = {}
      players.forEach(player => {
        initialSelectedCards[player.id] = []
      })
      setSelectedCardsByPlayer(initialSelectedCards)
      
      // Réinitialiser les états du jeu
      setPyramid([])
      setRemainingCards([])
      setCurrentCard(null)
      setGameOver(false)
      setMessage(`${players[0].name}, sélectionnez ${cardsToSelect} cartes`)
      setGameStarted(true)
      setIsCardFlipping(false)
      setTotalCardsFlipped(0)
      setTotalCards(0)
      setNextCardToFlip(null)
      setLastFlippedCard(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pyramidHeight, gameMode, deckCount, cardsToSelect, players]);

  // Effect pour initialiser le jeu au montage du composant
  useEffect(() => {
    initializeGame()
  }, [initializeGame]);

  // Créer un jeu de cartes
  const createDeck = (deckCount: number): Card[] => {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
    const values: Value[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const deck: Card[] = []
    
    // Création de 1 ou 2 paquets selon le paramètre
    for (let i = 0; i < deckCount; i++) {
      for (const suit of suits) {
        for (const value of values) {
          deck.push({
            suit,
            value,
            faceUp: false,
            position: { row: 0, col: 0 }
          })
        }
      }
    }
    
    return deck
  }

  // Mélanger le jeu de cartes
  const shuffleDeck = (deck: Card[]): Card[] => {
    const shuffled = [...deck]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Créer la pyramide de cartes
  const createPyramid = (deck: Card[], rows: number): { pyramidCards: Card[][]; remainingDeck: Card[] } => {
    const actualRows = isMobile ? Math.min(rows, 5) : rows;
    const pyramidCards: Card[][] = [];
    let deckIndex = 0;
    
    for (let row = 0; row < actualRows; row++) {
      const rowCards: Card[] = [];
      for (let col = 0; col <= row; col++) {
        if (deckIndex < deck.length) {
          const card = { ...deck[deckIndex], faceUp: false, position: { row, col } };
          rowCards.push(card);
          deckIndex++;
        }
      }
      pyramidCards.push(rowCards);
    }
    
    return {
      pyramidCards,
      remainingDeck: deck.slice(deckIndex)
    };
  };

  // Retourner la prochaine carte
  const flipNextCard = () => {
    if (!nextCardToFlip || isCardFlipping) return
    
    setIsCardFlipping(true)
    
    // Réinitialiser les joueurs qui doivent boire de la carte précédente
    setPlayersWithLastCard([])
    
    // Mettre à jour la pyramide pour retourner la carte
    const updatedPyramid = [...pyramid]
    const { row, col } = nextCardToFlip
    
    if (updatedPyramid[row] && updatedPyramid[row][col]) {
      updatedPyramid[row][col].faceUp = true
      setPyramid(updatedPyramid)
      
      // Mettre à jour le compteur de cartes retournées
      setTotalCardsFlipped(prev => prev + 1)
      
      // Mettre à jour le message avec la valeur de la carte
      const card = updatedPyramid[row][col]
      const cardValue = cardValues[card.value]
      
      // Message personnalisé en fonction du mode de jeu
      if (gameMode === 'fun') {
        // Mode Fun - afficher uniquement la valeur
        if (row === 0) {
          setMessage(`${card.value} ${getSuitSymbol(card.suit)} - CUL SEC !`)
        } else {
          setMessage(`${card.value} ${getSuitSymbol(card.suit)}`)
        }
        // En mode Fun, aucun joueur spécifique n'est concerné
        setPlayersWithLastCard([]);
      } else {
        // Mode Classique - vérifier les joueurs qui ont sélectionné cette valeur
        const playersWithThisValue: BasePlayer[] = [];
        const playerIdsWithThisValue: string[] = [];
        
        // Parcourir tous les joueurs et leurs cartes sélectionnées
        players.forEach(player => {
          const hasSelectedValue = selectedCardsByPlayer[player.id].some(
            selectedCard => selectedCard.value === card.value
          );
          
          if (hasSelectedValue) {
            playersWithThisValue.push(player);
            playerIdsWithThisValue.push(player.id);
          }
        });
        
        // Mettre à jour l'état des joueurs qui doivent boire
        setPlayersWithLastCard(playerIdsWithThisValue);
        
        if (playersWithThisValue.length > 0) {
          // Des joueurs ont sélectionné cette valeur
          const playerNames = playersWithThisValue.map(p => p.name).join(', ');
          
          if (row === 0) {
            // Niveau CUL SEC
            setMessage(`${card.value} ${getSuitSymbol(card.suit)} - CUL SEC pour ${playerNames} !`);
          } else if (playersWithThisValue.length === 1) {
            setMessage(`${card.value} ${getSuitSymbol(card.suit)} - ${playerNames} a cette carte !`);
          } else {
            setMessage(`${card.value} ${getSuitSymbol(card.suit)} - ${playerNames} ont cette carte !`);
          }
        } else {
          // Aucun joueur n'a sélectionné cette valeur
          setPlayersWithLastCard([]);
          
          if (row === 0) {
            setMessage(`${card.value} ${getSuitSymbol(card.suit)} - CUL SEC (personne concerné) !`);
          } else {
            setMessage(`${card.value} ${getSuitSymbol(card.suit)} - Personne n'a cette carte`);
          }
        }
      }
      
      // Sauvegarder la dernière carte retournée
      setLastFlippedCard({ row, col })
      
      // Vérifier si toutes les cartes ont été retournées
      if (totalCardsFlipped + 1 >= totalCards) {
        setGameOver(true)
        setNextCardToFlip(null)
        setMessage("Partie terminée ! Toutes les cartes ont été retournées.")
      } else {
        // Trouver la prochaine carte à retourner
        findNextCardToFlip(updatedPyramid, row, col)
      }
    }
    
    setTimeout(() => {
      setIsCardFlipping(false)
    }, 500)
  }

  // Trouver la prochaine carte à retourner
  const findNextCardToFlip = (currentPyramid: Card[][], currentRow: number, currentCol: number) => {
    // Stratégie: parcourir la pyramide ligne par ligne, de bas en haut
    // D'abord, essayer la colonne suivante dans la même rangée
    if (currentCol + 1 < currentPyramid[currentRow].length) {
      setNextCardToFlip({ row: currentRow, col: currentCol + 1 });
      return;
    }
    
    // Si nous sommes à la fin de la rangée, passer à la rangée au-dessus
    if (currentRow > 0) {
      setNextCardToFlip({ row: currentRow - 1, col: 0 });
      return;
    }
    
    // Si nous sommes arrivés ici, il n'y a plus de cartes à retourner
    setNextCardToFlip(null);
  }

  // Obtenir la couleur de la carte en fonction de sa couleur
  const getCardColor = (suit: Suit): string => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-black'
  }

  // Obtenir le symbole de la couleur
  const getSuitSymbol = (suit: Suit): string => {
    switch (suit) {
      case 'hearts': return '♥'
      case 'diamonds': return '♦'
      case 'clubs': return '♣'
      case 'spades': return '♠'
    }
  }

  // Réinitialiser le jeu
  const resetGame = () => {
    initializeGame()
  }

  // Rendu d'un joueur avec son avatar
  const renderPlayer = (player: BasePlayer, index: number) => {
    return (
      <div
        key={player.id}
        className={`
          rounded-lg p-2 transition-all cursor-pointer hover:bg-primary/10
          ${currentPlayerIndex === index ? 'bg-primary/20' : ''}
        `}
        onClick={() => setCurrentPlayerIndex(index)}
      >
        <div className="flex items-center space-x-2">
          <Avatar className={playerColors[index % playerColors.length]}>
            <AvatarFallback>{player.name.charAt(0).toUpperCase()}</AvatarFallback>
            {player.preferences?.avatar && (
              <AvatarImage src={player.preferences.avatar} alt={player.name} />
            )}
          </Avatar>
          <div className="flex flex-col">
            <PlayerName player={player} className="font-medium" />
            <div className="text-xs text-muted-foreground">
              {player.stats?.totalDrinks || 0} gorgée{(player.stats?.totalDrinks || 0) !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Fonction pour gérer la sélection de cartes par un joueur (mode classique)
  const handleCardSelection = (value: Value) => {
    if (classicGamePhase !== 'selection') return;
    
    const currentPlayer = players[currentSelectionPlayer];
    const playerSelectedCards = [...(selectedCardsByPlayer[currentPlayer.id] || [])];
    
    // Vérifier si le joueur a déjà sélectionné le maximum de cartes
    if (playerSelectedCards.length >= cardsToSelect) {
      return;
    }
    
    // Vérifier si cette valeur a encore des cartes disponibles
    const availableCardsOfValue = availableCardsForSelection.filter(
      card => card.value === value
    );
    
    // Vérifier si le joueur a déjà sélectionné le maximum de cartes de cette valeur
    const selectedCardsOfValue = playerSelectedCards.filter(
      card => card.value === value
    ).length;
    
    // Le maximum de cartes de même valeur est de 4 pour un paquet, 8 pour deux paquets
    const maxCardsOfSameValue = deckCount === 2 ? 8 : 4;
    
    if (availableCardsOfValue.length === 0 || selectedCardsOfValue >= maxCardsOfSameValue) {
      return;
    }
    
    // Sélectionner automatiquement une carte avec cette valeur (n'importe quel signe)
    const selectedCard = availableCardsOfValue[0];
    
    // Ajouter la carte à la sélection du joueur
    playerSelectedCards.push(selectedCard);
    
    // Mettre à jour les cartes sélectionnées
    setSelectedCardsByPlayer(prev => ({
      ...prev,
      [currentPlayer.id]: playerSelectedCards
    }));
    
    // Retirer la carte des cartes disponibles
    setAvailableCardsForSelection(prev => prev.filter(c => 
      !(c.suit === selectedCard.suit && c.value === selectedCard.value)
    ));
    
    // Si le joueur a sélectionné toutes ses cartes, passer au joueur suivant
    if (playerSelectedCards.length >= cardsToSelect) {
      if (currentSelectionPlayer < players.length - 1) {
        // Passer au joueur suivant
        const nextPlayer = currentSelectionPlayer + 1;
        setCurrentSelectionPlayer(nextPlayer);
        setMessage(`${players[nextPlayer].name}, sélectionnez ${cardsToSelect} cartes`);
      } else {
        // Tous les joueurs ont sélectionné leurs cartes, commencer le jeu
        startClassicGame();
      }
    }
  };
  
  // Fonction pour démarrer le jeu en mode classique après la sélection des cartes
  const startClassicGame = () => {
    // On passe à la phase de jeu
    setClassicGamePhase('play');
    
    // Récupérer toutes les cartes sélectionnées par les joueurs
    const allSelectedCards: Card[] = [];
    Object.values(selectedCardsByPlayer).forEach(cards => {
      allSelectedCards.push(...cards);
    });
    
    // Obtenir toutes les cartes disponibles (non sélectionnées)
    const availableCards = availableCardsForSelection;
    
    // Créer un tableau avec les valeurs et le nombre d'occurrences à retirer
    const cardCounts: Record<Value, number> = {
      'A': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0,
      '8': 0, '9': 0, '10': 0, 'J': 0, 'Q': 0, 'K': 0
    };
    
    // Compter les occurrences de chaque valeur de carte sélectionnée
    allSelectedCards.forEach(card => {
      cardCounts[card.value]++;
    });
    
    // Mélanger les cartes disponibles
    const shuffledAvailableCards = shuffleDeck(availableCards);
    
    // Créer la pyramide en excluant les cartes sélectionnées
    const pyramidCards: Card[][] = [];
    let cardIndex = 0;
    
    // Pour chaque niveau de la pyramide
    for (let row = 0; row < pyramidHeight; row++) {
      const rowCards: Card[] = [];
      
      // Pour chaque colonne dans ce niveau
      for (let col = 0; col <= row; col++) {
        // Trouver la prochaine carte qui n'est pas dans la liste des valeurs sélectionnées
        // ou qui a encore des occurrences disponibles
        let validCard: Card | null = null;
        
        while (cardIndex < shuffledAvailableCards.length && !validCard) {
          const currentCard = shuffledAvailableCards[cardIndex];
          
          // Si cette valeur de carte a été suffisamment sélectionnée, on peut l'utiliser
          if (cardCounts[currentCard.value] <= 0) {
            validCard = { ...currentCard, position: { row, col }, faceUp: false };
            cardIndex++;
          } else {
            // Sinon, on réduit le compteur et on passe à la carte suivante
            cardCounts[currentCard.value]--;
            cardIndex++;
          }
        }
        
        if (validCard) {
          rowCards.push(validCard);
        } else {
          // Si on manque de cartes, créer une carte vide (ne devrait pas arriver)
          console.error("Plus de cartes disponibles pour la pyramide!");
          const emptyCard: Card = {
            suit: 'hearts',
            value: 'A',
            faceUp: false,
            position: { row, col }
          };
          rowCards.push(emptyCard);
        }
      }
      
      pyramidCards.push(rowCards);
    }
    
    // Mettre à jour les états du jeu
    setPyramid(pyramidCards);
    
    // Calculer le nombre total de cartes dans la pyramide
    let totalCardCount = 0;
    for (let i = 0; i < pyramidHeight; i++) {
      totalCardCount += i + 1;
    }
    setTotalCards(totalCardCount);
    
    // Réinitialiser le compteur de cartes retournées
    setTotalCardsFlipped(0);
    
    // Définir la première carte à retourner (en bas à gauche)
    setNextCardToFlip({ row: pyramidHeight - 1, col: 0 });
    
    // Afficher un message pour commencer le jeu
    setMessage("La partie commence! Vous pouvez voir les cartes sélectionnées par chaque joueur. Retournez les cartes une par une!");
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-amber-900 to-amber-950 text-white p-4 relative">
      <div className="container mx-auto max-w-6xl" style={{ maxWidth: containerMaxWidth }}>
        {/* En-tête et message */}
        <div className="text-center mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-amber-300 mb-2">Pyramide {gameMode === 'classic' ? '- Mode Classique' : ''}</h1>
          {message && (
            <div className={`p-3 rounded-lg animate-appear ${message.includes('CUL SEC') ? 'bg-red-600/80 text-white font-bold text-lg' : 'bg-amber-800/60 text-white'}`}>
              {message}
            </div>
          )}
        </div>

        {/* Phase de sélection des cartes en mode classique */}
        {gameMode === 'classic' && classicGamePhase === 'selection' && (
          <div className="mb-6">
            <div className="grid grid-cols-1 gap-4 mb-4">
              {/* Liste des joueurs avec progression anonyme */}
              <div className="bg-amber-900/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-amber-200">Joueurs</h3>
                <div className="space-y-2">
                  {players.map((player, index) => (
                    <div 
                      key={player.id} 
                      className={`p-2 rounded-lg ${index === currentSelectionPlayer ? 'bg-amber-700/50 border border-amber-500' : 'bg-amber-800/30'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Avatar className={playerColors[index % playerColors.length]}>
                            <AvatarFallback>{player.name.charAt(0).toUpperCase()}</AvatarFallback>
                            {player.preferences?.avatar && (
                              <AvatarImage src={player.preferences.avatar} alt={player.name} />
                            )}
                          </Avatar>
                          <span className="ml-2 font-medium">{player.name}</span>
                        </div>
                        {/* Afficher uniquement la progression de la sélection, pas les cartes spécifiques */}
                        <div className="text-amber-200">
                          {selectedCardsByPlayer[player.id]?.length || 0}/{cardsToSelect} cartes
                        </div>
                      </div>
                      
                      {/* Afficher les cartes sélectionnées par le joueur */}
                      {(selectedCardsByPlayer[player.id]?.length > 0 && (index === currentSelectionPlayer || index < currentSelectionPlayer)) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedCardsByPlayer[player.id].map((card, cardIndex) => (
                            <div 
                              key={`selected-${player.id}-${cardIndex}`}
                              className="w-7 h-9 rounded border border-amber-600 bg-white text-amber-900 flex items-center justify-center"
                            >
                              <div className="text-xs font-bold">
                                {card.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Sélection des cartes - uniquement les valeurs */}
              <div className="bg-amber-900/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-amber-200">
                  Sélectionnez vos cartes
                  <span className="text-sm font-normal ml-2">
                    ({players[currentSelectionPlayer]?.name})
                  </span>
                </h3>
                
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
                  {/* Afficher uniquement les valeurs disponibles de 2 à A */}
                  {['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((value) => {
                    // Vérifier si cette valeur a encore des cartes disponibles
                    const availableCount = availableCardsForSelection.filter(
                      card => card.value === value
                    ).length;
                    
                    // Calculer un pourcentage de disponibilité pour l'indicateur visuel
                    // (basé sur la disponibilité par rapport au nombre maximal possible de 4 signes)
                    const availabilityPercent = Math.min(100, Math.max(0, (availableCount / 4) * 100));
                    
                    // Déterminer si cette valeur est sélectionnable
                    const isSelectable = availableCount > 0;
                    
                    return (
                      <button
                        key={value}
                        className={`relative h-16 rounded-md flex flex-col items-center justify-center
                          ${isSelectable ? 'hover:bg-amber-600/70 cursor-pointer' : 'opacity-40 cursor-not-allowed'}
                          bg-amber-800/60 border border-amber-700
                        `}
                        onClick={() => {
                          if (isSelectable) {
                            handleCardSelection(value as Value);
                          }
                        }}
                        disabled={!isSelectable}
                      >
                        <span className="text-xl font-bold text-amber-100">{value}</span>
                        
                        {/* Indicateur de disponibilité des cartes */}
                        <div className="w-full absolute bottom-0 left-0 right-0 h-1 bg-gray-700 rounded-b-md overflow-hidden">
                          <div 
                            className="h-full bg-green-500 transition-all duration-300"
                            style={{ width: `${availabilityPercent}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="text-center text-amber-200 text-sm">
              <p>Une fois que tous les joueurs auront sélectionné leurs cartes, une pyramide sera générée en excluant les cartes sélectionnées.</p>
              <p className="mt-2 italic">Vos cartes resteront secrètes pendant la partie - soyez stratégique dans votre sélection!</p>
            </div>
          </div>
        )}

        {/* Instructions sur mobile - placées avant la pyramide pour un meilleur flux */}
        {isMobile && !gameOver && gameMode === 'fun' && (
          <div className="flex items-center justify-center mb-4">
            <div className="bg-amber-800/40 rounded-lg p-3 text-center text-sm flex items-center">
              <ArrowDown className="mr-2 h-4 w-4 text-amber-300" />
              <span>Retournez les cartes une par une, de bas en haut</span>
            </div>
          </div>
        )}

        {/* Afficher les règles - cachées par défaut */}
        <div className={`bg-amber-900/60 p-4 rounded-lg text-amber-200 mb-4 ${showRules ? 'block' : 'hidden'}`}>
          <h3 className="text-lg font-semibold mb-2">Règles du jeu :</h3>
          <ul className="list-disc list-inside space-y-1">
            {gameMode === 'fun' ? (
              <>
                <li>Cliquez sur "Suivant" pour retourner les cartes une par une, en commençant par le bas.</li>
                <li>Pour chaque carte retournée, le joueur doit boire un nombre de gorgées égal à la valeur de la carte.</li>
                <li>As = 1 gorgée, J/V = 11, Q/D = 12, K/R = 13 gorgées.</li>
                <li>On ne peut retourner une carte que si celles situées en dessous sont déjà retournées.</li>
              </>
            ) : (
              <>
                <li>Au début, chaque joueur sélectionne {cardsToSelect} cartes (de 2 à As).</li>
                <li>Une pyramide est créée en excluant ces cartes sélectionnées.</li>
                <li>Les cartes choisies par chaque joueur sont affichées.</li>
                <li>Cliquez sur "Suivant" pour retourner les cartes une par une, en commençant par le bas.</li>
                <li>Quand une carte est retournée, les joueurs qui ont cette valeur sont indiqués.</li>
                <li>Pour une carte au niveau "CUL SEC", les joueurs concernés sont également signalés.</li>
              </>
            )}
          </ul>
        </div>

        <Button 
          onClick={() => setShowRules(!showRules)} 
          variant="outline"
          className="bg-amber-800/30 border-amber-700/50 text-amber-300 hover:bg-amber-700/50 mb-4"
        >
          {showRules ? "Cacher les règles" : "Voir les règles"}
        </Button>

        {/* Boutons de contrôle du jeu - déplacés en haut pour mobile */}
        {isMobile && (
          <div className="flex justify-between mb-4">
            <Button 
              onClick={onGameEnd}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 w-[48%]"
            >
              Retour au menu
            </Button>
            <Button 
              onClick={resetGame}
              className="bg-amber-600 hover:bg-amber-700 text-white w-[48%]"
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Nouvelle partie
            </Button>
          </div>
        )}

        {/* Conteneur principal pour la pyramide et les cartes sélectionnées */}
        {(gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="flex flex-col md:flex-row gap-4">
            {/* Affichage des cartes sélectionnées en mode classique pendant la phase de jeu - À GAUCHE sur desktop */}
            {gameMode === 'classic' && classicGamePhase === 'play' && (
              <div className="md:w-1/3 lg:w-1/4 order-2 md:order-1">
                <div className="bg-amber-900/60 p-4 rounded-lg h-full">
                  <h3 className="text-lg font-semibold mb-3 text-amber-200">Cartes sélectionnées</h3>
                  <div className="space-y-2">
                    {players.map((player, index) => {
                      // Grouper les cartes par valeur pour afficher uniquement les valeurs
                      const selectedValues: Record<Value, number> = {
                        'A': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0,
                        '8': 0, '9': 0, '10': 0, 'J': 0, 'Q': 0, 'K': 0
                      };
                      
                      // Compter le nombre de cartes par valeur
                      selectedCardsByPlayer[player.id].forEach(card => {
                        selectedValues[card.value]++;
                      });
                      
                      // Vérifier si ce joueur doit boire pour la dernière carte retournée
                      const playerMustDrink = playersWithLastCard.includes(player.id);
                      
                      return (
                        <div key={player.id} className={`bg-amber-900/40 rounded-lg p-2 transition-all duration-300 ${playerMustDrink ? 'ring-2 ring-yellow-400 shadow-lg' : ''}`}>
                          <div className="flex items-center mb-1">
                            <Avatar className={`${playerColors[index % playerColors.length]} h-8 w-8`}>
                              <AvatarFallback className="text-sm">{player.name.charAt(0).toUpperCase()}</AvatarFallback>
                              {player.preferences?.avatar && (
                                <AvatarImage src={player.preferences.avatar} alt={player.name} />
                              )}
                            </Avatar>
                            <span className={`ml-2 font-medium text-sm ${playerMustDrink ? 'text-yellow-300 font-bold' : ''}`}>{player.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {/* Au lieu d'itérer sur les valeurs uniques, générer un tableau qui contient chaque carte autant de fois qu'elle a été sélectionnée */}
                            {Object.entries(selectedValues)
                              .filter(([_, count]) => count > 0)
                              .flatMap(([value, count]) => {
                                // Répéter chaque valeur autant de fois qu'elle a été sélectionnée
                                return Array(count).fill(value as Value).map((cardValue, cardIndex) => {
                                  // Vérifier si cette valeur correspond à la dernière carte retournée
                                  const isLastFlippedValue = lastFlippedCard && pyramid[lastFlippedCard.row][lastFlippedCard.col].value === cardValue;
                                  const shouldHighlight = playerMustDrink && isLastFlippedValue;
                                  
                                  return (
                                    <div 
                                      key={`${player.id}-${value}-${cardIndex}`}
                                      className={`w-7 h-9 rounded border flex items-center justify-center transition-all duration-300
                                        ${shouldHighlight 
                                          ? 'border-2 border-yellow-500 bg-yellow-100 shadow-md shadow-yellow-500/50 scale-110 text-amber-900' 
                                          : 'border-amber-600 bg-white text-amber-900'
                                        }
                                      `}
                                    >
                                      <div className={`text-xs font-bold ${shouldHighlight ? 'text-amber-900' : ''}`}>
                                        {cardValue}
                                      </div>
                                    </div>
                                  );
                                });
                              })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                </div>
              </div>
            )}

            {/* Conteneur de la pyramide - À DROITE sur desktop */}
            <div className={`${gameMode === 'classic' && classicGamePhase === 'play' ? 'md:w-2/3 lg:w-3/4' : 'w-full'} order-1 md:order-2`}>
              <div className="bg-gradient-to-b from-amber-950/50 to-amber-900/50 rounded-xl p-2 md:p-4 mb-4 md:mb-6">
                {/* Affichage de la pyramide */}
                <div className={`space-y-1 md:space-y-2 py-2 md:py-4 relative ${isMobile ? 'overflow-x-auto' : ''}`}>
                  {pyramid.map((row, rowIndex) => (
                    <div 
                      key={rowIndex} 
                      className="flex justify-center items-center"
                      style={{ 
                        paddingLeft: `${(effectivePyramidHeight - rowIndex - 1) * (isMobile ? 0.2 : 0.5)}rem`,
                        marginBottom: isMobile ? '0.5rem' : '0.75rem'
                      }}
                    >
                      {/* Numéro du niveau */}
                      <div className={`mr-2 md:mr-4 flex items-center justify-center bg-amber-800 text-amber-200 font-bold rounded-full shadow-md ${rowIndex === 0 ? 'px-2 md:px-3 py-1 bg-red-700 text-white text-xs md:text-sm' : 'w-6 h-6 md:w-8 md:h-8'}`}>
                        {rowIndex === 0 ? "CUL SEC" : effectivePyramidHeight - rowIndex}
                      </div>
                      {row.map((card, colIndex) => (
                        <motion.div 
                          key={`${rowIndex}-${colIndex}`} 
                          className={`${cardWidth} mx-0.5 md:mx-1 rounded-lg ${card.faceUp ? 'bg-white' : 'bg-amber-700'} flex items-center justify-center shadow-xl border border-amber-600/30 transition-all duration-200 
                            ${nextCardToFlip && nextCardToFlip.row === rowIndex && nextCardToFlip.col === colIndex ? 'ring-2 ring-yellow-400' : ''}
                            ${lastFlippedCard && lastFlippedCard.row === rowIndex && lastFlippedCard.col === colIndex ? 'scale-110 ring-2 ring-green-400' : ''}
                          `}
                          animate={card.faceUp ? { rotateY: 0 } : { rotateY: 180 }}
                          transition={{ duration: 0.5 }}
                          style={{ 
                            transformStyle: 'preserve-3d',
                            perspective: '1000px'
                          }}
                        >
                          {card.faceUp ? (
                            <div className={`${cardFontSize} font-bold ${getCardColor(card.suit)}`}>
                              {card.value}
                              <span className={`${suitFontSize}`}>{getSuitSymbol(card.suit)}</span>
                            </div>
                          ) : (
                            <div className="text-amber-300 text-lg md:text-2xl" style={{ transform: 'rotateY(180deg)' }}>?</div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  ))}
                </div>
                
                {/* Barre de progression */}
                <div className="w-full bg-gray-800 rounded-full h-2 md:h-2.5 mt-2 md:mt-4">
                  <div 
                    className="bg-amber-500 h-2 md:h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${(totalCardsFlipped / totalCards) * 100}%` }}
                  ></div>
                </div>
                <div className="text-center text-xs md:text-sm text-amber-300 mt-1 md:mt-2">
                  {totalCardsFlipped} / {totalCards} cartes retournées
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bouton flottant "Suivant" - fixé en bas à droite de l'écran */}
        {(gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="fixed bottom-6 right-6 z-10">
            <Button 
              onClick={flipNextCard}
              className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-full shadow-lg"
              disabled={gameOver || !nextCardToFlip}
            >
              {gameOver ? "Terminé" : "Suivant"}
            </Button>
          </div>
        )}

        {/* Boutons de contrôle du jeu - pour desktop ou en bas pour mobile si pas déplacés en haut */}
        {!isMobile && (
          <div className="flex justify-center space-x-4 mt-6">
            <Button 
              onClick={resetGame}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Nouvelle partie
            </Button>
            <Button 
              onClick={onGameEnd}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              Retour au menu
            </Button>
          </div>
        )}
        
        {/* Affichage du récapitulatif en fin de partie */}
        {gameOver && (
          <div className="mt-6 p-4 border border-yellow-500/30 rounded-lg bg-yellow-500/10">
            <h3 className="text-xl font-bold text-yellow-400 mb-2">Partie terminée !</h3>
            <p className="text-white">Toutes les cartes ont été retournées. Vous pouvez lancer une nouvelle partie ou revenir au menu principal.</p>
          </div>
        )}
      </div>
    </div>
  )
} 