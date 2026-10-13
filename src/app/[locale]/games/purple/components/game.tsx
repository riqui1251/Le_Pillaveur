/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Player } from '@/lib/players'
import { RotateCcw, X } from 'lucide-react'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayingCard as PlayingCardFace } from '@/components/ui/PlayingCard'
import type { GameSuit } from '@/lib/games'
import { cn } from '@/lib/utils'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'

// ─── Types ────────────────────────────────────────────────────────────────────

type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'V' | 'D' | 'R' | 'A'
type CardSuit = '♠' | '♥' | '♦' | '♣'
type BetType = 'rouge' | 'double-rouge' | 'noir' | 'double-noir' | 'purple' | 'double-purple'

interface PlayingCard { value: CardValue; suit: CardSuit; color: 'red' | 'black' }

interface GameProps {
  players: Player[]
  onGameEnd: () => void
  updatePlayerStats: (id: string, game: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
  gameMode: GameMode
}

// ─── Config ───────────────────────────────────────────────────────────────────

const cardSuits: CardSuit[] = ['♠', '♥', '♦', '♣']

// Reprise de partie : le paquet et les compteurs suffisent à rejouer la suite.
// Les états d'animation (révélation en cours, modale de résultat) ne sont pas
// sauvegardés : on repart proprement sur le choix du pari suivant.
const SAVE_ID = 'purple'
// Version 2 : la sauvegarde ne porte plus que des identifiants de joueurs
// (plus aucun profil recopié), les anciennes entrées sont donc jetées.
const SAVE_VERSION = 2

type PurpleSave = {
  /** Table de la sauvegarde : reprendre avec d'autres joueurs donnerait un
   *  index de joueur hors bornes et créditerait les gorgées aux mauvais. */
  playerIds: string[]
  deck: PlayingCard[]
  currentPlayerIndex: number
  drinkCounter: number
  gameResults: Record<string, number>
  cardHistory: PlayingCard[]
  totalCardsDrawn: number
}

const BET_META: Record<BetType, { cards: number; gulps: number; labelKey: string; emoji: string }> = {
  'rouge':         { cards: 1, gulps: 1, labelKey: 'rouge',         emoji: '🔴' },
  'double-rouge':  { cards: 2, gulps: 2, labelKey: 'doubleRouge',   emoji: '🔴🔴' },
  'noir':          { cards: 1, gulps: 1, labelKey: 'noir',          emoji: '⚫' },
  'double-noir':   { cards: 2, gulps: 2, labelKey: 'doubleNoir',    emoji: '⚫⚫' },
  'purple':        { cards: 2, gulps: 2, labelKey: 'purple',        emoji: '🟣' },
  'double-purple': { cards: 4, gulps: 4, labelKey: 'doublePurple',  emoji: '🟣🟣' },
}

// Couleurs de contenu : rouge/noir des cartes et violet signature du Purple.
const BET_STYLE: Record<BetType, string> = {
  'rouge':         'border-suit-red/60 bg-suit-red',
  'double-rouge':  'border-suit-red/60 bg-suit-red ring-1 ring-gold/40',
  'noir':          'border-gold/20 bg-[#24201A]',
  'double-noir':   'border-gold/20 bg-[#24201A] ring-1 ring-gold/40',
  'purple':        'border-violet-500/40 bg-gradient-to-br from-violet-600 to-purple-800',
  'double-purple': 'border-violet-400/40 bg-gradient-to-br from-violet-500 to-fuchsia-800',
}

const SUIT_TO_GAME_SUIT: Record<CardSuit, GameSuit> = { '♠': 'spade', '♥': 'heart', '♦': 'diamond', '♣': 'club' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function checkBetResult(bet: BetType, cards: PlayingCard[]): boolean {
  const colors = cards.map(c => c.color)
  switch (bet) {
    case 'rouge':         return colors.length === 1 && colors[0] === 'red'
    case 'double-rouge':  return colors.length === 2 && colors.every(c => c === 'red')
    case 'noir':          return colors.length === 1 && colors[0] === 'black'
    case 'double-noir':   return colors.length === 2 && colors.every(c => c === 'black')
    case 'purple':        return colors.length === 2 && colors[0] !== colors[1]
    case 'double-purple': {
      if (colors.length !== 4) return false
      // Deux paires Purple indépendantes : chaque paire doit alterner (R≠B)
      return colors[0] !== colors[1] && colors[2] !== colors[3]
    }
    default: return false
  }
}

// ─── Composant carte ──────────────────────────────────────────────────────────

function PlayingCardUI({ card, size = 'lg' }: { card: PlayingCard; size?: 'sm' | 'lg' }) {
  const ink = card.color === 'red' ? 'text-suit-red' : 'text-[#24201A]'
  if (size === 'sm') {
    return (
      <PlayingCardFace suit={SUIT_TO_GAME_SUIT[card.suit]} rank={card.value} corners={false} className="flex h-14 w-10 shrink-0 flex-col items-center justify-center rounded-lg">
        <span className={cn('font-display text-xs font-bold leading-none', ink)}>{card.value}</span>
        <span className={cn('text-sm leading-none', ink)}>{card.suit}</span>
      </PlayingCardFace>
    )
  }
  return (
    <PlayingCardFace suit={SUIT_TO_GAME_SUIT[card.suit]} rank={card.value} className="flex h-32 w-20 sm:h-36 sm:w-24 flex-col items-center justify-center">
      <span className={cn('font-display text-3xl sm:text-4xl font-bold', ink)}>{card.value}</span>
      <span className={cn('text-2xl sm:text-3xl leading-tight', ink)}>{card.suit}</span>
    </PlayingCardFace>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Game({ players, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  const betConfig = useMemo(() => {
    const config = {} as Record<BetType, { cards: number; gulps: number; label: string; emoji: string }>
    for (const [bet, meta] of Object.entries(BET_META) as [BetType, typeof BET_META[BetType]][]) {
      config[bet] = {
        cards: meta.cards,
        gulps: meta.gulps,
        label: t(`bets.${meta.labelKey}` as 'bets.rouge'),
        emoji: meta.emoji,
      }
    }
    return config
  }, [t])
  const [isMounted, setIsMounted] = useState(false)
  const [deck, setDeck] = useState<PlayingCard[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [drinkCounter, setDrinkCounter] = useState(0)
  const [gameResults, setGameResults] = useState<Record<string, number>>({})
  const [showResult, setShowResult] = useState(false)
  const [amountToDrink, setAmountToDrink] = useState(0)
  const [drawnCards, setDrawnCards] = useState<PlayingCard[]>([])
  const [lastBet, setLastBet] = useState<BetType | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [isRevealing, setIsRevealing] = useState(false)
  const [canContinue, setCanContinue] = useState(false)
  const [cardHistory, setCardHistory] = useState<PlayingCard[]>([])
  const [totalCardsDrawn, setTotalCardsDrawn] = useState(0)
  // Flash « nouveau paquet mélangé » quand le paquet épuisé est rebouclé.
  const [newDeckFlash, setNewDeckFlash] = useState(false)
  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<PurpleSave>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  /** Une partie ne doit être créditée qu'une seule fois, même si on quitte deux fois. */
  const gameCountedRef = useRef(false)

  useEffect(() => { setIsMounted(true) }, [])
  // Tant qu'une reprise est proposée, on ne distribue rien : c'est le joueur qui
  // tranche entre reprendre et repartir de zéro.
  useEffect(() => {
    if (!isMounted || !session.ready || session.pending || started) return
    if (players.length < 2) return
    initializeGame()
    setStarted(true)
  }, [isMounted, session.ready, session.pending, started, players.length])

  // Sauvegarde à chaque changement significatif : un swipe retour ne doit plus
  // coûter la partie.
  useEffect(() => {
    if (!started) return
    session.save({
      playerIds: players.map(p => p.id),
      deck,
      currentPlayerIndex,
      drinkCounter,
      gameResults,
      cardHistory,
      totalCardsDrawn,
    })
  }, [started, deck, currentPlayerIndex, drinkCounter, gameResults, cardHistory, totalCardsDrawn])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Table différente : la sauvegarde ne correspond plus à ce qui vient d'être
    // demandé, on la jette et on démarre une partie neuve.
    if (!isSameLocalTable(saved.playerIds, players)) {
      session.discard()
      return
    }
    setDeck(saved.deck)
    setCurrentPlayerIndex(saved.currentPlayerIndex)
    setDrinkCounter(saved.drinkCounter)
    setGameResults(saved.gameResults)
    setCardHistory(saved.cardHistory)
    setTotalCardsDrawn(saved.totalCardsDrawn)
    setShowResult(false)
    setDrawnCards([])
    setLastBet(null)
    setIsCorrect(null)
    setIsRevealing(false)
    setCanContinue(false)
    setStarted(true)
  }

  const createDeck = (): PlayingCard[] => {
    const values: CardValue[] = ['2','3','4','5','6','7','8','9','10','V','D','R','A']
    return cardSuits.flatMap(suit =>
      values.map(value => ({ value, suit, color: (suit === '♥' || suit === '♦') ? 'red' : 'black' }))
    )
  }

  const shuffleDeck = (d: PlayingCard[]): PlayingCard[] => {
    const s = [...d]
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]]
    }
    return s
  }

  const initializeGame = () => {
    if (!players.length) return
    // Nouvelle partie : elle a le droit d'être comptée à son tour.
    gameCountedRef.current = false
    setDeck(shuffleDeck(createDeck()))
    setCurrentPlayerIndex(Math.floor(Math.random() * players.length))
    setDrinkCounter(0)
    setGameResults({})
    setShowResult(false)
    setDrawnCards([])
    setLastBet(null)
    setIsCorrect(null)
    setIsRevealing(false)
    setCanContinue(false)
    setCardHistory([])
    setTotalCardsDrawn(0)
  }

  const handleBet = (bet: BetType) => {
    if (isRevealing) return
    const config = betConfig[bet]
    // Si pas assez de cartes, on mélange un nouveau paquet et on l'ajoute aux
    // restantes — la partie ne s'arrête jamais faute de cartes.
    let currentDeck = [...deck]
    if (currentDeck.length < config.cards) {
      currentDeck = [...currentDeck, ...shuffleDeck(createDeck())]
      setNewDeckFlash(true)
      setTimeout(() => setNewDeckFlash(false), 4000)
    }
    const drawn = currentDeck.slice(0, config.cards)
    const counter = drinkCounter
    setDeck(currentDeck.slice(config.cards))
    setTotalCardsDrawn(prev => prev + config.cards)
    setDrawnCards(drawn)
    setLastBet(bet)
    setIsRevealing(true)

    setTimeout(() => {
      const player = players[currentPlayerIndex]
      const correct = checkBetResult(bet, drawn)
      setIsCorrect(correct)
      setCardHistory(prev => [...prev, ...drawn].slice(-6))

      if (correct) {
        setDrinkCounter(prev => prev + config.gulps)
        setCanContinue(true)
      } else {
        const total = counter + config.gulps
        setAmountToDrink(total)
        setGameResults(prev => ({ ...prev, [player.id]: (prev[player.id] || 0) + total }))
        setDrinkCounter(0)
        setShowResult(true)
      }
      setIsRevealing(false)
    }, 700)
  }

  const handleContinue = () => {
    setDrawnCards([]); setLastBet(null); setIsCorrect(null); setCanContinue(false)
  }

  const handlePass = () => {
    setCurrentPlayerIndex(prev => (prev + 1) % Math.max(1, players.length))
    setDrawnCards([]); setLastBet(null); setIsCorrect(null); setCanContinue(false)
  }

  const closeResult = () => {
    setShowResult(false)
    setCurrentPlayerIndex(prev => (prev + 1) % Math.max(1, players.length))
    setDrawnCards([]); setLastBet(null)
  }

  const quitGame = () => {
    // Garde de réentrance : le bouton retour peut être tapé deux fois avant que
    // la navigation ne démonte l'écran — la partie ne doit compter qu'une fois.
    if (!gameCountedRef.current) {
      gameCountedRef.current = true
      players.forEach(p => updatePlayerStats(p.id, 'purple', { gamesPlayed: 1, totalDrinks: gameResults[p.id] || 0 }))
    }
    // Une partie terminée ne doit rien laisser derrière elle.
    session.clear()
    onGameEnd()
  }

  const currentPlayer = players[currentPlayerIndex]

  if (!isMounted || !session.ready) return null
  if (!players || players.length < 2) return <div className="p-6 text-center text-red-300">{t('minPlayers')}</div>

  if (session.pending) {
    return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  }

  const betButtons: BetType[] = ['rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple']

  return (
    <GameShell
      title={t('title')}
      onBack={quitGame}
      maxWidth={700}
      headerRight={
        <button onClick={initializeGame} className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold/[0.15] bg-black/20 text-cream/70 transition-colors hover:bg-black/30 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label={t('newGame')}>
          <RotateCcw className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-4 text-cream">

        {/* ── Joueur actif ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
          <PlayerIcon player={currentPlayer} size="md" className="h-10 w-10 text-xl" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('yourTurn')}</p>
            <p className="font-display font-bold text-cream truncate">
              <PlayerName player={currentPlayer} />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-center text-gold">
              <p className="text-[10px] uppercase tracking-wide text-gold/75">{t('counter')}</p>
              <p className="font-display text-lg font-bold text-gold">{drinkCounter}<span className="text-xs ml-0.5">🍺</span></p>
            </div>
            <div className="rounded-xl border border-gold/[0.15] bg-black/20 px-3 py-1.5 text-center">
              <p className="text-sm font-bold text-cream/60">{t('cardsLeft', { count: deck.length })}</p>
              {newDeckFlash && (
                <p className="text-[10px] font-semibold text-gold">{t('newDeck')}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Cartes tirées ────────────────────────────────────────────── */}
        {drawnCards.length > 0 && (
          <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-4">
            <div className="flex flex-wrap justify-center gap-3">
              {drawnCards.map((card, i) => <PlayingCardUI key={i} card={card} />)}
            </div>
            {isCorrect === true && canContinue && (
              <div className="mt-4 text-center space-y-3">
                <p className="text-emerald-300 font-semibold">
                  {t('correct', { count: lastBet ? betConfig[lastBet].gulps : 0 })}
                </p>
                <div className="flex gap-2 justify-center">
                  <button onClick={handleContinue} className="rounded-2xl bg-amber-500 px-5 py-2 text-sm font-bold text-black hover:bg-amber-400">
                    {tCommon('continue')}
                  </button>
                  <button onClick={handlePass} className="rounded-2xl border border-gold/25 bg-black/20 px-5 py-2 text-sm font-semibold text-cream/80 hover:bg-black/30 hover:text-cream">
                    {tCommon('pass')}
                  </button>
                </div>
              </div>
            )}
            {isRevealing && (
              <p className="mt-3 text-center font-display text-sm text-gold animate-pulse">{t('revealing')}</p>
            )}
          </div>
        )}

        {/* ── Boutons de paris ─────────────────────────────────────────── */}
        {!canContinue && !showResult && (
          <div className="space-y-2">
            <p className="text-center font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('chooseBet')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {betButtons.map(bet => {
                const cfg = betConfig[bet]
                return (
                  <button
                    key={bet}
                    onClick={() => handleBet(bet)}
                    disabled={isRevealing}
                    className={cn(
                      'rounded-2xl border py-4 text-center font-semibold text-cream transition-all enabled:hover:ring-2 enabled:hover:ring-gold focus-visible:ring-2 focus-visible:ring-gold active:scale-95 disabled:opacity-40',
                      BET_STYLE[bet],
                    )}
                  >
                    <p className="text-lg leading-none mb-1">{cfg.emoji}</p>
                    <p className="text-xs font-bold">{cfg.label}</p>
                    <p className="text-[10px] text-cream/70">{tCommon('sipsCount', { count: cfg.gulps })}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Historique des cartes ────────────────────────────────────── */}
        {cardHistory.length > 0 && (
          <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
            <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('lastCards')}</p>
            <div className="flex flex-wrap gap-2">
              {cardHistory.map((card, i) => <PlayingCardUI key={i} card={card} size="sm" />)}
            </div>
          </div>
        )}

        {/* ── Dialog mauvaise réponse ──────────────────────────────────── */}
        {showResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-sm rounded-2xl border border-gold/20 bg-felt-deep p-6 text-cream shadow-2xl">
              <div className="text-center space-y-4">
                <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-suit-red/[0.15] border border-suit-red/30 text-3xl">
                  😬
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-cream">{t('wrongCombo')}</p>
                  <p className="mt-1 text-sm text-cream/70">
                    {t('mustDrink', { name: currentPlayer?.name ?? '', count: amountToDrink })}
                  </p>
                </div>
                <button
                  onClick={closeResult}
                  className="w-full rounded-2xl bg-amber-500 py-3 text-sm font-bold text-black hover:bg-amber-400"
                >
                  {tCommon('understoodNext')}
                </button>
              </div>
              <button onClick={closeResult} className="absolute right-3 top-3 rounded-xl p-1 text-cream/60 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </GameShell>
  )
}
