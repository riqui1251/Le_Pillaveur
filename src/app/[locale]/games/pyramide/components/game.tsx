"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { RotateCcw, ArrowDown } from 'lucide-react'
import useScreenSize from '@/hooks/useScreenSize'
import { Player as BasePlayer } from '@/lib/players'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'
import {
  type Card,
  type Suit,
  type PreludeStep,
  type PreludeResult,
  rankValue,
  createDeck,
  shuffleDeck,
  createPyramid,
  totalCardsForHeight,
  findNextCardToFlip as findNextCardToFlipPure,
  evaluatePreludeChoice,
  computeTotalsByPlayer,
  computeScoreSummary,
  buildClassicPyramid,
} from '@/lib/pyramide/engine'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import type { GameSuit } from '@/lib/games'
import { usePlayers } from '@/hooks/usePlayers'

// ── Helpers partagés ─────────────────────────────────────────────────────────

/** Composant Avatar réutilisable */
function PlayerAvatar({ player, size = 'md' }: { player: BasePlayer; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-sm' : size === 'lg' ? 'h-11 w-11 text-xl' : 'h-8 w-8 text-base'
  return (
    <PlayerIcon player={player} size={size} className={cn(sizeClass, 'shrink-0')} />
  )
}

const GAME_SUIT: Record<Suit, GameSuit> = {
  hearts: 'heart',
  diamonds: 'diamond',
  clubs: 'club',
  spades: 'spade',
}

const isRedSuit = (suit: Suit) => suit === 'hearts' || suit === 'diamonds'

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
  pyramidHeight: number
  gameMode: 'fun' | 'classic'
  deckCount: 1 | 2
  cardsToSelect: 4 | 5
}

// Reprise de partie : c'est le jeu local le plus long (30 à 45 min), donc celui
// qui souffrait le plus d'un swipe retour. Tout l'état est du JSON pur (cartes,
// prédictions, compteurs) : rien à reconstruire, il suffit de le relire.
const SAVE_ID = 'pyramide'
const SAVE_VERSION = 1

