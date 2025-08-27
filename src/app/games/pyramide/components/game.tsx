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
  const [classicGamePhase, setClassicGamePhase] = useState<'prelude' | 'preludeSummary' | 'selection' | 'play'>('prelude')
  const [selectedCardsByPlayer, setSelectedCardsByPlayer] = useState<Record<string, Card[]>>({})
  const [currentSelectionPlayer, setCurrentSelectionPlayer] = useState<number>(0)
  const [availableCardsForSelection, setAvailableCardsForSelection] = useState<Card[]>([])
  const [readyToStart, setReadyToStart] = useState(false)

  // Pré-jeu (mode classique) : prédictions en 4 étapes
  type PredictionResult = {
    step: 'color' | 'higherLower' | 'insideOutside' | 'suit'
    choice: string
    card: Card
    success: boolean
  }
  const [preludeDeck, setPreludeDeck] = useState<Card[]>([])
  const [preludeCurrentPlayer, setPreludeCurrentPlayer] = useState<number>(0)
  const [preludeStep, setPreludeStep] = useState<'color' | 'higherLower' | 'insideOutside' | 'suit'>('color')
  const [preludeChoice, setPreludeChoice] = useState<string | null>(null)
  const [preludeResultsByPlayer, setPreludeResultsByPlayer] = useState<Record<string, PredictionResult[]>>({})
  const [preludeDrinksByPlayer, setPreludeDrinksByPlayer] = useState<Record<string, number>>({})
  const [preludeRevealed, setPreludeRevealed] = useState<Card[]>([])

  const rankValue = (v: Value) => (v === 'A' ? 14 : cardValues[v])

  const stepLabels: Record<PredictionResult['step'], string> = {
    color: 'couleur',
    higherLower: 'plus/moins',
    insideOutside: 'intérieur/extérieur',
    suit: 'signe',
  }

  const computePreludeTotals = (): Record<string, number> => {
    const totals: Record<string, number> = {}
    const valueToPoints = (v: Value): number => {
      if (v === 'A' || v === 'J' || v === 'Q' || v === 'K') return 10
      return parseInt(v, 10)
    }
    players.forEach(p => {
      const res = preludeResultsByPlayer[p.id] || []
      totals[p.id] = res.reduce((acc, r) => acc + valueToPoints(r.card.value), 0)
    })
    return totals
  }

  const drawPreludeCard = (): Card | null => {
    if (preludeDeck.length === 0) return null
    const [top, ...rest] = preludeDeck
    setPreludeDeck(rest)
    return top
  }

  const proceedAfterPreludeIfNeeded = () => {
    if (preludeCurrentPlayer >= players.length - 1) {
      // Tous les joueurs ont terminé le pré-jeu → attribuer des cartes et afficher un résumé avant mémorisation
      const fullDeck = shuffleDeck(createDeck(deckCount))
      const pool: Card[] = [...fullDeck]
      const assigned: Record<string, Card[]> = {}
      players.forEach(player => {
        const picks: Card[] = []
        for (let i = 0; i < cardsToSelect; i++) {
          const idx = Math.floor(Math.random() * pool.length)
          const base = pool.splice(idx, 1)[0]
          picks.push({ ...base, faceUp: false, position: { row: -1, col: -1 } })
        }
        picks.sort((a, b) => rankValue(a.value) - rankValue(b.value))
        assigned[player.id] = picks
      })
      setSelectedCardsByPlayer(assigned)
      setAvailableCardsForSelection(fullDeck)
      setClassicGamePhase('preludeSummary')
      setPreludeRevealed([])
      setMessage('Mini-jeu terminé. Affichage du résumé…')
    } else {
      // Joueur suivant
      const next = preludeCurrentPlayer + 1
      setPreludeCurrentPlayer(next)
      setPreludeStep('color')
      setPreludeChoice(null)
      setPreludeRevealed([])
      setMessage(`${players[next].name}, choisis une couleur (Rouge/Noire).`)
    }
  }

  // Calcul des points du pré-jeu (nb de réussites sur 4)
  const computePreludePoints = () => {
    const points: Record<string, number> = {}
    players.forEach(p => {
      const list = preludeResultsByPlayer[p.id] || []
      points[p.id] = list.reduce((acc, r) => acc + (r.success ? 1 : 0), 0)
    })
    const entries = Object.entries(points)
    if (entries.length === 0) return null
    let min = entries[0], max = entries[0]
    for (const e of entries) {
      if (e[1] < min[1]) min = e
      if (e[1] > max[1]) max = e
    }
    const minPlayer = players.find(p => p.id === min[0])
    const maxPlayer = players.find(p => p.id === max[0])
    return { points, min: { player: minPlayer, score: min[1] }, max: { player: maxPlayer, score: max[1] } }
  }

  const handlePreludeSelection = (choice: string) => {
    const player = players[preludeCurrentPlayer]
    if (!player) return
    setPreludeChoice(choice)
    const revealed = drawPreludeCard()
    if (!revealed) return
    setPreludeRevealed(prev => [...prev, revealed])

    let success = false
    let penalty = 0
    if (preludeStep === 'color') {
      const isRed = revealed.suit === 'hearts' || revealed.suit === 'diamonds'
      success = (choice === 'red' && isRed) || (choice === 'black' && !isRed)
      penalty = 1
    } else if (preludeStep === 'higherLower') {
      const first = preludeRevealed[0]
      if (first) {
        const cmp = rankValue(revealed.value) - rankValue(first.value)
        success = (choice === 'higher' && cmp > 0) || (choice === 'lower' && cmp < 0)
      }
      penalty = 2
    } else if (preludeStep === 'insideOutside') {
      const a = preludeRevealed[0]
      const b = preludeRevealed[1]
      if (a && b) {
        const minV = Math.min(rankValue(a.value), rankValue(b.value))
        const maxV = Math.max(rankValue(a.value), rankValue(b.value))
        const r = rankValue(revealed.value)
        const isInside = r > minV && r < maxV
        success = (choice === 'inside' && isInside) || (choice === 'outside' && !isInside)
      }
      penalty = 3
    } else if (preludeStep === 'suit') {
      success = choice === revealed.suit
      penalty = 4
    }

    setPreludeResultsByPlayer(prev => ({
      ...prev,
      [player.id]: [
        ...(prev[player.id] || []),
        { step: preludeStep, choice, card: revealed, success }
      ]
    }))

    const suitSym = getSuitSymbol(revealed.suit)
    if (!success) {
      setPreludeDrinksByPlayer(prev => ({
        ...prev,
        [player.id]: (prev[player.id] || 0) + penalty
      }))
    }
    setMessage(`${player.name}: ${revealed.value}${suitSym} — ${success ? 'Réussi' : `Raté • +${penalty} gorgée${penalty>1?'s':''}`}`)

    if (preludeStep === 'color') {
      setPreludeStep('higherLower')
      setPreludeChoice(null)
      setTimeout(() => setMessage(`${player.name}, plus ou moins que ${preludeRevealed[0]?.value || revealed.value} ?`), 250)
    } else if (preludeStep === 'higherLower') {
      setPreludeStep('insideOutside')
      setPreludeChoice(null)
      setTimeout(() => setMessage(`${player.name}, intérieur ou extérieur des deux premières cartes ?`), 250)
    } else if (preludeStep === 'insideOutside') {
      setPreludeStep('suit')
      setPreludeChoice(null)
      setTimeout(() => setMessage(`${player.name}, quel signe exact ?`), 250)
    } else {
      proceedAfterPreludeIfNeeded()
    }
  }
  
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
  // Ajuster la taille des cartes en fonction du type d'appareil (h-18 n'existe pas en Tailwind)
  const cardWidth = isMobile ? (width < 400 ? 'w-10 h-16' : 'w-12 h-20') : 'w-16 h-24';
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
      // Mode Classique - Pré-jeu de prédictions avant l'attribution des cartes
      const newDeck = createDeck(deckCount)
      const shuffledDeck = shuffleDeck(newDeck)
      setPreludeDeck(shuffledDeck)
      setAvailableCardsForSelection([]) // sera défini après le pré-jeu
      setClassicGamePhase('prelude')
      setPreludeCurrentPlayer(0)
      setPreludeStep('color')
      setPreludeChoice(null)
      setPreludeResultsByPlayer({})
      setPreludeDrinksByPlayer({})
      setReadyToStart(false)
      setCurrentSelectionPlayer(0)
      setSelectedCardsByPlayer({})
      
      // Réinitialiser états visuels
      setPyramid([])
      setRemainingCards([])
      setCurrentCard(null)
      setGameOver(false)
      setMessage(`${players[0].name}, choisis une couleur (Rouge/Noire).`)
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
      setCurrentCard(card)
      const cardValue = cardValues[card.value]
      
      // Message personnalisé en fonction du mode de jeu
      if (gameMode === 'fun') {
        // Mode Fun - ne plus afficher de phrase
        setPlayersWithLastCard([]);
      } else {
        // Mode Classique - ne plus afficher de phrase
        setPlayersWithLastCard([]);
      }
      
      // Sauvegarder la dernière carte retournée
      setLastFlippedCard({ row, col })
      
      // Vérifier si toutes les cartes ont été retournées
      if (totalCardsFlipped + 1 >= totalCards) {
        setGameOver(true)
        setNextCardToFlip(null)
        const res = computeScores()
        if (res) {
          const topName = res.max.player?.name || '—'
          const lowName = res.min.player?.name || '—'
          setMessage(`Partie terminée ! Scores calculés. Plus de points: ${topName} (${res.max.score}) • Moins de points: ${lowName} (${res.min.score})`)
        } else {
          setMessage("Partie terminée !")
        }
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

  // Calcul des points en fin de partie à partir des 4 cartes du mini-jeu
  // Règle de valeur: A,J,Q,K = 10 points; autres = valeur numérique
  const computeScores = () => {
    const valueToPoints = (v: Value): number => {
      if (v === 'A' || v === 'J' || v === 'Q' || v === 'K') return 10
      return parseInt(v, 10)
    }
    const scores: Record<string, number> = {}
    players.forEach(p => { scores[p.id] = 0 })
    players.forEach(p => {
      const results = preludeResultsByPlayer[p.id] || []
      const sum = results.reduce((acc, r) => acc + valueToPoints(r.card.value), 0)
      scores[p.id] = sum
    })
    const entries = Object.entries(scores)
    if (entries.length === 0) return null
    let min = entries[0], max = entries[0]
    for (const e of entries) {
      if (e[1] < min[1]) min = e
      if (e[1] > max[1]) max = e
    }
    const minPlayer = players.find(p => p.id === min[0])
    const maxPlayer = players.find(p => p.id === max[0])
    return { scores, min: { player: minPlayer, score: min[1] }, max: { player: maxPlayer, score: max[1] } }
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
    playerSelectedCards.push({ ...selectedCard, faceUp: false });
    
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
    setMessage("La partie commence ! Les cartes des joueurs sont cachées. Cliquez sur une carte d'un joueur pour la dévoiler quand nécessaire.");
  };

  return (
    <div className="w-full min-h-screen relative text-white">
      {/* Arrière-plan artistique */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-zinc-950 to-slate-950" />
        <div className="absolute -top-40 -left-32 h-[28rem] w-[28rem] bg-gradient-to-br from-amber-500/15 to-pink-500/10 blur-3xl" />
        <div className="absolute -bottom-48 right-0 h-[32rem] w-[32rem] bg-gradient-to-tr from-yellow-400/10 to-emerald-400/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background:radial-gradient(circle_at_20%_10%,rgba(255,255,255,.2),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,.16),transparent_40%)]" />
      </div>

      <div className="container mx-auto max-w-6xl p-4" style={{ maxWidth: containerMaxWidth }}>
        {/* En-tête */}
        <div className="mb-5 md:mb-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-4 py-3 md:px-6 md:py-5 shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300">
              Pyramide {gameMode === 'classic' ? '· Mode Classique' : ''}
            </h1>
          </div>
        </div>

        {/* Phase de pré-jeu classique: prédictions en 4 étapes */}
        {gameMode === 'classic' && classicGamePhase === 'prelude' && (
          <div className="mb-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 md:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
              <h3 className="text-xl font-bold text-amber-200 mb-2">Prédictions</h3>
              <p className="text-amber-300/90 mb-4">{players[preludeCurrentPlayer]?.name} :
                {preludeStep === 'color' && ' choisis une couleur'}
                {preludeStep === 'higherLower' && ' plus ou moins que la 1re carte'}
                {preludeStep === 'insideOutside' && ' intérieur ou extérieur des deux premières'}
                {preludeStep === 'suit' && ' choisis le signe exact'}
              </p>
              <div className="flex flex-wrap gap-2">
                {preludeStep === 'color' && (
                  <>
                    <Button onClick={() => handlePreludeSelection('red')} className="bg-rose-600 hover:bg-rose-700">Rouge</Button>
                    <Button onClick={() => handlePreludeSelection('black')} className="bg-slate-700 hover:bg-slate-800">Noire</Button>
                  </>
                )}
                {preludeStep === 'higherLower' && (
                  <>
                    <Button onClick={() => handlePreludeSelection('higher')} className="bg-emerald-600 hover:bg-emerald-700">Plus</Button>
                    <Button onClick={() => handlePreludeSelection('lower')} className="bg-amber-600 hover:bg-amber-700">Moins</Button>
                  </>
                )}
                {preludeStep === 'insideOutside' && (
                  <>
                    <Button onClick={() => handlePreludeSelection('inside')} className="bg-indigo-600 hover:bg-indigo-700">Intérieur</Button>
                    <Button onClick={() => handlePreludeSelection('outside')} className="bg-fuchsia-600 hover:bg-fuchsia-700">Extérieur</Button>
                  </>
                )}
                {preludeStep === 'suit' && (
                  <>
                    <Button onClick={() => handlePreludeSelection('hearts')} className="bg-rose-600 hover:bg-rose-700">Coeur ♥</Button>
                    <Button onClick={() => handlePreludeSelection('diamonds')} className="bg-pink-600 hover:bg-pink-700">Carreau ♦</Button>
                    <Button onClick={() => handlePreludeSelection('clubs')} className="bg-slate-700 hover:bg-slate-800">Trèfle ♣</Button>
                    <Button onClick={() => handlePreludeSelection('spades')} className="bg-slate-800 hover:bg-slate-900">Pique ♠</Button>
                  </>
                )}
              </div>

              {/* Cartes révélées du joueur courant pendant le pré-jeu */}
              <div className="mt-4 flex items-center gap-2">
                {preludeRevealed.map((c, idx) => (
                  <div key={idx} className="w-12 h-18 md:w-14 md:h-20 rounded-lg bg-white text-black border border-white/40 relative flex items-center justify-center">
                    <div className={`absolute top-1 left-1 text-[10px] md:text-xs font-black ${getCardColor(c.suit)}`}>
                      <div>{c.value}</div>
                      <div className="leading-none">{getSuitSymbol(c.suit)}</div>
                    </div>
                    <div className={`text-xl md:text-2xl font-black ${getCardColor(c.suit)}`}>{getSuitSymbol(c.suit)}</div>
                    <div className={`absolute bottom-1 right-1 rotate-180 text-[10px] md:text-xs font-black ${getCardColor(c.suit)}`}>
                      <div>{c.value}</div>
                      <div className="leading-none">{getSuitSymbol(c.suit)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
              {/* Récapitulatif gorgées du pré-jeu */}
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-amber-200/80 font-semibold mb-2">Gorgées (pré-jeu)</div>
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  {players.map(p => (
                    <li key={p.id} className="flex items-center justify-between bg-white/5 rounded px-2 py-1">
                      <span>{p.name}</span>
                      <span className="font-mono">{preludeDrinksByPlayer[p.id] || 0}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
        )}

        {/* Phase de sélection des cartes en mode classique */}
        {gameMode === 'classic' && classicGamePhase === 'selection' && (
          <div className="mb-6">
            <div className="grid grid-cols-1 gap-4 mb-4">
              {/* Liste des joueurs avec progression anonyme (ne pas afficher les valeurs choisies) */}
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
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Plus de sélection manuelle des valeurs — mémorisation uniquement */}
            </div>
            
            <div className="text-center text-amber-200 text-sm">
              <p>Chaque joueur mémorise ses cartes attribuées aléatoirement avec Voir/Cacher.</p>
              <p className="mt-2 italic">Vos cartes restent secrètes pendant toute la partie.</p>
            </div>
          </div>
        )}

        {/* Résumé du mini-jeu + pause avant mémorisation */}
        {gameMode === 'classic' && classicGamePhase === 'preludeSummary' && (
          <div className="mb-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 md:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
              <h3 className="text-xl font-bold text-amber-200 mb-3">Résumé du mini-jeu</h3>
              <div className="space-y-3">
                {(() => { const totals = computePreludeTotals(); return (
                  <ul className="space-y-2 text-sm text-white/90">
                    {players.map(p => {
                      const drinks = preludeDrinksByPlayer[p.id] || 0
                      const mistakes = (preludeResultsByPlayer[p.id] || [])
                        .filter(r => !r.success)
                        .map(r => `(${stepLabels[r.step]})`)
                      const totalPts = totals[p.id] || 0
                      return (
                        <li key={p.id} className="bg-white/5 rounded px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{p.name}</span>
                            <span className="font-mono">{drinks} gorgée{drinks>1?'s':''}</span>
                          </div>
                          <div className="flex items-center justify-between text-amber-200 mt-1">
                            <span>{mistakes.length > 0 ? `Erreurs: ${mistakes.join(', ')}` : 'Aucune erreur'}</span>
                            <span className="font-semibold text-amber-100">Total: {totalPts} pts</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) })()}
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => {
                  setClassicGamePhase('selection')
                  setCurrentSelectionPlayer(0)
                  setReadyToStart(false)
                  setMessage(`${players[0].name}, mémorise tes ${cardsToSelect} cartes. Utilise Voir/Cacher puis passe au joueur suivant.`)
                }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Suivant
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Instructions sur mobile - placées avant la pyramide pour un meilleur flux */}
        {isMobile && !gameOver && gameMode === 'fun' && (
          <div className="flex items-center justify-center mb-4">
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur px-3 py-2 text-center text-sm flex items-center gap-2 shadow-sm">
              <ArrowDown className="h-4 w-4 text-amber-300" />
              <span className="text-amber-200/90">Retournez les cartes une par une, de bas en haut</span>
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
          className="mb-4 rounded-xl border-white/10 bg-white/5 text-amber-200 hover:bg-white/10"
        >
          {showRules ? "Cacher les règles" : "Voir les règles"}
        </Button>

        {/* Overlay plein écran pour la phase de mémorisation (DA dédiée, immersive) */}
        {gameMode === 'classic' && classicGamePhase === 'selection' && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-2xl mx-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className={`${playerColors[currentSelectionPlayer % playerColors.length]} h-10 w-10 ring-2 ring-white/20`}>
                      <AvatarFallback className="text-sm">{players[currentSelectionPlayer]?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                      {players[currentSelectionPlayer]?.preferences?.avatar && (
                        <AvatarImage src={players[currentSelectionPlayer]?.preferences?.avatar} alt={players[currentSelectionPlayer]?.name} />
                      )}
                    </Avatar>
                    <div>
                      <div className="text-amber-100 font-semibold text-lg">Mémorisation</div>
                      <div className="text-white text-xl font-extrabold leading-tight">{players[currentSelectionPlayer]?.name}</div>
                      <div className="text-amber-300 text-xs">{currentSelectionPlayer + 1} / {players.length} joueur{players.length>1?'s':''}</div>
                    </div>
                  </div>
                  <div className="text-amber-200 text-sm font-medium">{cardsToSelect} cartes</div>
                </div>

                {/* Cartes en grand format, centrées */}
                <div className="grid grid-cols-5 gap-3 md:gap-4 place-items-center py-2">
                  {(selectedCardsByPlayer[players[currentSelectionPlayer]?.id] || []).map((card, idx) => (
                    <button
                      key={`mem-${idx}`}
                      onClick={() => {
                        const pid = players[currentSelectionPlayer]?.id
                        if (!pid) return
                        setSelectedCardsByPlayer(prev => ({
                          ...prev,
                          [pid]: prev[pid].map((c, i) => i === idx ? { ...c, faceUp: !c.faceUp } : c)
                        }))
                      }}
                      className={`w-16 h-24 md:w-20 md:h-28 rounded-xl border flex items-center justify-center transition-all duration-200 shadow-lg
                        ${card.faceUp ? 'bg-white text-amber-900 border-white/40 shadow-yellow-500/10' : 'border-white/10 bg-white/5 backdrop-blur text-amber-100'}
                      `}
                    >
                      <div className="text-lg md:text-xl font-extrabold">
                        {card.faceUp ? card.value : '❓'}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="mt-5 flex items-center gap-2">
                  <Button onClick={() => {
                    const pid = players[currentSelectionPlayer]?.id
                    if (!pid) return
                    setSelectedCardsByPlayer(prev => ({
                      ...prev,
                      [pid]: (prev[pid] || []).map(c => ({ ...c, faceUp: true }))
                    }))
                  }} className="bg-amber-700 hover:bg-amber-800 text-white">Voir tout</Button>
                  <Button onClick={() => {
                    const pid = players[currentSelectionPlayer]?.id
                    if (!pid) return
                    setSelectedCardsByPlayer(prev => ({
                      ...prev,
                      [pid]: (prev[pid] || []).map(c => ({ ...c, faceUp: false }))
                    }))
                  }} variant="outline" className="border-amber-600 text-amber-200">Cacher tout</Button>
                  <div className="ml-auto flex items-center gap-2">
                    <Button onClick={() => {
                      // À chaque "Suivant": recacher toutes les cartes du joueur courant
                      const pid = players[currentSelectionPlayer]?.id
                      if (pid) {
                        setSelectedCardsByPlayer(prev => ({
                          ...prev,
                          [pid]: (prev[pid] || []).map(c => ({ ...c, faceUp: false }))
                        }))
                      }
                      if (currentSelectionPlayer < players.length - 1) {
                        const next = currentSelectionPlayer + 1
                        setCurrentSelectionPlayer(next)
                        setMessage(`${players[next].name}, mémorise tes ${cardsToSelect} cartes. Utilise Voir/Cacher puis passe au joueur suivant.`)
                      } else {
                        // Dernier joueur → lancer directement la partie
                        setReadyToStart(true)
                        setClassicGamePhase('play')
                        setMessage('La partie commence ! Retournez les cartes de la pyramide.')
                        startClassicGame()
                      }
                    }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      {currentSelectionPlayer < players.length - 1 ? 'Suivant' : 'Terminer'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
        {(gameMode === 'fun' || (gameMode === 'classic' && (classicGamePhase === 'play' || classicGamePhase === 'selection'))) && (
          <div className="flex flex-col md:flex-row gap-4">
            {/* Affichage des cartes sélectionnées en mode classique pendant la phase de jeu - À GAUCHE sur desktop */}
            {gameMode === 'classic' && (
              <div className="md:w-1/3 lg:w-1/4 order-2 md:order-1">
                <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-4 h-full shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                  <h3 className="text-lg font-semibold mb-3 text-amber-200">
                    {classicGamePhase === 'selection' ? (
                      <span>
                        Mémorisation — <span className="font-bold text-amber-100">{players[currentSelectionPlayer]?.name}</span>
                      </span>
                    ) : 'Cartes des joueurs (cliquez pour dévoiler)'}
                  </h3>
                  <div className="space-y-2">
                    {players.map((player, index) => {
                      const playerMustDrink = false;
                      
                      return (
                        <div key={player.id} className={`rounded-lg p-2 transition-all duration-300 border border-white/5 bg-white/5` }>
                          <div className="flex items-center mb-1">
                            <Avatar className={`${playerColors[index % playerColors.length]} h-8 w-8 ring-2 ring-white/20`}>
                              <AvatarFallback className="text-sm">{player.name.charAt(0).toUpperCase()}</AvatarFallback>
                              {player.preferences?.avatar && (
                                <AvatarImage src={player.preferences.avatar} alt={player.name} />
                              )}
                            </Avatar>
                            <span className={`ml-2 font-medium text-sm`}>{player.name}</span>
                          </div>
                           <div className={`${classicGamePhase === 'play' ? 'grid grid-cols-4' : 'flex flex-wrap'} gap-1 p-2 rounded ${classicGamePhase === 'selection' && players[currentSelectionPlayer]?.id === player.id ? 'bg-white/5 ring-1 ring-white/10' : ''}`}>
                            {(selectedCardsByPlayer[player.id] || []).map((card, cardIndex) => {
                              const isLastFlippedValue = lastFlippedCard && pyramid[lastFlippedCard.row][lastFlippedCard.col].value === card.value;
                              const shouldHighlight = false;
                              const isCurrent = classicGamePhase === 'selection' && players[currentSelectionPlayer]?.id === player.id
                              return (
                                <button
                                  key={`${player.id}-${card.suit}-${card.value}-${cardIndex}`}
                                   className={`w-7 h-9 rounded border flex items-center justify-center transition-all duration-300
                                     ${card.faceUp
                                       ? (shouldHighlight 
                                           ? 'border-2 border-yellow-400 bg-white shadow-md shadow-yellow-400/40 scale-110 text-amber-900'
                                           : 'border-white/40 bg-white text-amber-900')
                                       : 'border-white/10 bg-white/5 text-amber-100 backdrop-blur-sm'} ${(classicGamePhase === 'selection' && !isCurrent) ? 'opacity-30 grayscale pointer-events-none' : ''}
                                  `}
                                  onClick={() => {
                                    if (classicGamePhase === 'selection' && isCurrent) {
                                      setSelectedCardsByPlayer(prev => ({
                                        ...prev,
                                        [player.id]: prev[player.id].map((c, i) => i === cardIndex ? { ...c, faceUp: !c.faceUp } : c)
                                      }))
                                    } else if (classicGamePhase === 'play') {
                                      setSelectedCardsByPlayer(prev => ({
                                        ...prev,
                                        [player.id]: prev[player.id].map((c, i) => i === cardIndex ? { ...c, faceUp: !c.faceUp } : c)
                                      }))
                                    }
                                  }}
                                >
                                  <div className="text-xs font-bold">
                                    {card.faceUp ? card.value : '❓'}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          {classicGamePhase === 'selection' && players[currentSelectionPlayer]?.id === player.id && (
                            <div className="mt-3 flex items-center gap-2">
                              <Button onClick={() => {
                                setSelectedCardsByPlayer(prev => ({
                                  ...prev,
                                  [player.id]: prev[player.id].map(c => ({ ...c, faceUp: true }))
                                }))
                              }} className="bg-amber-700 hover:bg-amber-800 text-white">Voir</Button>
                              <Button onClick={() => {
                                setSelectedCardsByPlayer(prev => ({
                                  ...prev,
                                  [player.id]: prev[player.id].map(c => ({ ...c, faceUp: false }))
                                }))
                              }} variant="outline" className="border-amber-600 text-amber-200">Cacher</Button>
                              <span className="text-xs text-amber-300 ml-2">Clique sur chaque carte pour basculer individuellement</span>
                              <Button onClick={() => {
                                if (currentSelectionPlayer < players.length - 1) {
                                  const nextPlayer = currentSelectionPlayer + 1
                                  setCurrentSelectionPlayer(nextPlayer)
                                  setMessage(`${players[nextPlayer].name}, mémorise tes ${cardsToSelect} cartes. Utilise Voir/Cacher puis passe au joueur suivant.`)
                                } else {
                                  setReadyToStart(true)
                                  setMessage('Tous les joueurs ont mémorisé. Appuyez sur « Commencer » pour afficher la pyramide.')
                                }
                              }} className="bg-emerald-600 hover:bg-emerald-700 text-white ml-auto">Suivant</Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {classicGamePhase === 'selection' && readyToStart && (
                    <div className="mt-4 flex justify-end">
                      <Button onClick={startClassicGame} className="bg-emerald-600 hover:bg-emerald-700 text-white">Commencer</Button>
                    </div>
                  )}
                  
                </div>
              </div>
            )}

            {/* Conteneur de la pyramide - À DROITE sur desktop */}
            <div className={`${gameMode === 'classic' && classicGamePhase === 'play' ? 'md:w-2/3 lg:w-3/4' : 'w-full'} order-1 md:order-2`}>
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-2 md:p-4 mb-4 md:mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                {/* Affichage de la pyramide */}
                {(gameMode === 'fun' || classicGamePhase === 'play') && (
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
                      <div className={`mr-2 md:mr-4 flex items-center justify-center rounded-full font-bold shadow-md border ${rowIndex === 0 
                        ? 'px-2 md:px-3 py-1 bg-red-700/90 border-red-400/40 text-white text-xs md:text-sm' 
                        : 'w-6 h-6 md:w-8 md:h-8 bg-white/5 border-white/10 text-amber-200'}`}>
                        {rowIndex === 0 ? "CUL SEC" : effectivePyramidHeight - rowIndex}
                      </div>
                      {row.map((card, colIndex) => (
                        <motion.div 
                          key={`${rowIndex}-${colIndex}`} 
                            className={`${cardWidth} mx-0.5 md:mx-1 rounded-lg flex items-center justify-center shadow-xl border transition-all duration-200 
                              ${card.faceUp ? 'bg-white border-white/40' : 'border-white/10 bg-white/5 backdrop-blur'}
                              ${nextCardToFlip && nextCardToFlip.row === rowIndex && nextCardToFlip.col === colIndex ? 'ring-2 ring-yellow-400/70 animate-pulse' : ''}
                              ${lastFlippedCard && lastFlippedCard.row === rowIndex && lastFlippedCard.col === colIndex ? 'scale-105 ring-2 ring-emerald-400/70' : ''}`}
                          animate={card.faceUp ? { rotateY: 0 } : { rotateY: 180 }}
                          transition={{ duration: 0.5 }}
                          style={{ 
                            transformStyle: 'preserve-3d',
                            perspective: '1000px'
                          }}
                        >
                          {card.faceUp ? (
                            <div className="relative w-full h-full px-1" >
                              {/* coin haut gauche */}
                              <div className={`absolute top-1 left-1 text-[10px] md:text-xs font-black ${getCardColor(card.suit)}`}>
                                <div>{card.value}</div>
                                <div className="leading-none">{getSuitSymbol(card.suit)}</div>
                              </div>
                              {/* centre */}
                              <div className={`absolute inset-0 flex items-center justify-center ${getCardColor(card.suit)}`}>
                                <span className="text-2xl md:text-3xl font-black opacity-90">{getSuitSymbol(card.suit)}</span>
                              </div>
                              {/* coin bas droit */}
                              <div className={`absolute bottom-1 right-1 rotate-180 text-[10px] md:text-xs font-black ${getCardColor(card.suit)}`}>
                                <div>{card.value}</div>
                                <div className="leading-none">{getSuitSymbol(card.suit)}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="relative w-full h-full rounded-lg overflow-hidden" style={{ transform: 'rotateY(180deg)' }}>
                              <div className="absolute inset-0 bg-gradient-to-br from-amber-700/80 to-amber-800/80" />
                              <div className="absolute inset-0 opacity-20 [background:repeating-linear-gradient(45deg,rgba(0,0,0,.18)_0px,rgba(0,0,0,.18)_8px,transparent_8px,transparent_16px)]" />
                              <div className="absolute inset-0 rounded-lg ring-1 ring-black/20" />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  ))}
                </div>
                )}
                
                {/* Barre de progression */}
                {(gameMode === 'fun' || classicGamePhase === 'play') && (
                <div className="w-full mt-2 md:mt-4">
                  <div className="relative w-full bg-white/5 border border-white/10 rounded-full h-2.5 md:h-3 overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.45)] transition-all duration-500" 
                      style={{ width: `${(totalCardsFlipped / totalCards) * 100}%` }}
                    />
                  </div>
                </div>
                )}
                <div className="text-center text-xs md:text-sm text-amber-200/80 mt-1 md:mt-2">
                  {(gameMode === 'fun' || classicGamePhase === 'play') 
                    ? `${totalCardsFlipped} / ${totalCards} cartes retournées` 
                    : 'En attente du démarrage de la partie'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bandeau de message/status supprimé à la demande (évite les phrases superflues) */}

        {/* Carte actuelle affichée au-dessus du bouton Suivant (désactivée sur mobile pour ne pas gêner l'affichage) */}
        {!isMobile && (gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && currentCard && (
          <div className="fixed bottom-24 right-6 z-10">
            <div className="rounded-xl border border-white/10 bg-white/10 backdrop-blur px-4 py-2 shadow-lg">
              <div className="text-[11px] uppercase tracking-wide text-amber-200/80">Carte actuelle</div>
              <div className={`${cardFontSize} font-extrabold leading-none`}>
                <span className={`${getCardColor(currentCard.suit)}`}>{currentCard.value}</span>
                <span className={`ml-1 ${suitFontSize}`}>{getSuitSymbol(currentCard.suit)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Barre basse: compteur + bouton Suivant (centrés et non bloquants pour l'UI au-dessus) */}
        {(gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="fixed bottom-0 inset-x-0 z-10">
            <div className="mx-auto max-w-6xl p-3 pb-[calc(env(safe-area-inset-bottom,0)+0.5rem)]">
              <div className="flex justify-center items-center gap-3">
                <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs md:text-sm text-amber-200/90 font-semibold flex items-center gap-1">
                  {currentCard ? (
                    <>
                      <span className={`${cardFontSize} leading-none`}>{currentCard.value}</span>
                      <span className={`${suitFontSize} leading-none ${getCardColor(currentCard.suit)}`}>{getSuitSymbol(currentCard.suit)}</span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <Button 
                  onClick={flipNextCard}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-6 py-3 rounded-full shadow-[0_10px_30px_rgba(245,158,11,0.3)]"
                  disabled={gameOver || !nextCardToFlip}
                >
                  {gameOver ? "Terminé" : "Suivant"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Boutons de contrôle du jeu - pour desktop ou en bas pour mobile si pas déplacés en haut */}
        {!isMobile && (
          <div className="flex justify-center space-x-4 mt-6">
            <Button 
              onClick={resetGame}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-[0_10px_30px_rgba(245,158,11,0.25)]"
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
        
        {/* Affichage du récapitulatif en fin de partie (uniquement en mode sans cartes/classique) */}
        {gameOver && gameMode === 'classic' && (
          <div className="mt-6 p-4 border border-yellow-500/30 rounded-lg bg-yellow-500/10">
            <h3 className="text-xl font-bold text-yellow-400 mb-2">Résumé de la partie</h3>
            {(() => {
              const res = computeScores()
              if (!res) return <p className="text-white">Aucun score disponible.</p>
              const topName = res.max.player?.name || '—'
              const lowName = res.min.player?.name || '—'
              return (
                <div className="space-y-3">
                  <div className="text-amber-100">Plus de points: <span className="font-semibold">{topName}</span> ({res.max.score})</div>
                  <div className="text-amber-100">Moins de points: <span className="font-semibold">{lowName}</span> ({res.min.score})</div>
                  <div className="mt-4">
                    <div className="text-amber-200 font-semibold mb-1">Pour la traversée</div>
                    <div className="text-amber-100">Plus de points: <span className="font-semibold">{topName}</span> ({res.max.score})</div>
                    <div className="text-amber-100">Moins de points: <span className="font-semibold">{lowName}</span> ({res.min.score})</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-amber-200 font-semibold mb-1">Détail des scores</div>
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-white/90">
                      {players.map(p => (
                        <li key={p.id} className="bg-amber-900/40 rounded px-2 py-1 flex items-center justify-between">
                          <span>{p.name}</span>
                          <span className="font-mono">{(computeScores()?.scores[p.id] ?? 0)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
} 