/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { RotateCcw, ArrowDown } from 'lucide-react'
import useScreenSize from '@/hooks/useScreenSize'
import { Player as BasePlayer } from '@/lib/players'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'

// ── Helpers partagés ─────────────────────────────────────────────────────────

/** Convertit A/J/Q/K en 10 pts, sinon valeur numérique */
const valueToPoints = (v: string): number => {
  if (v === 'A' || v === 'J' || v === 'Q' || v === 'K') return 10
  return parseInt(v, 10)
}

/** Composant Avatar réutilisable */
function PlayerAvatar({ player, size = 'md' }: { player: BasePlayer; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-sm' : size === 'lg' ? 'h-11 w-11 text-xl' : 'h-8 w-8 text-base'
  return (
    <PlayerIcon player={player} size={size} className={cn(sizeClass, 'shrink-0')} />
  )
}

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
  const t = useTranslations('games.pyramide')
  const [pyramid, setPyramid] = useState<Card[][]>([])
  const [gameOver, setGameOver] = useState(false)
  const [preludeMessage, setPreludeMessage] = useState('')
  const [nextCardToFlip, setNextCardToFlip] = useState<{row: number, col: number} | null>(null)
  const [lastFlippedCard, setLastFlippedCard] = useState<{row: number, col: number} | null>(null)
  const [totalCardsFlipped, setTotalCardsFlipped] = useState(0)
  const [totalCards, setTotalCards] = useState(0)
  const [currentCard, setCurrentCard] = useState<Card | null>(null)
  const [gameStarted, setGameStarted] = useState(false)
  const [isCardFlipping, setIsCardFlipping] = useState(false)
  const { isMobile, width, isLandscape } = useScreenSize()

  // États mode classique
  const [classicGamePhase, setClassicGamePhase] = useState<'prelude' | 'preludeSummary' | 'selection' | 'play'>('prelude')
  const [selectedCardsByPlayer, setSelectedCardsByPlayer] = useState<Record<string, Card[]>>({})
  const [currentSelectionPlayer, setCurrentSelectionPlayer] = useState<number>(0)
  const [availableCardsForSelection, setAvailableCardsForSelection] = useState<Card[]>([])
  const [readyToStart, setReadyToStart] = useState(false)

  // Pré-jeu : prédictions en 4 étapes
  type PredictionResult = {
    step: 'color' | 'higherLower' | 'insideOutside' | 'suit'
    choice: string
    card: Card
    success: boolean
  }
  const [preludeDeck, setPreludeDeck] = useState<Card[]>([])
  const [preludeCurrentPlayer, setPreludeCurrentPlayer] = useState<number>(0)
  const [preludeStep, setPreludeStep] = useState<'color' | 'higherLower' | 'insideOutside' | 'suit'>('color')
  const [preludeResultsByPlayer, setPreludeResultsByPlayer] = useState<Record<string, PredictionResult[]>>({})
  const [preludeDrinksByPlayer, setPreludeDrinksByPlayer] = useState<Record<string, number>>({})
  const [preludeRevealed, setPreludeRevealed] = useState<Card[]>([])

  const rankValue = (v: Value) => (v === 'A' ? 14 : cardValues[v])

  const computePreludeTotals = (): Record<string, number> => {
    const totals: Record<string, number> = {}
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
    } else {
      const next = preludeCurrentPlayer + 1
      setPreludeCurrentPlayer(next)
      setPreludeStep('color')
      setPreludeRevealed([])
    }
  }

  const handlePreludeSelection = (choice: string) => {
    const player = players[preludeCurrentPlayer]
    if (!player) return
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
    setPreludeMessage(t('preludeResult', {
      name: player.name,
      card: `${revealed.value}${suitSym}`,
      result: success ? t('preludeSuccess') : t('preludeFail', { count: penalty }),
    }))

    if (preludeStep === 'color') {
      setPreludeStep('higherLower')
    } else if (preludeStep === 'higherLower') {
      setPreludeStep('insideOutside')
    } else if (preludeStep === 'insideOutside') {
      setPreludeStep('suit')
    } else {
      proceedAfterPreludeIfNeeded()
    }
  }
  

  // ── Taille des cartes ────────────────────────────────────────────────────
  // Réduire la taille pour les ordinateurs
  const containerMaxWidth = isMobile ? "100%" : "900px";
  // Ajuster la taille des cartes : en paysage mobile = plus d'espace, cartes plus grandes
  const cardWidth = isMobile 
    ? (isLandscape ? 'w-14 h-20' : (width < 400 ? 'w-10 h-16' : 'w-12 h-20'))
    : 'w-16 h-24';
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
      
      setPyramid(pyramidCards)
      setCurrentCard(null)
      setGameOver(false)
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
      setAvailableCardsForSelection([])
      setClassicGamePhase('prelude')
      setPreludeCurrentPlayer(0)
      setPreludeStep('color')
      setPreludeResultsByPlayer({})
      setPreludeDrinksByPlayer({})
      setPreludeMessage('')
      setReadyToStart(false)
      setCurrentSelectionPlayer(0)
      setSelectedCardsByPlayer({})
      setPyramid([])
      setCurrentCard(null)
      setGameOver(false)
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
    const pyramidCards: Card[][] = [];
    let deckIndex = 0;
    
    for (let row = 0; row < rows; row++) {
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
    
    // Mettre à jour la pyramide pour retourner la carte
    const updatedPyramid = [...pyramid]
    const { row, col } = nextCardToFlip
    
    if (updatedPyramid[row] && updatedPyramid[row][col]) {
      updatedPyramid[row][col].faceUp = true
      setPyramid(updatedPyramid)
      
      // Mettre à jour le compteur de cartes retournées
      setTotalCardsFlipped(prev => prev + 1)
      const card = updatedPyramid[row][col]
      setCurrentCard(card)
      setLastFlippedCard({ row, col })
      
      // Vérifier si toutes les cartes ont été retournées
      if (totalCardsFlipped + 1 >= totalCards) {
        setGameOver(true)
        setNextCardToFlip(null)
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

  const computeScores = () => {
    const scores: Record<string, number> = {}
    players.forEach(p => {
      const results = preludeResultsByPlayer[p.id] || []
      scores[p.id] = results.reduce((acc, r) => acc + valueToPoints(r.card.value), 0)
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
    
    // Pour chaque niveau de la pyramide - toujours utiliser la hauteur sélectionnée par l'utilisateur
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
    
  };

  return (
    <div className="w-full min-h-screen relative text-white">
      {/* Arrière-plan */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#07060b]" />
        <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-amber-600/12 blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[30rem] w-[30rem] rounded-full bg-orange-600/10 blur-[110px]" />
      </div>

      <div className={`container mx-auto max-w-6xl pb-24 ${isMobile ? 'p-2' : 'p-4'}`} style={{ maxWidth: containerMaxWidth }}>
        {/* En-tête */}
        <div className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.45)] ${isMobile ? 'mb-2 px-3 py-2' : 'mb-5 md:mb-6 px-4 py-3 md:px-6 md:py-4'}`}>
          <div className="flex items-center justify-between gap-2">
            <h1 className={`font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 ${isMobile ? 'text-lg pl-10' : 'text-2xl sm:text-3xl'}`}>
              🔺 {t('title')}{gameMode === 'classic' ? ` ${t('game.titleClassic')}` : ''}
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={resetGame}
                className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-amber-300/60 transition hover:bg-white/10 hover:text-amber-300"
                aria-label={t('game.newGameAria')}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={onGameEnd}
                className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-white/40 transition hover:bg-white/10 hover:text-white/70"
                aria-label={t('game.backAria')}
              >
                <ArrowDown className="h-4 w-4 rotate-90" />
              </button>
            </div>
          </div>
        </div>

        {/* Phase de pré-jeu classique: prédictions en 4 étapes */}
        {gameMode === 'classic' && classicGamePhase === 'prelude' && (
          <div className="mb-6 space-y-3">
            <div className="rounded-2xl border border-amber-800/20 bg-amber-950/20 backdrop-blur p-4 md:p-5">
              {/* Joueur courant */}
              <div className="flex items-center gap-3 mb-4">
                {(() => {
                  const p = players[preludeCurrentPlayer]
                  return p ? (
                    <>
                      <PlayerAvatar player={p} size="md" />
                      <div>
                        <p className="text-xs text-amber-400/70 uppercase tracking-wide">{t('game.predictions')}</p>
                        <p className={cn('font-bold text-white', isSpecialPlayer(p) && getSpecialEffectClass(p))}>{p.name}</p>
                      </div>
                    </>
                  ) : null
                })()}
                <div className="ml-auto flex gap-1">
                  {(['color','higherLower','insideOutside','suit'] as const).map((s, i) => (
                    <div key={s} className={cn('h-2 w-2 rounded-full transition-all', 
                      preludeStep === s ? 'bg-amber-400' :
                      (['color','higherLower','insideOutside','suit'].indexOf(preludeStep) > i) ? 'bg-amber-600' : 'bg-white/10'
                    )} />
                  ))}
                </div>
              </div>

              {/* Question */}
              <p className="mb-3 text-sm text-amber-200/80">
                {preludeStep === 'color' && t('game.questions.color')}
                {preludeStep === 'higherLower' && t('game.questions.higherLower', { value: preludeRevealed[0]?.value ?? '?' })}
                {preludeStep === 'insideOutside' && t('game.questions.insideOutside')}
                {preludeStep === 'suit' && t('game.questions.suit')}
              </p>

              <div className="flex flex-wrap gap-2">
                {preludeStep === 'color' && (
                  <>
                    <button onClick={() => handlePreludeSelection('red')} className="flex-1 rounded-xl bg-gradient-to-br from-rose-600 to-red-700 border border-rose-500/40 py-3 font-semibold text-white hover:from-rose-500 active:scale-95">{t('game.choices.red')}</button>
                    <button onClick={() => handlePreludeSelection('black')} className="flex-1 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-500/40 py-3 font-semibold text-white hover:from-zinc-600 active:scale-95">{t('game.choices.black')}</button>
                  </>
                )}
                {preludeStep === 'higherLower' && (
                  <>
                    <button onClick={() => handlePreludeSelection('higher')} className="flex-1 rounded-xl bg-gradient-to-br from-emerald-600 to-green-700 border border-emerald-500/40 py-3 font-semibold text-white hover:from-emerald-500 active:scale-95">{t('game.choices.higher')}</button>
                    <button onClick={() => handlePreludeSelection('lower')} className="flex-1 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 border border-amber-500/40 py-3 font-semibold text-white hover:from-amber-500 active:scale-95">{t('game.choices.lower')}</button>
                  </>
                )}
                {preludeStep === 'insideOutside' && (
                  <>
                    <button onClick={() => handlePreludeSelection('inside')} className="flex-1 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 border border-indigo-500/40 py-3 font-semibold text-white hover:from-indigo-500 active:scale-95">{t('game.choices.inside')}</button>
                    <button onClick={() => handlePreludeSelection('outside')} className="flex-1 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-700 border border-fuchsia-500/40 py-3 font-semibold text-white hover:from-fuchsia-500 active:scale-95">{t('game.choices.outside')}</button>
                  </>
                )}
                {preludeStep === 'suit' && (
                  <div className="grid grid-cols-2 gap-2 w-full">
                    {([['hearts','choices.hearts','from-rose-600 to-red-700','border-rose-500/40'],['diamonds','choices.diamonds','from-pink-600 to-rose-700','border-pink-500/40'],['clubs','choices.clubs','from-zinc-600 to-zinc-800','border-zinc-500/40'],['spades','choices.spades','from-slate-700 to-slate-900','border-slate-500/40']] as const).map(([suit, labelKey, grad, border]) => (
                      <button key={suit} onClick={() => handlePreludeSelection(suit)} className={`rounded-xl bg-gradient-to-br ${grad} border ${border} py-3 font-semibold text-white hover:brightness-110 active:scale-95`}>
                        {t(`game.${labelKey}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cartes révélées */}
              {preludeRevealed.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  {preludeRevealed.map((c, idx) => (
                    <div key={idx} className="relative flex h-20 w-14 flex-col items-center justify-center rounded-xl border-2 border-white/20 bg-white shadow-lg">
                      <div className={`absolute top-1 left-1 text-[9px] font-black leading-none ${getCardColor(c.suit)}`}>
                        <div>{c.value}</div><div>{getSuitSymbol(c.suit)}</div>
                      </div>
                      <div className={`text-2xl font-black ${getCardColor(c.suit)}`}>{getSuitSymbol(c.suit)}</div>
                      <div className={`absolute bottom-1 right-1 rotate-180 text-[9px] font-black leading-none ${getCardColor(c.suit)}`}>
                        <div>{c.value}</div><div>{getSuitSymbol(c.suit)}</div>
                      </div>
                    </div>
                  ))}
                  {preludeMessage && (
                    <p
                      role="status"
                      aria-live="polite"
                      className={cn('ml-2 text-sm font-semibold', preludeMessage.includes('✓') ? 'text-emerald-400' : 'text-red-400')}
                    >
                      {preludeMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Récapitulatif gorgées du pré-jeu */}
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/60 mb-2">{t('game.preludeDrinks')}</p>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {players.map(p => {
                  const drinks = preludeDrinksByPlayer[p.id] || 0
                  return (
                    <li key={p.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.04] px-2.5 py-1.5">
                      <span className="text-white/70 truncate">{p.name}</span>
                      <span className={cn('font-bold ml-2', drinks > 0 ? 'text-red-400' : 'text-white/30')}>{drinks}🍺</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}


        {/* Résumé du mini-jeu + pause avant mémorisation */}
        {gameMode === 'classic' && classicGamePhase === 'preludeSummary' && (
          <div className="mb-6">
            <div className="rounded-2xl border border-amber-800/20 bg-amber-950/20 backdrop-blur p-4 md:p-5">
              <h3 className="text-lg font-extrabold text-amber-200 mb-4">{t('game.preludeSummaryTitle')}</h3>
              {(() => {
                const totals = computePreludeTotals()
                return (
                  <ul className="space-y-2">
                    {players.map(p => {
                      const drinks = preludeDrinksByPlayer[p.id] || 0
                      const mistakes = (preludeResultsByPlayer[p.id] || []).filter(r => !r.success).map(r => t(`stepLabels.${r.step}`))
                      const totalPts = totals[p.id] || 0
                      return (
                        <li key={p.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2.5">
                          <PlayerAvatar player={p} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-sm">{p.name}</span>
                              <span className={cn('text-sm font-bold', drinks > 0 ? 'text-red-400' : 'text-emerald-400')}>{drinks > 0 ? `${drinks}🍺` : '✓'}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-xs text-white/40">{mistakes.length > 0 ? t('game.mistakes', { list: mistakes.join(', ') }) : t('game.noMistakes')}</span>
                              <span className="text-xs font-semibold text-amber-300">{t('game.points', { pts: totalPts })}</span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              })()}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => {
                    setClassicGamePhase('selection')
                    setCurrentSelectionPlayer(0)
                    setReadyToStart(false)
                  }}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:from-amber-400 hover:to-orange-500"
                >
                  {t('game.memorizationContinue')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message : tourner en paysage sur mobile portrait */}
        {isMobile && !isLandscape && !gameOver && (gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="flex items-center justify-center mb-3 p-3 rounded-xl border border-amber-500/50 bg-amber-500/20 backdrop-blur">
            <div className="flex items-center gap-2 text-amber-200 text-sm">
              <span className="text-lg">📱</span>
              <span className="font-medium" dangerouslySetInnerHTML={{ __html: t.raw('game.landscapeHint') as string }} />
            </div>
          </div>
        )}
        {/* Instructions sur mobile paysage */}
        {isMobile && isLandscape && !gameOver && (gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="flex items-center justify-center mb-2">
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur px-3 py-1.5 text-center text-xs flex items-center gap-2 shadow-sm">
              <ArrowDown className="h-3 w-3 text-amber-300" />
              <span className="text-amber-200/90">{t('game.scrollHint')}</span>
            </div>
          </div>
        )}

        {/* Overlay mémorisation */}
        {gameMode === 'classic' && classicGamePhase === 'selection' && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-amber-800/20 bg-[#0d0b06] shadow-2xl">
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const p = players[currentSelectionPlayer]
                      return p ? (
                        <>
                          <PlayerAvatar player={p} size="lg" />
                          <div>
                            <p className="text-xs text-amber-400/70 uppercase tracking-wide">{t('game.memorization')}</p>
                            <p className={cn('font-extrabold text-white text-lg leading-tight', isSpecialPlayer(p) && getSpecialEffectClass(p))}>{p.name}</p>
                            <p className="text-xs text-amber-300/70">{currentSelectionPlayer + 1} / {players.length}</p>
                          </div>
                        </>
                      ) : null
                    })()}
                  </div>
                  <span className="text-sm text-amber-200/60 font-medium">{t('page.cardsCount', { n: cardsToSelect })}</span>
                </div>

                <div className={cn('grid place-items-center py-2 gap-3', cardsToSelect === 5 ? 'grid-cols-5' : 'grid-cols-4')}>
                  {(selectedCardsByPlayer[players[currentSelectionPlayer]?.id] || []).map((card, idx) => (
                    <button
                      key={`mem-${idx}`}
                      aria-label={card.faceUp ? t('game.hideCardAria', { value: card.value, suit: getSuitSymbol(card.suit) }) : t('game.revealCardAria', { n: idx + 1 })}
                      aria-pressed={card.faceUp}
                      onClick={() => {
                        const pid = players[currentSelectionPlayer]?.id
                        if (!pid) return
                        setSelectedCardsByPlayer(prev => ({ ...prev, [pid]: prev[pid].map((c, i) => i === idx ? { ...c, faceUp: !c.faceUp } : c) }))
                      }}
                      className={cn(
                        'h-24 w-16 md:h-28 md:w-20 rounded-xl border flex items-center justify-center transition-all duration-200 shadow-lg active:scale-95',
                        card.faceUp ? 'bg-white border-white/40' : 'border-amber-800/30 bg-amber-950/40 text-amber-200'
                      )}
                    >
                      {card.faceUp ? (
                        <div className="relative w-full h-full">
                          <div className={`absolute top-1 left-1 text-[9px] font-black ${getCardColor(card.suit)}`}>
                            <div>{card.value}</div><div>{getSuitSymbol(card.suit)}</div>
                          </div>
                          <div className={`absolute inset-0 flex items-center justify-center text-2xl font-black ${getCardColor(card.suit)}`}>{getSuitSymbol(card.suit)}</div>
                          <div className={`absolute bottom-1 right-1 rotate-180 text-[9px] font-black ${getCardColor(card.suit)}`}>
                            <div>{card.value}</div><div>{getSuitSymbol(card.suit)}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xl">❓</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <button
                    onClick={() => {
                      const pid = players[currentSelectionPlayer]?.id
                      if (!pid) return
                      setSelectedCardsByPlayer(prev => ({ ...prev, [pid]: (prev[pid] || []).map(c => ({ ...c, faceUp: true })) }))
                    }}
                    className="rounded-xl bg-amber-700/60 border border-amber-600/40 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-700/80"
                  >{t('game.seeAll')}</button>
                  <button
                    onClick={() => {
                      const pid = players[currentSelectionPlayer]?.id
                      if (!pid) return
                      setSelectedCardsByPlayer(prev => ({ ...prev, [pid]: (prev[pid] || []).map(c => ({ ...c, faceUp: false })) }))
                    }}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/60 hover:bg-white/[0.08]"
                  >{t('game.hideAll')}</button>
                  <button
                    onClick={() => {
                      const pid = players[currentSelectionPlayer]?.id
                      if (pid) setSelectedCardsByPlayer(prev => ({ ...prev, [pid]: (prev[pid] || []).map(c => ({ ...c, faceUp: false })) }))
                      if (currentSelectionPlayer < players.length - 1) {
                        setCurrentSelectionPlayer(prev => prev + 1)
                      } else {
                        setReadyToStart(true)
                        startClassicGame()
                      }
                    }}
                    className="ml-auto rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2 text-sm font-bold text-white hover:from-amber-400 hover:to-orange-500"
                  >
                    {currentSelectionPlayer < players.length - 1 ? t('game.nextPlayer') : t('game.start')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Conteneur principal */}
        {(gameMode === 'fun' || (gameMode === 'classic' && (classicGamePhase === 'play' || classicGamePhase === 'selection'))) && (
          <div className="flex flex-col gap-3">

            {/* ── Plateau ──────────────────────────────────────────────── */}
            <div className="w-full min-w-0">
              <div
                className={cn(
                  'relative overflow-hidden rounded-2xl border border-amber-800/20 shadow-[0_20px_60px_rgba(0,0,0,0.6)]',
                  isMobile ? 'mb-2 p-2' : 'mb-4 md:mb-6 p-3 md:p-5'
                )}
                style={{ background: 'radial-gradient(ellipse at 50% -10%, rgba(180,100,8,0.18) 0%, #07060b 60%)' }}
              >
                {/* Texture subtile */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background:repeating-linear-gradient(60deg,rgba(255,255,255,.15)_0px,rgba(255,255,255,.15)_1px,transparent_1px,transparent_28px)]" />

                {/* Pyramide */}
                {(gameMode === 'fun' || classicGamePhase === 'play') && (
                  <div
                    className={cn('relative py-2 md:py-4', isMobile ? 'overflow-x-auto overflow-y-auto scroll-smooth' : '')}
                    style={isMobile ? { minWidth: 'min-content', WebkitOverflowScrolling: 'touch', maxHeight: isLandscape ? '55vh' : undefined } : undefined}
                  >
                    {pyramid.map((row, rowIndex) => {
                      const isTopRow = rowIndex === 0
                      return (
                        <div
                          key={rowIndex}
                          className="flex justify-center items-center shrink-0"
                          style={{
                            paddingLeft: `${Math.max(0, (pyramid.length - rowIndex - 1) * (isMobile ? 0.2 : 0.5))}rem`,
                            marginBottom: isMobile ? '0.4rem' : '0.6rem'
                          }}
                        >
                          {/* Badge de rangée */}
                          <div className={cn(
                            'mr-2 md:mr-3 flex shrink-0 items-center justify-center rounded-lg font-bold',
                            isTopRow
                              ? 'border border-red-500/40 bg-red-600/20 px-1.5 py-0.5 text-[9px] md:text-[11px] text-red-300'
                              : 'h-5 w-5 md:h-7 md:w-7 border border-amber-700/30 bg-amber-900/20 text-[10px] md:text-xs text-amber-400'
                          )}>
                            {isTopRow ? '🔥' : pyramid.length - rowIndex}
                          </div>

                          {row.map((card, colIndex) => {
                            const isNext = !!(nextCardToFlip && nextCardToFlip.row === rowIndex && nextCardToFlip.col === colIndex)
                            const isLast = !!(lastFlippedCard && lastFlippedCard.row === rowIndex && lastFlippedCard.col === colIndex)
                            const isRed = card.suit === 'hearts' || card.suit === 'diamonds'

                            return (
                              <motion.div
                                key={`${rowIndex}-${colIndex}`}
                                className={cn(
                                  cardWidth, 'mx-0.5 md:mx-1 rounded-xl flex items-center justify-center shadow-xl border transition-all duration-200',
                                  card.faceUp
                                    ? cn('bg-white', isRed ? 'border-red-300/60' : 'border-gray-700/40')
                                    : 'border-amber-800/30 bg-transparent',
                                  isNext && !card.faceUp && 'shadow-[0_0_16px_rgba(245,158,11,0.5)] border-amber-400/60',
                                  isLast && 'scale-105 shadow-[0_0_20px_rgba(52,211,153,0.35)] border-emerald-400/50'
                                )}
                                animate={card.faceUp ? { rotateY: 0 } : { rotateY: 180 }}
                                transition={{ duration: 0.45, ease: 'easeOut' }}
                                style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
                              >
                                {card.faceUp ? (
                                  /* Face */
                                  <div className="relative w-full h-full px-0.5">
                                    <div className={cn('absolute top-0.5 left-1 text-[9px] md:text-[11px] font-black leading-tight', getCardColor(card.suit))}>
                                      <div>{card.value}</div>
                                      <div className="leading-none">{getSuitSymbol(card.suit)}</div>
                                    </div>
                                    <div className={cn('absolute inset-0 flex items-center justify-center', getCardColor(card.suit))}>
                                      <span className={cn(isMobile ? 'text-xl' : 'text-2xl md:text-3xl', 'font-black opacity-80')}>{getSuitSymbol(card.suit)}</span>
                                    </div>
                                    <div className={cn('absolute bottom-0.5 right-1 rotate-180 text-[9px] md:text-[11px] font-black leading-tight', getCardColor(card.suit))}>
                                      <div>{card.value}</div>
                                      <div className="leading-none">{getSuitSymbol(card.suit)}</div>
                                    </div>
                                  </div>
                                ) : (
                                  /* Dos */
                                  <div className="relative w-full h-full rounded-xl overflow-hidden" style={{ transform: 'rotateY(180deg)' }}>
                                    {/* Fond dégradé or/amber */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900" />
                                    {/* Motif losanges */}
                                    <div className="absolute inset-0 opacity-15 [background:repeating-linear-gradient(45deg,rgba(0,0,0,.25)_0px,rgba(0,0,0,.25)_3px,transparent_3px,transparent_14px),repeating-linear-gradient(-45deg,rgba(0,0,0,.25)_0px,rgba(0,0,0,.25)_3px,transparent_3px,transparent_14px)]" />
                                    {/* Bordure intérieure */}
                                    <div className="absolute inset-[3px] rounded-lg border border-amber-400/20" />
                                    {/* Ornement central */}
                                    <div className="absolute inset-0 flex items-center justify-center text-amber-300/30 font-black" style={{ fontSize: isMobile ? '14px' : '18px' }}>🔺</div>
                                    {/* Glow si prochaine carte */}
                                    {isNext && <div className="absolute inset-0 bg-amber-400/10 animate-pulse" />}
                                  </div>
                                )}
                              </motion.div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Barre de progression */}
                {(gameMode === 'fun' || classicGamePhase === 'play') && totalCards > 0 && (
                  <div className="mt-3 md:mt-5 space-y-1.5">
                    <div
                      role="progressbar"
                      aria-valuenow={totalCardsFlipped}
                      aria-valuemin={0}
                      aria-valuemax={totalCards}
                      aria-label={t('game.progressAria', { flipped: totalCardsFlipped, total: totalCards })}
                      className="relative w-full overflow-hidden rounded-full bg-white/[0.05] border border-white/[0.08] h-2 md:h-2.5"
                    >
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 shadow-[0_0_16px_rgba(245,158,11,0.5)] transition-all duration-500"
                        style={{ width: `${(totalCardsFlipped / totalCards) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-amber-400/70">{totalCardsFlipped} / {totalCards}</span>
                      {currentCard && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-white/70">
                          {t('game.lastCard')}
                          <span className={cn('text-sm font-black', getCardColor(currentCard.suit))}>{currentCard.value}{getSuitSymbol(currentCard.suit)}</span>
                        </span>
                      )}
                      <span className="text-[11px] text-amber-400/70">{Math.round((totalCardsFlipped / totalCards) * 100)}%</span>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* ── Cartes des joueurs (mode classique) ───────────────────── */}
            {gameMode === 'classic' && classicGamePhase === 'play' && (
              <div className="rounded-2xl border border-amber-800/20 p-3 md:p-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(120,60,5,0.12) 0%, #07060b 70%)' }}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">{t('game.playerCards')}</p>
                <div className="flex flex-wrap gap-3">
                  {players.map((player) => {
                    const cards = selectedCardsByPlayer[player.id] || []
                    if (cards.length === 0) return null
                    return (
                      <div key={player.id} className="flex items-center gap-2">
                        <span className={cn('text-xs font-semibold text-white/80 shrink-0', isSpecialPlayer(player) && getSpecialEffectClass(player))}>
                          {player.name}
                        </span>
                        <div className="flex gap-1">
                          {cards.map((card, cardIndex) => {
                            const isLastFlippedValue = !!(lastFlippedCard && pyramid[lastFlippedCard.row]?.[lastFlippedCard.col]?.value === card.value)
                            const isRed = card.suit === 'hearts' || card.suit === 'diamonds'
                            return (
                              <button
                                key={`${player.id}-${card.suit}-${card.value}-${cardIndex}`}
                                aria-label={card.faceUp ? t('game.hidePlayerCardAria', { value: card.value, suit: getSuitSymbol(card.suit), player: player.name }) : t('game.revealPlayerCardAria', { n: cardIndex + 1, player: player.name })}
                                aria-pressed={card.faceUp}
                                onClick={() => setSelectedCardsByPlayer(prev => ({ ...prev, [player.id]: prev[player.id].map((c, i) => i === cardIndex ? { ...c, faceUp: !c.faceUp } : c) }))}
                                className={cn(
                                  'flex h-10 w-7 items-center justify-center rounded-lg border transition-all duration-200 active:scale-95',
                                  card.faceUp
                                    ? cn('bg-white shadow-md', isLastFlippedValue ? 'border-2 border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110' : isRed ? 'border-red-300/60' : 'border-gray-600/40')
                                    : 'border-amber-800/25 bg-amber-950/30 text-amber-300/50'
                                )}
                              >
                                {card.faceUp ? (
                                  <div className={cn('text-[10px] font-black leading-none text-center', getCardColor(card.suit))}>
                                    <div>{card.value}</div>
                                    <div>{getSuitSymbol(card.suit)}</div>
                                  </div>
                                ) : (
                                  <span className="text-[10px]">🔺</span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Barre fixe bas — bouton Suivant (toutes tailles d'écran) */}
        {(gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#07060b] via-[#07060b]/95 to-transparent backdrop-blur-sm">
            <div className="mx-auto max-w-2xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-3">
                {/* Carte actuelle */}
                <div className="shrink-0 w-14">
                  {currentCard ? (
                    <div className="relative flex h-20 w-14 flex-col items-center justify-center rounded-xl border-2 bg-white shadow-lg"
                      style={{ borderColor: (currentCard.suit === 'hearts' || currentCard.suit === 'diamonds') ? 'rgba(248,113,113,0.7)' : 'rgba(100,100,100,0.4)' }}
                    >
                      <div className={cn('absolute top-1 left-1 text-[9px] font-black leading-none', getCardColor(currentCard.suit))}>
                        <div>{currentCard.value}</div>
                        <div>{getSuitSymbol(currentCard.suit)}</div>
                      </div>
                      <div className={cn('text-2xl font-black', getCardColor(currentCard.suit))}>{getSuitSymbol(currentCard.suit)}</div>
                      <div className={cn('absolute bottom-1 right-1 rotate-180 text-[9px] font-black leading-none', getCardColor(currentCard.suit))}>
                        <div>{currentCard.value}</div>
                        <div>{getSuitSymbol(currentCard.suit)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-20 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/20 text-xs text-center leading-tight">
                      {t('game.noCard')}
                    </div>
                  )}
                </div>
                <button
                  onClick={flipNextCard}
                  disabled={gameOver || !nextCardToFlip || isCardFlipping}
                  aria-label={gameOver ? t('game.gameOverAria') : isCardFlipping ? t('game.flippingAria') : t('game.flipNextAria')}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white py-3.5 rounded-2xl font-bold text-base shadow-[0_8px_24px_rgba(245,158,11,0.35)] [touch-action:manipulation] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 transition-transform"
                >
                  {gameOver ? t('game.finished') : t('game.next')}
                </button>
              </div>
            </div>
          </div>
        )}

        
        {/* Région aria-live : annonces lecteur d'écran */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {gameOver ? t('game.gameOverLive') : currentCard ? t('game.cardRevealedLive', { value: currentCard.value, suit: getSuitSymbol(currentCard.suit) }) : ''}
        </div>

        {/* Écran de fin mode classique */}
        {gameOver && gameMode === 'classic' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/20 bg-[#0d0b06] p-6 shadow-2xl">
              <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(ellipse at 50% 0%, #f59e0b, transparent 70%)' }} />
              <div className="relative space-y-4">
                <div className="text-center">
                  <div className="text-4xl mb-2">🏆</div>
                  <h3 className="text-xl font-extrabold text-amber-300">{t('game.gameFinished')}</h3>
                </div>
                {(() => {
                  const res = computeScores()
                  if (!res) return null
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-center">
                          <p className="text-[10px] text-amber-400/60 uppercase tracking-wide mb-1">{t('game.mostPoints')}</p>
                          <p className="font-extrabold text-amber-300">{res.max.player?.name}</p>
                          <p className="text-2xl font-black text-amber-200">{res.max.score}</p>
                        </div>
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-center">
                          <p className="text-[10px] text-red-400/60 uppercase tracking-wide mb-1">{t('game.leastPoints')}</p>
                          <p className="font-extrabold text-red-300">{res.min.player?.name}</p>
                          <p className="text-2xl font-black text-red-200">{res.min.score}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">{t('game.fullScores')}</p>
                        <ul className="grid grid-cols-2 gap-1.5">
                          {players.map(p => {
                            const score = res.scores[p.id] ?? 0
                            return (
                              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.04] px-2.5 py-1.5">
                                <PlayerAvatar player={p} size="sm" />
                                <span className="text-xs text-white/75 truncate flex-1">{p.name}</span>
                                <span className="text-xs font-bold text-amber-300">{score}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </>
                  )
                })()}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={resetGame}
                    className="flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 text-sm font-bold text-white hover:from-amber-400 hover:to-orange-500"
                  >
                    {t('game.replay')}
                  </button>
                  <button
                    onClick={onGameEnd}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.05] py-3 text-sm text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    {t('game.menu')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 