type PyramideSave = {
  /** Une sauvegarde faite avec d'autres réglages n'est pas rejouable telle quelle. */
  setup: { gameMode: 'fun' | 'classic'; pyramidHeight: number; deckCount: 1 | 2; cardsToSelect: 4 | 5 }
  playerIds: string[]
  pyramid: Card[][]
  gameOver: boolean
  nextCardToFlip: { row: number; col: number } | null
  lastFlippedCard: { row: number; col: number } | null
  totalCardsFlipped: number
  totalCards: number
  currentCard: Card | null
  classicGamePhase: 'prelude' | 'preludeSummary' | 'selection' | 'play'
  selectedCardsByPlayer: Record<string, Card[]>
  currentSelectionPlayer: number
  availableCardsForSelection: Card[]
  readyToStart: boolean
  preludeDeck: Card[]
  preludeCurrentPlayer: number
  preludeStep: PreludeStep
  preludeResultsByPlayer: Record<string, PreludeResult[]>
  preludeDrinksByPlayer: Record<string, number>
  preludeRevealed: Card[]
  preludeMessage: string
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
  const [preludeDeck, setPreludeDeck] = useState<Card[]>([])
  const [preludeCurrentPlayer, setPreludeCurrentPlayer] = useState<number>(0)
  const [preludeStep, setPreludeStep] = useState<PreludeStep>('color')
  const [preludeResultsByPlayer, setPreludeResultsByPlayer] = useState<Record<string, PreludeResult[]>>({})
  const [preludeDrinksByPlayer, setPreludeDrinksByPlayer] = useState<Record<string, number>>({})
  const [preludeRevealed, setPreludeRevealed] = useState<Card[]>([])
  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<PyramideSave>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  const { updatePlayerStats } = usePlayers()

  const computePreludeTotals = (): Record<string, number> =>
    computeTotalsByPlayer(players.map(p => p.id), preludeResultsByPlayer)

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

    const { success, penalty } = evaluatePreludeChoice(preludeStep, choice, revealed, preludeRevealed)

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
      setTotalCards(totalCardsForHeight(pyramidHeight))

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

  // Effect pour initialiser le jeu au montage du composant — mais jamais tant
  // qu'une reprise est proposée : le joueur doit pouvoir dire non.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    initializeGame()
    setStarted(true)
  }, [session.ready, session.pending, started, initializeGame]);

  // Sauvegarde continue tant que la pyramide n'est pas retournée entièrement.
  useEffect(() => {
    if (!started || !gameStarted || gameOver) return
    session.save({
      setup: { gameMode, pyramidHeight, deckCount, cardsToSelect },
      playerIds: players.map(p => p.id),
      pyramid,
      gameOver,
      nextCardToFlip,
      lastFlippedCard,
      totalCardsFlipped,
      totalCards,
      currentCard,
      classicGamePhase,
      selectedCardsByPlayer,
      currentSelectionPlayer,
      availableCardsForSelection,
      readyToStart,
      preludeDeck,
      preludeCurrentPlayer,
      preludeStep,
      preludeResultsByPlayer,
      preludeDrinksByPlayer,
      preludeRevealed,
      preludeMessage,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameStarted, gameOver, pyramid, nextCardToFlip, lastFlippedCard, totalCardsFlipped,
      totalCards, currentCard, classicGamePhase, selectedCardsByPlayer, currentSelectionPlayer,
      availableCardsForSelection, readyToStart, preludeDeck, preludeCurrentPlayer, preludeStep,
      preludeResultsByPlayer, preludeDrinksByPlayer, preludeRevealed, preludeMessage]);

  /** Évite de compter deux fois la même partie. */
  const gameCountedRef = useRef(false)

  // Fin de partie : on crédite une partie jouée à chaque joueur et on efface la
  // sauvegarde — une partie terminée ne doit rien laisser derrière elle.
  useEffect(() => {
    if (!gameOver) {
      gameCountedRef.current = false
      return
    }
    if (!gameStarted || gameCountedRef.current) return
    gameCountedRef.current = true
    players.forEach(p => {
      try {
        updatePlayerStats(p.id, 'pyramide', { gamesPlayed: 1 })
      } catch (error) {
        console.error('Erreur lors du comptage de la partie:', error)
      }
    })
    session.clear()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver, gameStarted]);

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Réglages ou table différents : la sauvegarde ne correspond plus à ce qui
    // vient d'être demandé, on repart sur une partie neuve.
    const sameSetup =
      saved.setup.gameMode === gameMode &&
      saved.setup.pyramidHeight === pyramidHeight &&
      saved.setup.deckCount === deckCount &&
      saved.setup.cardsToSelect === cardsToSelect &&
      isSameLocalTable(saved.playerIds, players)
    if (!sameSetup) {
      session.discard()
      return
    }
    setPyramid(saved.pyramid)
    setGameOver(saved.gameOver)
    setNextCardToFlip(saved.nextCardToFlip)
    setLastFlippedCard(saved.lastFlippedCard)
    setTotalCardsFlipped(saved.totalCardsFlipped)
    setTotalCards(saved.totalCards)
    setCurrentCard(saved.currentCard)
    setClassicGamePhase(saved.classicGamePhase)
    setSelectedCardsByPlayer(saved.selectedCardsByPlayer)
    setCurrentSelectionPlayer(saved.currentSelectionPlayer)
    setAvailableCardsForSelection(saved.availableCardsForSelection)
    setReadyToStart(saved.readyToStart)
    setPreludeDeck(saved.preludeDeck)
    setPreludeCurrentPlayer(saved.preludeCurrentPlayer)
    setPreludeStep(saved.preludeStep)
    setPreludeResultsByPlayer(saved.preludeResultsByPlayer)
    setPreludeDrinksByPlayer(saved.preludeDrinksByPlayer)
    setPreludeRevealed(saved.preludeRevealed)
    setPreludeMessage(saved.preludeMessage)
    setIsCardFlipping(false)
    setGameStarted(true)
    setStarted(true)
  }

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
    setNextCardToFlip(findNextCardToFlipPure(currentPyramid, currentRow, currentCol))
  }

  const computeScores = () => {
    const summary = computeScoreSummary(players.map(p => p.id), preludeResultsByPlayer)
    if (!summary) return null
    const minPlayer = players.find(p => p.id === summary.minPlayerId)
    const maxPlayer = players.find(p => p.id === summary.maxPlayerId)
    return {
      scores: summary.scores,
      min: { player: minPlayer, score: summary.minScore },
      max: { player: maxPlayer, score: summary.maxScore }
    }
  }

  // Obtenir la couleur de la carte en fonction de sa couleur
  const getCardColor = (suit: Suit): string => {
    return isRedSuit(suit) ? 'text-suit-red' : 'text-[#24201A]'
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
    session.clear()
    gameCountedRef.current = false
    setStarted(true)
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

    // Construire la pyramide en excluant les valeurs déjà mémorisées
    const pyramidCards = buildClassicPyramid(availableCardsForSelection, allSelectedCards, pyramidHeight);

    // Mettre à jour les états du jeu
    setPyramid(pyramidCards);

    // Calculer le nombre total de cartes dans la pyramide
    setTotalCards(totalCardsForHeight(pyramidHeight));

    // Réinitialiser le compteur de cartes retournées
    setTotalCardsFlipped(0);

    // Définir la première carte à retourner (en bas à gauche)
    setNextCardToFlip({ row: pyramidHeight - 1, col: 0 });
  };

  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />

  return (
    <div className="w-full relative text-cream">
      <div className={`container mx-auto max-w-6xl pb-24 ${isMobile ? 'p-2' : 'p-4'}`} style={{ maxWidth: containerMaxWidth }}>
        {/* En-tête */}
        <div className={`rounded-2xl border border-gold/20 bg-felt-deep/90 backdrop-blur-xl ${isMobile ? 'mb-2 px-3 py-2' : 'mb-5 md:mb-6 px-4 py-3 md:px-6 md:py-4'}`}>
          <div className="flex items-center justify-between gap-2">
            <h1 className={`font-display font-bold text-gold ${isMobile ? 'text-lg pl-10' : 'text-2xl sm:text-3xl'}`}>
              {t('title')}{gameMode === 'classic' ? ` ${t('game.titleClassic')}` : ''}
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={resetGame}
                className="rounded-xl border border-gold/20 bg-black/20 p-2 text-cream/70 transition hover:text-gold"
                aria-label={t('game.newGameAria')}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={onGameEnd}
                className="rounded-xl border border-gold/20 bg-black/20 p-2 text-cream/70 transition hover:text-gold"
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
            <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-4 md:p-5">
              {/* Joueur courant */}
              <div className="flex items-center gap-3 mb-4">
                {(() => {
                  const p = players[preludeCurrentPlayer]
                  return p ? (
                    <>
                      <PlayerAvatar player={p} size="md" />
                      <div>
                        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.predictions')}</p>
                        <p className={cn('font-display font-bold text-cream', isSpecialPlayer(p) && getSpecialEffectClass(p))}>{p.name}</p>
                      </div>
                    </>
                  ) : null
                })()}
                <div className="ml-auto flex gap-1">
                  {(['color','higherLower','insideOutside','suit'] as const).map((s, i) => (
                    <div key={s} className={cn('h-2 w-2 rounded-full transition-all',
                      preludeStep === s ? 'bg-gold' :
                      (['color','higherLower','insideOutside','suit'].indexOf(preludeStep) > i) ? 'bg-gold/50' : 'bg-black/30'
                    )} />
                  ))}
                </div>
              </div>

              {/* Question */}
              <p className="mb-3 text-sm text-cream/80">
                {preludeStep === 'color' && t('game.questions.color')}
                {preludeStep === 'higherLower' && t('game.questions.higherLower', { value: preludeRevealed[0]?.value ?? '?' })}
                {preludeStep === 'insideOutside' && t('game.questions.insideOutside')}
                {preludeStep === 'suit' && t('game.questions.suit')}
              </p>

              <div className="flex flex-wrap gap-2">
                {preludeStep === 'color' && (
                  <>
                    <button onClick={() => handlePreludeSelection('red')} className="flex-1 rounded-xl border border-gold/20 bg-black/20 py-3 font-semibold text-red-300 transition hover:border-gold/60 hover:bg-gold/[0.15] active:scale-95">{t('game.choices.red')}</button>
                    <button onClick={() => handlePreludeSelection('black')} className="flex-1 rounded-xl border border-gold/20 bg-black/20 py-3 font-semibold text-cream transition hover:border-gold/60 hover:bg-gold/[0.15] active:scale-95">{t('game.choices.black')}</button>
                  </>
                )}
                {preludeStep === 'higherLower' && (
                  <>
                    <button onClick={() => handlePreludeSelection('higher')} className="flex-1 rounded-xl border border-gold/20 bg-black/20 py-3 font-semibold text-cream transition hover:border-gold/60 hover:bg-gold/[0.15] active:scale-95">{t('game.choices.higher')}</button>
                    <button onClick={() => handlePreludeSelection('lower')} className="flex-1 rounded-xl border border-gold/20 bg-black/20 py-3 font-semibold text-cream transition hover:border-gold/60 hover:bg-gold/[0.15] active:scale-95">{t('game.choices.lower')}</button>
                  </>
                )}
                {preludeStep === 'insideOutside' && (
                  <>
                    <button onClick={() => handlePreludeSelection('inside')} className="flex-1 rounded-xl border border-gold/20 bg-black/20 py-3 font-semibold text-cream transition hover:border-gold/60 hover:bg-gold/[0.15] active:scale-95">{t('game.choices.inside')}</button>
                    <button onClick={() => handlePreludeSelection('outside')} className="flex-1 rounded-xl border border-gold/20 bg-black/20 py-3 font-semibold text-cream transition hover:border-gold/60 hover:bg-gold/[0.15] active:scale-95">{t('game.choices.outside')}</button>
                  </>
                )}
                {preludeStep === 'suit' && (
                  <div className="grid grid-cols-2 gap-2 w-full">
                    {([['hearts','choices.hearts','text-red-300'],['diamonds','choices.diamonds','text-red-300'],['clubs','choices.clubs','text-cream'],['spades','choices.spades','text-cream']] as const).map(([suit, labelKey, tone]) => (
                      <button key={suit} onClick={() => handlePreludeSelection(suit)} className={`rounded-xl border border-gold/20 bg-black/20 py-3 font-semibold ${tone} transition hover:border-gold/60 hover:bg-gold/[0.15] active:scale-95`}>
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
                    <PlayingCard key={idx} suit={GAME_SUIT[c.suit]} rank={c.value} className="flex h-20 w-14 items-center justify-center">
                      <span className={`text-2xl font-bold ${getCardColor(c.suit)}`}>{getSuitSymbol(c.suit)}</span>
                    </PlayingCard>
                  ))}
                  {preludeMessage && (
                    <p
                      role="status"
                      aria-live="polite"
                      className={cn('ml-2 text-sm font-semibold', preludeMessage.includes('✓') ? 'text-emerald-300' : 'text-red-300')}
                    >
                      {preludeMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Récapitulatif gorgées du pré-jeu */}
            <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75 mb-2">{t('game.preludeDrinks')}</p>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {players.map(p => {
                  const drinks = preludeDrinksByPlayer[p.id] || 0
                  return (
                    <li key={p.id} className="flex items-center justify-between rounded-xl border border-gold/20 bg-black/20 px-2.5 py-1.5">
                      <span className="text-cream/70 truncate">{p.name}</span>
                      <span className={cn('font-bold ml-2', drinks > 0 ? 'text-red-300' : 'text-cream/50')}>{drinks}🍺</span>
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
            <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-4 md:p-5">
              <h3 className="font-display text-lg font-bold text-cream mb-4">{t('game.preludeSummaryTitle')}</h3>
              {(() => {
                const totals = computePreludeTotals()
                return (
                  <ul className="space-y-2">
                    {players.map(p => {
                      const drinks = preludeDrinksByPlayer[p.id] || 0
                      const mistakes = (preludeResultsByPlayer[p.id] || []).filter(r => !r.success).map(r => t(`stepLabels.${r.step}`))
                      const totalPts = totals[p.id] || 0
                      return (
                        <li key={p.id} className="flex items-start gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
                          <PlayerAvatar player={p} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-cream text-sm">{p.name}</span>
                              <span className={cn('text-sm font-bold', drinks > 0 ? 'text-red-300' : 'text-emerald-300')}>{drinks > 0 ? `${drinks}🍺` : '✓'}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-xs text-cream/60">{mistakes.length > 0 ? t('game.mistakes', { list: mistakes.join(', ') }) : t('game.noMistakes')}</span>
                              <span className="font-display text-xs font-semibold text-gold">{t('game.points', { pts: totalPts })}</span>
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
                  className="rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
                >
                  {t('game.memorizationContinue')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message : tourner en paysage sur mobile portrait */}
        {isMobile && !isLandscape && !gameOver && (gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="flex items-center justify-center mb-3 p-3 rounded-xl border border-gold/30 bg-gold/10">
            <div className="flex items-center gap-2 text-cream/80 text-sm">
              <span className="font-medium" dangerouslySetInnerHTML={{ __html: t.raw('game.landscapeHint') as string }} />
            </div>
          </div>
        )}
        {/* Instructions sur mobile paysage */}
        {isMobile && isLandscape && !gameOver && (gameMode === 'fun' || (gameMode === 'classic' && classicGamePhase === 'play')) && (
          <div className="flex items-center justify-center mb-2">
            <div className="rounded-xl border border-gold/20 bg-black/20 px-3 py-1.5 text-center text-xs flex items-center gap-2">
              <ArrowDown className="h-3 w-3 text-gold" />
              <span className="text-cream/70">{t('game.scrollHint')}</span>
            </div>
          </div>
        )}

        {/* Overlay mémorisation */}
        {gameMode === 'classic' && classicGamePhase === 'selection' && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl">
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const p = players[currentSelectionPlayer]
                      return p ? (
                        <>
                          <PlayerAvatar player={p} size="lg" />
                          <div>
                            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.memorization')}</p>
                            <p className={cn('font-display font-bold text-cream text-lg leading-tight', isSpecialPlayer(p) && getSpecialEffectClass(p))}>{p.name}</p>
                            <p className="font-display text-xs text-gold">{currentSelectionPlayer + 1} / {players.length}</p>
                          </div>
                        </>
                      ) : null
                    })()}
                  </div>
                  <span className="rounded-lg border border-gold/30 bg-gold/10 px-2 py-0.5 text-sm font-medium text-gold">{t('page.cardsCount', { n: cardsToSelect })}</span>
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
                        'h-24 w-16 md:h-28 md:w-20 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95'
                      )}
                    >
                      {card.faceUp ? (
                        <PlayingCard suit={GAME_SUIT[card.suit]} rank={card.value} className="flex h-full w-full items-center justify-center">
                          <span className={`text-2xl font-bold ${getCardColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
                        </PlayingCard>
                      ) : (
                        <PlayingCardBack className="h-full w-full" />
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
                    className="rounded-2xl border border-gold/25 bg-black/20 px-4 py-2 text-sm font-semibold text-cream/80 hover:bg-black/30 hover:text-cream"
                  >{t('game.seeAll')}</button>
                  <button
                    onClick={() => {
                      const pid = players[currentSelectionPlayer]?.id
                      if (!pid) return
                      setSelectedCardsByPlayer(prev => ({ ...prev, [pid]: (prev[pid] || []).map(c => ({ ...c, faceUp: false })) }))
                    }}
                    className="rounded-2xl border border-gold/25 bg-black/20 px-4 py-2 text-sm font-semibold text-cream/80 hover:bg-black/30 hover:text-cream"
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
                    className="ml-auto rounded-2xl bg-amber-500 px-5 py-2 text-sm font-bold text-black shadow-none hover:bg-amber-400"
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
                  'relative overflow-hidden rounded-2xl border border-gold/15 bg-felt-deep/70',
                  isMobile ? 'mb-2 p-2' : 'mb-4 md:mb-6 p-3 md:p-5'
                )}
              >
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
                              ? 'border border-suit-red/40 bg-suit-red/20 px-1.5 py-0.5 text-[11px] text-cream'
                              : 'h-5 w-5 md:h-7 md:w-7 border border-gold/30 bg-gold/10 font-display text-[10px] md:text-xs text-gold'
                          )}>
                            {isTopRow ? '🔥' : pyramid.length - rowIndex}
                          </div>

                          {row.map((card, colIndex) => {
                            const isNext = !!(nextCardToFlip && nextCardToFlip.row === rowIndex && nextCardToFlip.col === colIndex)
                            const isLast = !!(lastFlippedCard && lastFlippedCard.row === rowIndex && lastFlippedCard.col === colIndex)

                            return (
                              <motion.div
                                key={`${rowIndex}-${colIndex}`}
                                className={cn(
                                  cardWidth, 'mx-0.5 md:mx-1 rounded-xl flex items-center justify-center transition-all duration-200',
                                  isNext && !card.faceUp && 'ring-2 ring-gold',
                                  isLast && 'scale-105 ring-2 ring-gold/60'
                                )}
                                animate={card.faceUp ? { rotateY: 0 } : { rotateY: 180 }}
                                transition={{ duration: 0.45, ease: 'easeOut' }}
                                style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
                              >
                                {card.faceUp ? (
                                  <PlayingCard suit={GAME_SUIT[card.suit]} rank={card.value} className="flex h-full w-full items-center justify-center">
                                    <span className={cn(isMobile ? 'text-xl' : 'text-2xl md:text-3xl', 'font-black opacity-80', getCardColor(card.suit))}>{getSuitSymbol(card.suit)}</span>
                                  </PlayingCard>
                                ) : (
                                  <div className="relative w-full h-full rounded-xl" style={{ transform: 'rotateY(180deg)' }}>
                                    <PlayingCardBack className="h-full w-full" />
                                    {isNext && <div className="absolute inset-0 rounded-xl bg-gold/10 animate-pulse" />}
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
                      className="relative w-full overflow-hidden rounded-full bg-black/30 h-2 md:h-2.5"
                    >
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-gold transition-all duration-500"
                        style={{ width: `${(totalCardsFlipped / totalCards) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[11px] text-gold/70">{totalCardsFlipped} / {totalCards}</span>
                      {currentCard && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-cream/70">
                          {t('game.lastCard')}
                          <span className={cn('text-sm font-black', isRedSuit(currentCard.suit) ? 'text-red-300' : 'text-cream')}>{currentCard.value}{getSuitSymbol(currentCard.suit)}</span>
                        </span>
                      )}
                      <span className="font-display text-[11px] text-gold/70">{Math.round((totalCardsFlipped / totalCards) * 100)}%</span>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* ── Cartes des joueurs (mode classique) ───────────────────── */}
            {gameMode === 'classic' && classicGamePhase === 'play' && (
              <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-3 md:p-4">
                <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.playerCards')}</p>
                <div className="flex flex-wrap gap-3">
                  {players.map((player) => {
                    const cards = selectedCardsByPlayer[player.id] || []
                    if (cards.length === 0) return null
                    return (
                      <div key={player.id} className="flex items-center gap-2">
                        <span className={cn('text-xs font-semibold text-cream/80 shrink-0', isSpecialPlayer(player) && getSpecialEffectClass(player))}>
                          {player.name}
                        </span>
                        <div className="flex gap-1">
                          {cards.map((card, cardIndex) => {
                            const isLastFlippedValue = !!(lastFlippedCard && pyramid[lastFlippedCard.row]?.[lastFlippedCard.col]?.value === card.value)
                            return (
                              <button
                                key={`${player.id}-${card.suit}-${card.value}-${cardIndex}`}
                                aria-label={card.faceUp ? t('game.hidePlayerCardAria', { value: card.value, suit: getSuitSymbol(card.suit), player: player.name }) : t('game.revealPlayerCardAria', { n: cardIndex + 1, player: player.name })}
                                aria-pressed={card.faceUp}
                                onClick={() => setSelectedCardsByPlayer(prev => ({ ...prev, [player.id]: prev[player.id].map((c, i) => i === cardIndex ? { ...c, faceUp: !c.faceUp } : c) }))}
                                className={cn(
                                  'flex h-10 w-7 items-center justify-center rounded-xl transition-all duration-200 active:scale-95',
                                  card.faceUp && isLastFlippedValue && 'ring-2 ring-gold scale-110'
                                )}
                              >
                                {card.faceUp ? (
                                  <PlayingCard corners={false} className="flex h-full w-full items-center justify-center">
                                    <div className={cn('text-[10px] font-black leading-none text-center', getCardColor(card.suit))}>
                                      <div>{card.value}</div>
                                      <div>{getSuitSymbol(card.suit)}</div>
                                    </div>
                                  </PlayingCard>
                                ) : (
                                  <PlayingCardBack className="h-full w-full" />
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
          <div className="fixed bottom-0 inset-x-0 z-20 border-t border-gold/[0.15] bg-felt-deep/95 backdrop-blur-md">
            <div className="mx-auto max-w-2xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-3">
                {/* Carte actuelle */}
                <div className="shrink-0 w-14">
                  {currentCard ? (
                    <PlayingCard suit={GAME_SUIT[currentCard.suit]} rank={currentCard.value} className="flex h-20 w-14 items-center justify-center">
                      <span className={cn('text-2xl font-black', getCardColor(currentCard.suit))}>{getSuitSymbol(currentCard.suit)}</span>
                    </PlayingCard>
                  ) : (
                    <div className="flex h-20 w-14 items-center justify-center rounded-xl border border-gold/20 bg-black/20 text-cream/50 text-xs text-center leading-tight">
                      {t('game.noCard')}
                    </div>
                  )}
                </div>
                <button
                  onClick={flipNextCard}
                  disabled={gameOver || !nextCardToFlip || isCardFlipping}
                  aria-label={gameOver ? t('game.gameOverAria') : isCardFlipping ? t('game.flippingAria') : t('game.flipNextAria')}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-black py-3.5 rounded-2xl font-bold text-base shadow-none [touch-action:manipulation] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 transition-transform"
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
          <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4 bg-black/70 backdrop-blur-sm">
            {/* Défilable, carte centrée par my-auto (et non items-center) : avec
                l'avis de première partie, la carte peut dépasser un petit écran,
                et un contenu centré qui déborde perdait son haut ET ses boutons. */}
            <div className="relative my-auto w-full max-w-md overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep p-6 text-cream shadow-2xl">
              <div className="relative space-y-4">
                <div className="text-center">
                  <h3 className="font-display text-xl font-bold text-gold">{t('game.gameFinished')}</h3>
                </div>
                {(() => {
                  const res = computeScores()
                  if (!res) return null
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-gold/30 bg-gold/10 p-3 text-center">
                          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75 mb-1">{t('game.mostPoints')}</p>
                          <p className="font-display font-bold text-cream">{res.max.player?.name}</p>
                          <p className="font-display text-2xl font-bold text-gold">{res.max.score}</p>
                        </div>
                        <div className="rounded-2xl border border-suit-red/30 bg-suit-red/[0.15] p-3 text-center">
                          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-red-300 mb-1">{t('game.leastPoints')}</p>
                          <p className="font-display font-bold text-cream">{res.min.player?.name}</p>
                          <p className="font-display text-2xl font-bold text-red-300">{res.min.score}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gold/[0.15] bg-black/20 p-3">
                        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75 mb-2">{t('game.fullScores')}</p>
                        <ul className="grid grid-cols-2 gap-1.5">
                          {players.map(p => {
                            const score = res.scores[p.id] ?? 0
                            return (
                              <li key={p.id} className="flex items-center gap-2 rounded-xl border border-gold/20 bg-black/20 px-2.5 py-1.5">
                                <PlayerAvatar player={p} size="sm" />
                                <span className="text-xs text-cream/70 truncate flex-1">{p.name}</span>
                                <span className="font-display text-xs font-bold text-gold">{score}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </>
                  )
                })()}
                <FirstGameFeedbackCard mode="local" gameId="pyramide" />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={resetGame}
                    className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-black shadow-none hover:bg-amber-400"
                  >
                    {t('game.replay')}
                  </button>
                  <button
                    onClick={onGameEnd}
                    className="flex-1 rounded-2xl border border-gold/25 bg-black/20 py-3 text-sm font-semibold text-cream/80 hover:bg-black/30 hover:text-cream"
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