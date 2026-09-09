/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Player } from '@/lib/players'
import { RotateCcw, X } from 'lucide-react'
import { GameShell } from '@/components/game/GameShell'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
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

const BET_STYLE: Record<BetType, { from: string; to: string; border: string }> = {
  'rouge':         { from: 'from-red-600',    to: 'to-red-800',     border: 'border-red-500/40' },
  'double-rouge':  { from: 'from-red-500',    to: 'to-rose-700',    border: 'border-red-400/40' },
  'noir':          { from: 'from-zinc-700',   to: 'to-zinc-900',    border: 'border-zinc-500/40' },
  'double-noir':   { from: 'from-zinc-600',   to: 'to-neutral-900', border: 'border-zinc-400/40' },
  'purple':        { from: 'from-violet-600', to: 'to-purple-800',  border: 'border-violet-500/40' },
  'double-purple': { from: 'from-violet-500', to: 'to-fuchsia-800', border: 'border-violet-400/40' },
}

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
  const isRed = card.color === 'red'
  if (size === 'sm') {
    return (
      <div className="flex h-14 w-10 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-white/20 bg-white shadow-md">
        <span className={cn('text-xs font-extrabold leading-none', isRed ? 'text-red-600' : 'text-gray-900')}>{card.value}</span>
        <span className={cn('text-sm leading-none', isRed ? 'text-red-600' : 'text-gray-900')}>{card.suit}</span>
      </div>
    )
  }
  return (
    <div className={cn(
      'flex h-32 w-20 sm:h-36 sm:w-24 flex-col items-center justify-center rounded-2xl border-2 bg-white shadow-xl',
      isRed ? 'border-red-400' : 'border-gray-800',
    )}>
      <span className={cn('text-3xl sm:text-4xl font-extrabold', isRed ? 'text-red-600' : 'text-gray-900')}>{card.value}</span>
      <span className={cn('text-2xl sm:text-3xl leading-tight', isRed ? 'text-red-600' : 'text-gray-900')}>{card.suit}</span>
    </div>
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
  if (!players || players.length < 2) return <div className="p-6 text-center text-red-400">{t('minPlayers')}</div>

  if (session.pending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07060b] p-4 text-white">
        <div className="w-full max-w-sm space-y-4 rounded-3xl border border-violet-500/20 bg-violet-950/30 p-6 text-center">
          <h2 className="text-xl font-extrabold">{tCommon('resumeGame.title')}</h2>
          <p className="text-sm text-white/55">{tCommon('resumeGame.body')}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={resumeSavedGame}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 py-3 text-sm font-bold text-white hover:from-violet-500 hover:to-purple-600"
            >
              {tCommon('resumeGame.resume')}
            </button>
            <button
              onClick={session.discard}
              className="w-full rounded-2xl border border-white/15 bg-white/[0.05] py-3 text-sm font-semibold text-white/70 hover:bg-white/10"
            >
              {tCommon('resumeGame.newGame')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const betButtons: BetType[] = ['rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple']

  return (
    <GameShell
      title={t('title')}
      onBack={quitGame}
      maxWidth={700}
      headerRight={
        <button onClick={initializeGame} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label={t('newGame')}>
          <RotateCcw className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-4">

        {/* ── Joueur actif ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 rounded-2xl border border-violet-800/20 bg-violet-950/30 p-3">
          <PlayerIcon player={currentPlayer} size="md" className="h-10 w-10 text-xl" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/40">{t('yourTurn')}</p>
            <p className="font-bold truncate">
              <PlayerName player={currentPlayer} />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-1.5 text-center">
              <p className="text-[10px] text-violet-400/70 uppercase tracking-wide">{t('counter')}</p>
              <p className="text-lg font-extrabold text-violet-300">{drinkCounter}<span className="text-xs ml-0.5">🍺</span></p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-center">
              <p className="text-sm font-bold text-white/60">{t('cardsLeft', { count: deck.length })}</p>
              {newDeckFlash && (
                <p className="text-[10px] font-semibold text-violet-300">{t('newDeck')}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Cartes tirées ────────────────────────────────────────────── */}
        {drawnCards.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap justify-center gap-3">
              {drawnCards.map((card, i) => <PlayingCardUI key={i} card={card} />)}
            </div>
            {isCorrect === true && canContinue && (
              <div className="mt-4 text-center space-y-3">
                <p className="text-emerald-400 font-semibold">
                  {t('correct', { count: lastBet ? betConfig[lastBet].gulps : 0 })}
                </p>
                <div className="flex gap-2 justify-center">
                  <button onClick={handleContinue} className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-600">
                    {tCommon('continue')}
                  </button>
                  <button onClick={handlePass} className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2 text-sm text-white/70 hover:bg-white/10">
                    {tCommon('pass')}
                  </button>
                </div>
              </div>
            )}
            {isRevealing && (
              <p className="mt-3 text-center text-sm text-violet-400 animate-pulse">{t('revealing')}</p>
            )}
          </div>
        )}

        {/* ── Boutons de paris ─────────────────────────────────────────── */}
        {!canContinue && !showResult && (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-violet-400/60">{t('chooseBet')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {betButtons.map(bet => {
                const s = BET_STYLE[bet]
                const cfg = betConfig[bet]
                return (
                  <button
                    key={bet}
                    onClick={() => handleBet(bet)}
                    disabled={isRevealing}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border py-4 text-center font-semibold text-white transition-all active:scale-95 disabled:opacity-40',
                      s.border,
                    )}
                  >
                    <div className={cn('absolute inset-0 bg-gradient-to-br opacity-80', s.from, s.to)} />
                    <div className="relative">
                      <p className="text-lg leading-none mb-1">{cfg.emoji}</p>
                      <p className="text-xs font-bold">{cfg.label}</p>
                      <p className="text-[10px] text-white/60">{tCommon('sipsCount', { count: cfg.gulps })}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Historique des cartes ────────────────────────────────────── */}
        {cardHistory.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/30">{t('lastCards')}</p>
            <div className="flex flex-wrap gap-2">
              {cardHistory.map((card, i) => <PlayingCardUI key={i} card={card} size="sm" />)}
            </div>
          </div>
        )}

        {/* ── Dialog mauvaise réponse ──────────────────────────────────── */}
        {showResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-red-500/20 bg-[#0d0814] p-6 shadow-2xl">
              <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(ellipse at 50% 0%, #ef4444, transparent 70%)' }} />
              <div className="relative text-center space-y-4">
                <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-red-500/15 border border-red-500/20 text-3xl">
                  😬
                </div>
                <div>
                  <p className="text-lg font-extrabold text-white">{t('wrongCombo')}</p>
                  <p className="mt-1 text-white/60 text-sm">
                    {t('mustDrink', { name: currentPlayer?.name ?? '', count: amountToDrink })}
                  </p>
                </div>
                <button
                  onClick={closeResult}
                  className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 py-3 text-sm font-bold text-white hover:from-violet-500 hover:to-purple-600"
                >
                  {tCommon('understoodNext')}
                </button>
              </div>
              <button onClick={closeResult} className="absolute right-4 top-4 text-white/30 hover:text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </GameShell>
  )
}
