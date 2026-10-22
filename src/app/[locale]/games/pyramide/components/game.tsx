"use client"

import { useState, useEffect, useCallback, useRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  FoldHorizontal,
  RotateCcw,
  UnfoldHorizontal,
} from 'lucide-react'
import { Player as BasePlayer } from '@/lib/players'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { EndActionDock } from '@/components/game/EndActionDock'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'
import {
  type Card,
  type Suit,
  type PreludeStep,
  type PreludeResult,
  PRELUDE_PENALTY,
  rankValue,
  createDeck,
  shuffleDeck,
  createPyramid,
  totalCardsForHeight,
  findNextCardToFlip as findNextCardToFlipPure,
  evaluatePreludeChoice,
  computeTotalsByPlayer,
  computeScoreSummary,
  computeFunTally,
  buildClassicPyramid,
  floorOfRow,
  funFlipperIndex,
  stakeOfRow,
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

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

const isRedSuit = (suit: Suit) => suit === 'hearts' || suit === 'diamonds'

/** Encre posée sur la carte crème : rouge carreau ou encre pure. */
const cardInk = (suit: Suit) => (isRedSuit(suit) ? 'text-suit-red' : 'text-[#24201A]')

const cardLabel = (card: Card) => `${card.value}${SUIT_GLYPH[card.suit]}`

const FACE_TEXT = {
  board: { rank: 'text-lg lg:text-2xl', suit: 'text-sm lg:text-lg' },
  chip: { rank: 'text-base', suit: 'text-sm' },
  mini: { rank: 'text-2xl', suit: 'text-base' },
  large: { rank: 'text-4xl', suit: 'text-2xl' },
} as const

/**
 * Face de carte, rang AU CENTRE et en grand, enseigne dessous. Ici c'est la
 * valeur qui compte (« qui a un 7 ? ») : les coins de PlayingCard, en 10 px,
 * ne se lisaient pas à bout de bras sur une carte de 40 px.
 */
function CardFace({ card, size, className }: { card: Card; size: keyof typeof FACE_TEXT; className?: string }) {
  const ink = cardInk(card.suit)
  return (
    <PlayingCard
      suit={GAME_SUIT[card.suit]}
      corners={false}
      className={cn('flex flex-col items-center justify-center gap-0.5 leading-none', className)}
    >
      <span className={cn('font-display font-black', FACE_TEXT[size].rank, ink)}>{card.value}</span>
      <span aria-hidden className={cn(FACE_TEXT[size].suit, ink)}>{SUIT_GLYPH[card.suit]}</span>
    </PlayingCard>
  )
}

const PRELUDE_STEPS: readonly PreludeStep[] = ['color', 'higherLower', 'insideOutside', 'suit']

/**
 * Étape du prélude à l'écran. `reveal` : les 4 prédictions sont faites, la
 * 4e carte et son verdict restent affichés jusqu'au « Passer à … ». Sans
 * elle, la dernière carte et ses 4 gorgées disparaissaient dans le même
 * rendu que le passage au joueur suivant.
 */
type PreludeUiStep = PreludeStep | 'reveal'

/** Le temps de lire son verdict avant que l'écran dise à qui passer le téléphone. */
const VERDICT_HOLD_MS = 1600

/**
 * Clé du passe-téléphone du mode Cartes : le joueur ET le numéro de la carte,
 * pour qu'un joueur rapide (qui retourne avant le flash) déclenche quand même
 * celui du suivant.
 */
type FunPass = { key: string; playerId: string }
const makeFunPass = (playerId: string, flipIndex: number): FunPass => ({ key: `${playerId}#${flipIndex}`, playerId })
/** Verrou de retournement : la carte finit de tourner avant la suivante. */
const FLIP_LOCK_MS = 500

// Padding bas du flux sous les barres plus hautes que celle prévue par GameShell (5,75 rem).
const PAD_BOARD =
  'pb-[calc(10rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]'
const PAD_PRELUDE_TWO = 'pb-[calc(9rem+env(safe-area-inset-bottom,0px))]'
const PAD_PRELUDE_FOUR = 'pb-[calc(11.5rem+env(safe-area-inset-bottom,0px))]'

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
  preludeStep: PreludeUiStep
  preludeResultsByPlayer: Record<string, PreludeResult[]>
  preludeDrinksByPlayer: Record<string, number>
  preludeRevealed: Card[]
}

type Screen = 'prelude' | 'preludeSummary' | 'memorize' | 'board' | 'end'

