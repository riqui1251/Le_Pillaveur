/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect } from 'react'
import { Player, getPlayerGameBoost } from '@/lib/players'
import { RotateCcw, X } from 'lucide-react'
import { GameShell } from '@/components/game/GameShell'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { cn } from '@/lib/utils'

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

const BET_CONFIG: Record<BetType, { cards: number; gulps: number; label: string; emoji: string }> = {
  'rouge':         { cards: 1, gulps: 1, label: 'Rouge',         emoji: '🔴' },
  'double-rouge':  { cards: 2, gulps: 2, label: 'Double rouge',  emoji: '🔴🔴' },
  'noir':          { cards: 1, gulps: 1, label: 'Noir',          emoji: '⚫' },
  'double-noir':   { cards: 2, gulps: 2, label: 'Double noir',   emoji: '⚫⚫' },
  'purple':        { cards: 2, gulps: 2, label: 'Purple',        emoji: '🟣' },
  'double-purple': { cards: 4, gulps: 4, label: 'Double Purple', emoji: '🟣🟣' },
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

  useEffect(() => { setIsMounted(true) }, [])
  useEffect(() => {
    if (isMounted && players.length >= 2) initializeGame()
  }, [isMounted, players.length])

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
    const config = BET_CONFIG[bet]
    // Si pas assez de cartes, on mélange un nouveau paquet et on l'ajoute aux restantes
    let currentDeck = [...deck]
    if (currentDeck.length < config.cards) {
      currentDeck = [...currentDeck, ...shuffleDeck(createDeck())]
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
      const boost = player ? getPlayerGameBoost(player, 'purple') : 0
      let correct = checkBetResult(bet, drawn)
      if (!correct && boost > 0 && Math.random() * 100 < boost) correct = true
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
    players.forEach(p => updatePlayerStats(p.id, 'purple', { gamesPlayed: 1, totalDrinks: gameResults[p.id] || 0 }))
    onGameEnd()
  }

  const currentPlayer = players[currentPlayerIndex]

  if (!isMounted) return null
  if (!players || players.length < 2) return <div className="p-6 text-center text-red-400">Au moins 2 joueurs requis.</div>

  const betButtons: BetType[] = ['rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple']

  return (
    <GameShell
      title="Purple"
      onBack={quitGame}
      maxWidth={700}
      headerRight={
        <button onClick={initializeGame} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Nouvelle partie">
          <RotateCcw className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-4">

        {/* ── Joueur actif ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 rounded-2xl border border-violet-800/20 bg-violet-950/30 p-3">
          <PlayerIcon player={currentPlayer} size="md" className="h-10 w-10 text-xl" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/40">Au tour de</p>
            <p className="font-bold truncate">
              <PlayerName player={currentPlayer} />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-1.5 text-center">
              <p className="text-[10px] text-violet-400/70 uppercase tracking-wide">Compteur</p>
              <p className="text-lg font-extrabold text-violet-300">{drinkCounter}<span className="text-xs ml-0.5">🍺</span></p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-center">
              <p className="text-[10px] text-white/35 uppercase tracking-wide">Cartes</p>
              <p className="text-sm font-bold text-white/60">{deck.length} restantes</p>
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
                  ✓ Correct ! +{lastBet ? BET_CONFIG[lastBet].gulps : 0} gorgée{BET_CONFIG[lastBet!]?.gulps > 1 ? 's' : ''} au compteur
                </p>
                <div className="flex gap-2 justify-center">
                  <button onClick={handleContinue} className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-600">
                    Continuer
                  </button>
                  <button onClick={handlePass} className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2 text-sm text-white/70 hover:bg-white/10">
                    Passer
                  </button>
                </div>
              </div>
            )}
            {isRevealing && (
              <p className="mt-3 text-center text-sm text-violet-400 animate-pulse">Révélation…</p>
            )}
          </div>
        )}

        {/* ── Boutons de paris ─────────────────────────────────────────── */}
        {!canContinue && !showResult && (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-violet-400/60">Choisis ton pari</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {betButtons.map(bet => {
                const s = BET_STYLE[bet]
                const cfg = BET_CONFIG[bet]
                return (
                  <button
                    key={bet}
                    onClick={() => handleBet(bet)}
                    disabled={isRevealing || deck.length < cfg.cards}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border py-4 text-center font-semibold text-white transition-all active:scale-95 disabled:opacity-40',
                      s.border,
                    )}
                  >
                    <div className={cn('absolute inset-0 bg-gradient-to-br opacity-80', s.from, s.to)} />
                    <div className="relative">
                      <p className="text-lg leading-none mb-1">{cfg.emoji}</p>
                      <p className="text-xs font-bold">{cfg.label}</p>
                      <p className="text-[10px] text-white/60">{cfg.gulps} gorgée{cfg.gulps > 1 ? 's' : ''}</p>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/30">Dernières cartes</p>
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
                  <p className="text-lg font-extrabold text-white">Mauvaise combinaison !</p>
                  <p className="mt-1 text-white/60 text-sm">
                    <span className="font-semibold text-white">{currentPlayer?.name}</span> doit boire{' '}
                    <span className="text-red-400 font-extrabold text-xl">{amountToDrink}</span>{' '}
                    gorgée{amountToDrink !== 1 ? 's' : ''} 🍺
                  </p>
                </div>
                <button
                  onClick={closeResult}
                  className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 py-3 text-sm font-bold text-white hover:from-violet-500 hover:to-purple-600"
                >
                  Compris, joueur suivant →
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