export default function Game({ players, onGameEnd, pyramidHeight, gameMode, deckCount, cardsToSelect }: GameProps) {
  const t = useTranslations('games.pyramide')
  const tc = useTranslations('common')
  const reducedMotion = useReducedMotion()
  const [confirmDialog, confirm] = useConfirmAction()
  const [pyramid, setPyramid] = useState<Card[][]>([])
  const [gameOver, setGameOver] = useState(false)
  const [nextCardToFlip, setNextCardToFlip] = useState<{row: number, col: number} | null>(null)
  const [lastFlippedCard, setLastFlippedCard] = useState<{row: number, col: number} | null>(null)
  const [totalCardsFlipped, setTotalCardsFlipped] = useState(0)
  const [totalCards, setTotalCards] = useState(0)
  const [currentCard, setCurrentCard] = useState<Card | null>(null)
  const [gameStarted, setGameStarted] = useState(false)
  const [isCardFlipping, setIsCardFlipping] = useState(false)
  const flipLockRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Passe-téléphone du mode Cartes (voir l'effet plus bas). Désarmé = la
  // prochaine clé sert de point de départ, posée sans attendre.
  const [funPass, setFunPass] = useState<FunPass | null>(null)
  const funPassArmedRef = useRef(false)

  // États mode classique
  const [classicGamePhase, setClassicGamePhase] = useState<'prelude' | 'preludeSummary' | 'selection' | 'play'>('prelude')
  const [selectedCardsByPlayer, setSelectedCardsByPlayer] = useState<Record<string, Card[]>>({})
  const [currentSelectionPlayer, setCurrentSelectionPlayer] = useState<number>(0)
  const [availableCardsForSelection, setAvailableCardsForSelection] = useState<Card[]>([])
  const [readyToStart, setReadyToStart] = useState(false)

  // Pré-jeu : prédictions en 4 étapes
  const [preludeDeck, setPreludeDeck] = useState<Card[]>([])
  const [preludeCurrentPlayer, setPreludeCurrentPlayer] = useState<number>(0)
  const [preludeStep, setPreludeStep] = useState<PreludeUiStep>('color')
  const [preludeResultsByPlayer, setPreludeResultsByPlayer] = useState<Record<string, PreludeResult[]>>({})
  const [preludeDrinksByPlayer, setPreludeDrinksByPlayer] = useState<Record<string, number>>({})
  const [preludeRevealed, setPreludeRevealed] = useState<Card[]>([])
  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<PyramideSave>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  const { updatePlayerStats } = usePlayers()

  useEffect(() => () => {
    if (flipLockRef.current) clearTimeout(flipLockRef.current)
  }, [])

  /** Pose tout de suite la clé de la carte `flipIndex` (reprise, nouvelle donne) : pas de flash différé. */
  const anchorFunPass = (flipIndex: number) => {
    if (gameMode !== 'fun' || players.length === 0) return
    funPassArmedRef.current = true
    setFunPass(makeFunPass(players[funFlipperIndex(flipIndex, players.length)].id, flipIndex))
  }

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
    if (preludeStep === 'reveal') return
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

    if (!success) {
      setPreludeDrinksByPlayer(prev => ({
        ...prev,
        [player.id]: (prev[player.id] || 0) + penalty
      }))
    }

    const nextIndex = PRELUDE_STEPS.indexOf(preludeStep) + 1
    setPreludeStep(nextIndex < PRELUDE_STEPS.length ? PRELUDE_STEPS[nextIndex] : 'reveal')
  }

  // Fonction d'initialisation du jeu extraite dans un useCallback pour éviter les re-créations inutiles
  const initializeGame = useCallback(() => {
    if (gameMode === 'fun') {
      // Mode Cartes : pyramide aléatoire, toujours un seul paquet
      const shuffledDeck = shuffleDeck(createDeck(1))
      const { pyramidCards } = createPyramid(shuffledDeck, pyramidHeight)

      setPyramid(pyramidCards)
      setCurrentCard(null)
      setGameOver(false)
      setGameStarted(true)
      setIsCardFlipping(false)
      setTotalCards(totalCardsForHeight(pyramidHeight))
      setTotalCardsFlipped(0)
      // Première carte à retourner : en bas à gauche
      setNextCardToFlip({ row: pyramidHeight - 1, col: 0 })
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
      setPreludeRevealed([])
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
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameStarted, gameOver, pyramid, nextCardToFlip, lastFlippedCard, totalCardsFlipped,
      totalCards, currentCard, classicGamePhase, selectedCardsByPlayer, currentSelectionPlayer,
      availableCardsForSelection, readyToStart, preludeDeck, preludeCurrentPlayer, preludeStep,
      preludeResultsByPlayer, preludeDrinksByPlayer, preludeRevealed]);

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
    setIsCardFlipping(false)
    setGameStarted(true)
    setStarted(true)
    // La carte reprise devient le point de départ : sans cela, la clé de la
    // carte 0 restait en place et un flash partait 1,6 s après la reprise.
    if (!saved.gameOver) anchorFunPass(saved.totalCardsFlipped)
  }

  // Retourner la prochaine carte
  const flipNextCard = () => {
    if (!nextCardToFlip || isCardFlipping || gameOver) return
    const { row, col } = nextCardToFlip
    const card = pyramid[row]?.[col]
    if (!card) return
    setIsCardFlipping(true)

    const flipped: Card = { ...card, faceUp: true }
    const updatedPyramid = pyramid.map((cards, r) =>
      r === row ? cards.map((c, ci) => (ci === col ? flipped : c)) : cards
    )
    setPyramid(updatedPyramid)
    setTotalCardsFlipped(prev => prev + 1)
    setCurrentCard(flipped)
    setLastFlippedCard({ row, col })

    if (totalCardsFlipped + 1 >= totalCards) {
      setGameOver(true)
      setNextCardToFlip(null)
    } else {
      setNextCardToFlip(findNextCardToFlipPure(updatedPyramid, row, col))
    }

    if (flipLockRef.current) clearTimeout(flipLockRef.current)
    flipLockRef.current = setTimeout(() => {
      flipLockRef.current = null
      setIsCardFlipping(false)
    }, FLIP_LOCK_MS)
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

  // Réinitialiser le jeu
  const resetGame = () => {
    session.clear()
    gameCountedRef.current = false
    // Nouvelle donne : « passe à {premier joueur} » tout de suite, pas après le délai de lecture d'un verdict.
    anchorFunPass(0)
    setStarted(true)
    initializeGame()
  }

  // Une partie de 30 à 45 min, prélude et mémorisation compris : un faux
  // toucher pendant que le téléphone change de main ne doit pas l'effacer.
  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok) resetGame()
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

    setPyramid(pyramidCards);
    setTotalCards(totalCardsForHeight(pyramidHeight));
    setTotalCardsFlipped(0);
    // Première carte à retourner : en bas à gauche
    setNextCardToFlip({ row: pyramidHeight - 1, col: 0 });
  };

  const setMemorizedCardsFaceUp = (playerId: string, faceUp: boolean) => {
    setSelectedCardsByPlayer(prev => ({ ...prev, [playerId]: (prev[playerId] || []).map(c => ({ ...c, faceUp })) }))
  }

  const finishMemorization = () => {
    const pid = players[currentSelectionPlayer]?.id
    if (pid) setMemorizedCardsFaceUp(pid, false)
    if (currentSelectionPlayer < players.length - 1) {
      setCurrentSelectionPlayer(prev => prev + 1)
    } else {
      setReadyToStart(true)
      startClassicGame()
    }
  }

  // ── Écran courant et joueur au tour ────────────────────────────────────────

  const screen: Screen = gameOver
    ? 'end'
    : gameMode === 'fun'
      ? 'board'
      : classicGamePhase === 'prelude'
        ? 'prelude'
        : classicGamePhase === 'preludeSummary'
          ? 'preludeSummary'
          : classicGamePhase === 'selection'
            ? 'memorize'
            : 'board'

  // Mode Cartes : chacun son tour retourne une carte et boit l'étage.
  const nextFlipper = gameMode === 'fun' && !gameOver && players.length > 0
    ? players[funFlipperIndex(totalCardsFlipped, players.length)]
    : undefined
  const lastFlipper = gameMode === 'fun' && totalCardsFlipped > 0 && players.length > 0
    ? players[funFlipperIndex(totalCardsFlipped - 1, players.length)]
    : undefined

  // Passe-téléphone du mode Cartes, retardé : celui qui vient de retourner
  // lit d'abord son verdict, puis l'écran dit à qui tendre le téléphone.
  const nextFlipperId = nextFlipper?.id ?? null
  useEffect(() => {
    if (!nextFlipperId) {
      funPassArmedRef.current = false
      setFunPass(null)
      return
    }
    const next = makeFunPass(nextFlipperId, totalCardsFlipped)
    // Point de départ du montage posé sans attendre : retardé, il aurait servi
    // de référence muette et avalé le flash du joueur suivant.
    if (!funPassArmedRef.current) {
      funPassArmedRef.current = true
      setFunPass(next)
      return
    }
    const timer = setTimeout(() => setFunPass(next), VERDICT_HOLD_MS)
    return () => clearTimeout(timer)
  }, [nextFlipperId, totalCardsFlipped])

  const passPlayer = gameMode === 'fun'
    ? players.find(p => p.id === funPass?.playerId)
    : screen === 'prelude'
      ? players[preludeCurrentPlayer]
      : screen === 'memorize'
        ? players[currentSelectionPlayer]
        : undefined
  const passKey = gameMode === 'fun' ? (passPlayer ? funPass?.key ?? null : null) : passPlayer?.id ?? null

  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />

  const nameClass = (p: BasePlayer) => cn(isSpecialPlayer(p) && getSpecialEffectClass(p))

  // ── Verdict d'une carte retournée : qui boit, combien ─────────────────────

  const renderVerdict = (big = false) => {
    const titleClass = cn('font-display font-bold leading-tight text-cream', big ? 'text-xl' : 'text-lg')
    const pillClass = cn(
      'inline-block rounded-lg bg-suit-red px-2 py-0.5 font-display font-bold leading-tight text-cream',
      big ? 'text-xl' : 'text-lg'
    )
    if (!currentCard || !lastFlippedCard) {
      return (
        <>
          <p className={titleClass}>
            {gameMode === 'fun' && nextFlipper
              ? t('game.verdict.startFun', { name: nextFlipper.name })
              : t('game.verdict.startClassic')}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-cream/80">
            {gameMode === 'fun' ? t('game.verdict.startRule') : t('game.verdict.startRuleClassic')}
          </p>
        </>
      )
    }
    const stake = stakeOfRow(pyramid.length, lastFlippedCard.row)
    const where = stake.kind === 'bottomsUp'
      ? t('game.verdict.summit', { card: cardLabel(currentCard) })
      : t('game.verdict.floor', { floor: stake.count, card: cardLabel(currentCard) })
    return (
      <>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{where}</p>
        {gameMode === 'fun' && lastFlipper ? (
          stake.kind === 'bottomsUp' ? (
            <p className="mt-1"><span className={pillClass}>{t('game.verdict.funBottomsUp', { name: lastFlipper.name })}</span></p>
          ) : (
            <p className={cn('mt-0.5', titleClass)}>{t('game.verdict.funDrinks', { name: lastFlipper.name, count: stake.count })}</p>
          )
        ) : (
          <>
            <p className={cn('mt-0.5', titleClass)}>{t('game.verdict.classicWho', { rank: currentCard.value })}</p>
            {stake.kind === 'bottomsUp' ? (
              <p className="mt-1"><span className={cn(pillClass, 'text-sm')}>{t('game.verdict.classicBottomsUp')}</span></p>
            ) : (
              <p className="text-sm font-semibold text-gold">{t('game.verdict.classicGive', { count: stake.count })}</p>
            )}
          </>
        )}
      </>
    )
  }

  // ── Prélude (mode classique) ──────────────────────────────────────────────

  const preludePlayer = players[preludeCurrentPlayer]
  const preludeResults = preludePlayer ? (preludeResultsByPlayer[preludePlayer.id] || []) : []
  const lastPreludeResult = preludeRevealed.length > 0 ? preludeResults[preludeResults.length - 1] : undefined
  const preludeStepIndex = preludeStep === 'reveal' ? PRELUDE_STEPS.length : PRELUDE_STEPS.indexOf(preludeStep)
  const lastPreludePlayer = preludeCurrentPlayer >= players.length - 1

  const preludeQuestion = (step: PreludeStep, name: string) => {
    switch (step) {
      case 'color': return t('game.questions.color', { name })
      case 'higherLower': return t('game.questions.higherLower', { name, value: preludeRevealed[0]?.value ?? '?' })
      case 'insideOutside': return t('game.questions.insideOutside', { name })
      case 'suit': return t('game.questions.suit', { name })
    }
  }

  const preludeChoices = (step: PreludeStep): { value: string; label: string; icon?: ReactNode; tone?: string }[] => {
    switch (step) {
      case 'color': return [
        { value: 'red', label: t('game.choices.red'), tone: 'text-red-300' },
        { value: 'black', label: t('game.choices.black') },
      ]
      case 'higherLower': return [
        { value: 'higher', label: t('game.choices.higher'), icon: <ArrowUp aria-hidden className="h-5 w-5" /> },
        { value: 'lower', label: t('game.choices.lower'), icon: <ArrowDown aria-hidden className="h-5 w-5" /> },
      ]
      case 'insideOutside': return [
        { value: 'inside', label: t('game.choices.inside'), icon: <FoldHorizontal aria-hidden className="h-5 w-5" /> },
        { value: 'outside', label: t('game.choices.outside'), icon: <UnfoldHorizontal aria-hidden className="h-5 w-5" /> },
      ]
      case 'suit': return [
        { value: 'hearts', label: t('game.choices.hearts'), tone: 'text-red-300' },
        { value: 'diamonds', label: t('game.choices.diamonds'), tone: 'text-red-300' },
        { value: 'clubs', label: t('game.choices.clubs') },
        { value: 'spades', label: t('game.choices.spades') },
      ]
    }
  }

  const preludeContent = preludePlayer ? (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={preludePlayer} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {preludeStep === 'reveal' ? t('game.preludeDone') : t('game.preludeStep', { n: preludeStepIndex + 1 })}
            </p>
            <p className={cn('truncate font-display text-xl font-bold text-cream', nameClass(preludePlayer))}>{preludePlayer.name}</p>
          </div>
          <div aria-hidden className="flex shrink-0 gap-1.5">
            {PRELUDE_STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  i === preludeStepIndex ? 'bg-gold' : i < preludeStepIndex ? 'bg-gold/50' : 'bg-black/30'
                )}
              />
            ))}
          </div>
        </div>

        <div aria-hidden className="mt-4 flex items-center justify-center gap-2">
          {PRELUDE_STEPS.map((s, i) => {
            const c = preludeRevealed[i]
            return c ? (
              <motion.div
                key={s}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <CardFace card={c} size="mini" className="h-20 w-14" />
              </motion.div>
            ) : (
              <div key={s} className="h-20 w-14 rounded-xl border border-dashed border-gold/30" />
            )
          })}
        </div>

        {/* Toujours montée : une région live créée avec son texte est souvent tue. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="mt-3">
          {lastPreludeResult && (
            <p
              className={cn(
                'rounded-xl px-3 py-2 text-center font-display text-lg font-bold leading-tight',
                lastPreludeResult.success
                  ? 'border border-emerald-300/40 bg-emerald-500/10 text-emerald-300'
                  : 'bg-suit-red text-cream'
              )}
            >
              <span className="sr-only">{cardLabel(lastPreludeResult.card)} · </span>
              {lastPreludeResult.success
                ? t('game.verdict.preludeSuccess', { name: preludePlayer.name })
                : t('game.verdict.preludeFail', { name: preludePlayer.name, count: PRELUDE_PENALTY[lastPreludeResult.step] })}
            </p>
          )}
        </div>
      </section>

      {/* Récapitulatif gorgées du pré-jeu */}
      <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
        <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.preludeDrinks')}</h2>
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {players.map(p => {
            const drinks = preludeDrinksByPlayer[p.id] || 0
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-gold/20 bg-black/20 px-2.5 py-1.5">
                <span className="truncate text-cream/80">{p.name}</span>
                <span className={cn('shrink-0 font-bold', drinks > 0 ? 'text-red-300' : 'text-cream/70')}>{drinks}🍺</span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  ) : null

  const preludeBar = (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* Question toujours montée (vide pendant le verdict) : d'un joueur à
          l'autre, la région live existe déjà quand « Tom, rouge ou noire ? »
          s'y écrit. Vide, sr-only la sort du flux et du gap. */}
      <p
        aria-live="polite"
        className={cn(
          'text-center font-display text-base font-bold leading-tight text-gold',
          preludeStep === 'reveal' && 'sr-only'
        )}
      >
        {preludeStep === 'reveal' ? null : preludeQuestion(preludeStep, preludePlayer?.name ?? '')}
      </p>
      {preludeStep === 'reveal' ? (
        <Button variant="primary" size="gameLg" className="w-full whitespace-normal leading-tight" onClick={proceedAfterPreludeIfNeeded}>
          {lastPreludePlayer
            ? t('game.preludeSeeSummary')
            : t('game.preludePassTo', { name: players[preludeCurrentPlayer + 1]?.name ?? '' })}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {preludeChoices(preludeStep).map(choice => (
            <Button
              key={choice.value}
              variant="quiet"
              size={preludeStep === 'suit' ? 'game' : 'gameLg'}
              className={cn('w-full gap-2', choice.tone)}
              onClick={() => handlePreludeSelection(choice.value)}
            >
              {choice.icon}
              {choice.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )

  // ── Bilan du prélude ──────────────────────────────────────────────────────

  const preludeSummaryContent = (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
      <h2 className="mb-3 font-display text-xl font-bold text-gold">{t('game.preludeSummaryTitle')}</h2>
      {(() => {
        const totals = computePreludeTotals()
        return (
          <ul className="space-y-2">
            {players.map(p => {
              const drinks = preludeDrinksByPlayer[p.id] || 0
              const mistakes = (preludeResultsByPlayer[p.id] || []).filter(r => !r.success).map(r => t(`stepLabels.${r.step}`))
              const totalPts = totals[p.id] || 0
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
                  <PlayerAvatar player={p} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-base font-semibold text-cream', nameClass(p))}>{p.name}</span>
                      {drinks > 0 ? (
                        <span className="shrink-0 text-sm font-bold text-red-300">{tc('sipsCount', { count: drinks })}</span>
                      ) : (
                        <Check aria-hidden className="h-5 w-5 shrink-0 text-emerald-300" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-cream/70">{mistakes.length > 0 ? t('game.mistakes', { list: mistakes.join(', ') }) : t('game.noMistakes')}</span>
                      <span className="shrink-0 font-display text-xs font-semibold text-gold">{t('game.points', { pts: totalPts })}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      })()}
    </section>
  )

  const preludeSummaryBar = (
    <Button
      variant="primary"
      size="gameLg"
      className="w-full whitespace-normal leading-tight"
      onClick={() => {
        setClassicGamePhase('selection')
        setCurrentSelectionPlayer(0)
        setReadyToStart(false)
      }}
    >
      {t('game.memorizationStart', { name: players[0]?.name ?? '' })}
    </Button>
  )

  // ── Mémorisation (mode classique) ─────────────────────────────────────────

  const memoPlayer = players[currentSelectionPlayer]
  const memoCards = memoPlayer ? (selectedCardsByPlayer[memoPlayer.id] || []) : []
  const lastMemoPlayer = currentSelectionPlayer >= players.length - 1

  const memorizeContent = memoPlayer ? (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
      <div className="flex items-center gap-3">
        <PlayerAvatar player={memoPlayer} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            {t('game.memorization')} · {currentSelectionPlayer + 1}/{players.length}
          </p>
          <p className={cn('truncate font-display text-xl font-bold text-cream', nameClass(memoPlayer))}>{memoPlayer.name}</p>
        </div>
        <span className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2 py-0.5 text-sm font-medium text-gold">{t('page.cardsCount', { n: cardsToSelect })}</span>
      </div>
      <p className="mt-3 text-sm text-cream/80">{t('game.memorizeHint')}</p>

      <div className={cn('mx-auto mt-4 grid max-w-sm gap-2', cardsToSelect === 5 ? 'grid-cols-5' : 'grid-cols-4')}>
        {memoCards.map((card, idx) => (
          <button
            key={`mem-${idx}`}
            type="button"
            aria-label={card.faceUp ? t('game.hideCardAria', { value: card.value, suit: SUIT_GLYPH[card.suit] }) : t('game.revealCardAria', { n: idx + 1 })}
            aria-pressed={card.faceUp}
            onClick={() => {
              const pid = memoPlayer.id
              setSelectedCardsByPlayer(prev => ({ ...prev, [pid]: prev[pid].map((c, i) => i === idx ? { ...c, faceUp: !c.faceUp } : c) }))
            }}
            className="aspect-[2/3] w-full rounded-xl transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep"
          >
            {card.faceUp ? (
              <CardFace card={card} size="mini" className="h-full w-full" />
            ) : (
              <PlayingCardBack className="h-full w-full" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="quiet" size="game" className="w-full gap-2" onClick={() => setMemorizedCardsFaceUp(memoPlayer.id, true)}>
          <Eye aria-hidden className="h-5 w-5" />
          {t('game.seeAll')}
        </Button>
        <Button variant="quiet" size="game" className="w-full gap-2" onClick={() => setMemorizedCardsFaceUp(memoPlayer.id, false)}>
          <EyeOff aria-hidden className="h-5 w-5" />
          {t('game.hideAll')}
        </Button>
      </div>
    </section>
  ) : null

  const memorizeBar = (
    <Button variant="primary" size="gameLg" className="w-full whitespace-normal leading-tight" onClick={finishMemorization}>
      {lastMemoPlayer
        ? t('game.memorizedStart')
        : t('game.memorizedPassTo', { name: players[currentSelectionPlayer + 1]?.name ?? '' })}
    </Button>
  )

  // ── Plateau ───────────────────────────────────────────────────────────────

  // Une carte tient en largeur (la rangée du bas compte `rows` cartes, avec la
  // place des pastilles d'étage de part et d'autre) ET en hauteur (`rows`
  // rangées sous la Navbar, l'en-tête et la barre du verdict) : en portrait,
  // toute la pyramide se voit sans tourner le téléphone. Entre 28 et 64 px.
  const rows = Math.max(1, pyramid.length || pyramidHeight)
  const boardStyle = {
    '--pyr-card-w': `clamp(1.75rem, min(calc((100vw - 10.5rem) / ${rows}), calc((100vh - 25rem) / ${rows * 1.5})), 4rem)`,
  } as CSSProperties

  const boardContent = (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-2 sm:p-4">
        <div className="flex flex-col gap-1.5 py-1" style={boardStyle}>
          {pyramid.map((row, rowIndex) => {
            const isSummit = rowIndex === 0
            return (
              <div key={rowIndex} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
                {/* Pastille d'étage : ×N gorgées, cul sec au sommet. Le verdict de la barre le redit en toutes lettres. */}
                <div aria-hidden className="mr-1.5 justify-self-end">
                  {isSummit ? (
                    <span className="block whitespace-nowrap rounded-lg bg-suit-red px-1.5 py-1 text-xs font-bold uppercase leading-none tracking-wide text-cream">
                      {t('game.bottomsUp')}
                    </span>
                  ) : (
                    <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg border border-gold/30 bg-gold/10 px-1 font-display text-xs font-bold tabular-nums text-gold">
                      ×{floorOfRow(pyramid.length, rowIndex)}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {row.map((card, colIndex) => {
                    const isNext = !!(nextCardToFlip && nextCardToFlip.row === rowIndex && nextCardToFlip.col === colIndex)
                    const isLast = !!(lastFlippedCard && lastFlippedCard.row === rowIndex && lastFlippedCard.col === colIndex)
                    return (
                      <motion.div
                        key={`${rowIndex}-${colIndex}`}
                        className={cn(
                          'rounded-xl',
                          isNext && !card.faceUp && 'ring-2 ring-gold',
                          isLast && 'ring-2 ring-gold ring-offset-2 ring-offset-felt-deep'
                        )}
                        animate={card.faceUp ? { rotateY: 0 } : { rotateY: 180 }}
                        transition={{ duration: reducedMotion ? 0 : 0.45, ease: 'easeOut' }}
                        style={{
                          width: 'var(--pyr-card-w)',
                          height: 'calc(var(--pyr-card-w) * 1.5)',
                          transformStyle: 'preserve-3d',
                          perspective: '1000px',
                        }}
                      >
                        {card.faceUp ? (
                          <CardFace card={card} size="board" className="h-full w-full" />
                        ) : (
                          <div className="relative h-full w-full rounded-xl" style={{ transform: 'rotateY(180deg)' }}>
                            <PlayingCardBack className="h-full w-full" />
                            {isNext && <div className="absolute inset-0 rounded-xl bg-gold/20 motion-safe:animate-pulse" />}
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {totalCards > 0 && (
          <div className="mt-3 space-y-1.5 px-1">
            <div
              role="progressbar"
              aria-valuenow={totalCardsFlipped}
              aria-valuemin={0}
              aria-valuemax={totalCards}
              aria-label={t('game.progressAria', { flipped: totalCardsFlipped, total: totalCards })}
              className="relative h-2 w-full overflow-hidden rounded-full bg-black/30"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gold transition-[width] duration-500"
                style={{ width: `${(totalCardsFlipped / totalCards) * 100}%` }}
              />
            </div>
            <p className="text-center font-display text-xs text-gold">{t('game.progress', { flipped: totalCardsFlipped, total: totalCards })}</p>
          </div>
        )}
      </section>

      {/* ── Cartes des joueurs (mode classique) ───────────────────── */}
      {gameMode === 'classic' && (
        <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3 sm:p-4">
          <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.playerCards')}</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {players.map((player) => {
              const cards = selectedCardsByPlayer[player.id] || []
              if (cards.length === 0) return null
              return (
                <div key={player.id} className="flex items-center gap-2">
                  <span className={cn('shrink-0 text-sm font-semibold text-cream/80', nameClass(player))}>
                    {player.name}
                  </span>
                  <div className="flex gap-1.5">
                    {cards.map((card, cardIndex) => {
                      const isLastFlippedValue = !!(lastFlippedCard && pyramid[lastFlippedCard.row]?.[lastFlippedCard.col]?.value === card.value)
                      return (
                        <button
                          key={`${player.id}-${card.suit}-${card.value}-${cardIndex}`}
                          type="button"
                          aria-label={card.faceUp ? t('game.hidePlayerCardAria', { value: card.value, suit: SUIT_GLYPH[card.suit], player: player.name }) : t('game.revealPlayerCardAria', { n: cardIndex + 1, player: player.name })}
                          aria-pressed={card.faceUp}
                          onClick={() => setSelectedCardsByPlayer(prev => ({ ...prev, [player.id]: prev[player.id].map((c, i) => i === cardIndex ? { ...c, faceUp: !c.faceUp } : c) }))}
                          className={cn(
                            'touch-target h-14 w-10 rounded-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                            card.faceUp && isLastFlippedValue && 'ring-2 ring-gold ring-offset-2 ring-offset-felt-deep'
                          )}
                        >
                          {card.faceUp ? (
                            <CardFace card={card} size="chip" className="h-full w-full rounded-lg" />
                          ) : (
                            <PlayingCardBack className="h-full w-full rounded-lg" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )

  const boardBar = (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div role="status" aria-live="polite" aria-atomic="true" className="flex min-w-0 flex-1 items-center gap-3">
        <div aria-hidden className="shrink-0">
          {currentCard ? (
            <CardFace card={currentCard} size="mini" className="h-16 w-11 sm:h-14 sm:w-10" />
          ) : (
            <PlayingCardBack className="h-16 w-11 sm:h-14 sm:w-10" />
          )}
        </div>
        <motion.div
          key={totalCardsFlipped}
          className="min-w-0 flex-1"
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {renderVerdict()}
        </motion.div>
      </div>
      <Button
        variant="primary"
        size="gameLg"
        className="w-full whitespace-normal leading-tight [touch-action:manipulation] sm:w-auto sm:min-w-[15rem]"
        // Verrou court (la carte tourne) sans griser le bouton à chaque carte.
        aria-disabled={isCardFlipping || undefined}
        disabled={!nextCardToFlip}
        onClick={flipNextCard}
      >
        {nextFlipper ? t('game.flipBy', { name: nextFlipper.name }) : t('game.flip')}
      </Button>
    </div>
  )

  // ── Fin de partie (les deux modes) ────────────────────────────────────────

  const funRanking = gameMode === 'fun'
    ? (() => {
        const tally = computeFunTally(pyramid.length, totalCardsFlipped, players.length)
        return players
          .map((player, i) => ({ player, ...(tally[i] ?? { sips: 0, bottomsUp: 0 }) }))
          .sort((a, b) => b.bottomsUp - a.bottomsUp || b.sips - a.sips)
      })()
    : []

  const endContent = (
    <div className="flex flex-col gap-4">
      <header className="text-center">
        <h2 className="font-display text-2xl font-bold text-gold">{t('game.gameFinished')}</h2>
        {totalCards > 0 && <p className="mt-1 text-sm text-cream/80">{t('game.endRecap', { cards: totalCards })}</p>}
      </header>

      {currentCard && lastFlippedCard && (
        <section className="flex items-center gap-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
          <div aria-hidden className="shrink-0">
            <CardFace card={currentCard} size="large" className="h-28 w-20" />
          </div>
          <div className="min-w-0 flex-1">{renderVerdict(true)}</div>
        </section>
      )}

      {gameMode === 'fun' ? (
        <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
          <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.tallyTitle')}</h3>
          <ul className="space-y-2">
            {funRanking.map(({ player, sips, bottomsUp }) => (
              <li key={player.id} className="flex items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-2">
                <PlayerAvatar player={player} />
                <span className={cn('min-w-0 flex-1 truncate text-base font-semibold text-cream', nameClass(player))}>{player.name}</span>
                {bottomsUp > 0 && (
                  <span className="shrink-0 rounded-md bg-suit-red px-1.5 py-0.5 text-xs font-bold uppercase text-cream">{t('game.bottomsUp')}</span>
                )}
                <span className="shrink-0 font-display text-base font-bold text-gold">{tc('sipsCount', { count: sips })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        (() => {
          const res = computeScores()
          if (!res) return null
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-gold/30 bg-gold/10 p-3 text-center">
                  <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.mostPoints')}</p>
                  <p className="truncate font-display text-base font-bold text-cream">{res.max.player?.name}</p>
                  <p className="font-display text-2xl font-bold text-gold">{res.max.score}</p>
                </div>
                <div className="rounded-2xl border border-suit-red/40 bg-suit-red/[0.15] p-3 text-center">
                  <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-red-300">{t('game.leastPoints')}</p>
                  <p className="truncate font-display text-base font-bold text-cream">{res.min.player?.name}</p>
                  <p className="font-display text-2xl font-bold text-red-300">{res.min.score}</p>
                </div>
              </div>
              <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.fullScores')}</h3>
                <ul className="grid grid-cols-2 gap-1.5">
                  {players.map(p => (
                    <li key={p.id} className="flex items-center gap-2 rounded-xl border border-gold/20 bg-black/20 px-2.5 py-1.5">
                      <PlayerAvatar player={p} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-cream/80">{p.name}</span>
                      <span className="shrink-0 font-display text-sm font-bold text-gold">{res.scores[p.id] ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )
        })()
      )}

      <EndActionDock
        voiceGutter={false}
        feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="pyramide" />}
      >
        <Button variant="primary" size="gameLg" className="w-full gap-2" onClick={resetGame}>
          <RotateCcw aria-hidden className="h-5 w-5" />
          {t('game.replay')}
        </Button>
        <Button variant="quiet" size="game" className="w-full" onClick={onGameEnd}>
          {t('game.menu')}
        </Button>
      </EndActionDock>
    </div>
  )

  // ── Assemblage ────────────────────────────────────────────────────────────

  const content =
    screen === 'end' ? endContent
      : screen === 'prelude' ? preludeContent
        : screen === 'preludeSummary' ? preludeSummaryContent
          : screen === 'memorize' ? memorizeContent
            : boardContent

  // Sur l'écran de fin, le dock remplace la barre : deux barres fixes se superposeraient.
  const actionBar =
    screen === 'end' ? undefined
      : screen === 'prelude' ? preludeBar
        : screen === 'preludeSummary' ? preludeSummaryBar
          : screen === 'memorize' ? memorizeBar
            : boardBar

  const contentPad =
    screen === 'board' ? PAD_BOARD
      : screen === 'prelude' && preludeStep === 'suit' ? PAD_PRELUDE_FOUR
        : screen === 'prelude' && preludeStep !== 'reveal' ? PAD_PRELUDE_TWO
          : undefined

  return (
    <>
      {confirmDialog}
      <PassPhoneOverlay
        playerKey={passKey}
        name={passPlayer?.name ?? ''}
        avatar={passPlayer ? <PlayerIcon player={passPlayer} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
        enabled={!gameOver}
      />
      <GameShell
        title={t('title')}
        headerSubtitle={t(`page.modes.${gameMode}.label`)}
        onBack={onGameEnd}
        maxWidth={720}
        contentClassName={contentPad}
        headerRight={
          screen === 'end' ? undefined : (
            <Button
              variant="ghost"
              size="gameIcon"
              aria-label={tc('confirmRestart.confirm')}
              onClick={() => void askRestart()}
              className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
            >
              <RotateCcw aria-hidden className="h-5 w-5" />
            </Button>
          )
        }
        actionBar={actionBar}
      >
        {content}
      </GameShell>
    </>
  )
}
