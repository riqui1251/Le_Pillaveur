/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Player } from '@/lib/players'
import { Check, RotateCcw } from 'lucide-react'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { EndActionDock } from '@/components/game/EndActionDock'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { Button } from '@/components/ui/button'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import {
  PURPLE_BET_META,
  PURPLE_BET_TYPES,
  PurpleBetButton,
  PurpleBetGrid,
  PurpleDrawnCards,
  PurpleHistory,
  PurplePotRow,
  PurpleVerdictDialog,
  type PurpleBetType,
} from './purple-ui'

// ─── Types ────────────────────────────────────────────────────────────────────

type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'V' | 'D' | 'R' | 'A'
type CardSuit = '♠' | '♥' | '♦' | '♣'
type BetType = PurpleBetType

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

// Barre de décision : ligne d'enjeu, « Continuer » (56) et « Passer » (48),
// écarts et zone sûre. Les tailles de GameShell s'arrêtent à une rangée.
const DECISION_PADDING = 'pb-[calc(12rem+env(safe-area-inset-bottom,0px))]'

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

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Game({ players, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  const [confirmDialog, confirm] = useConfirmAction()
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
  // Bilan de fin : le jeu n'a pas de fin naturelle, ← y mène après confirmation.
  const [ended, setEnded] = useState(false)
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
    const config = PURPLE_BET_META[bet]
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

  // Gardes : un double toucher sur « Passer » ou « Compris » sautait un joueur.
  const handleContinue = () => {
    if (!canContinue) return
    setDrawnCards([]); setLastBet(null); setIsCorrect(null); setCanContinue(false)
  }

  const handlePass = () => {
    if (!canContinue) return
    setCurrentPlayerIndex(prev => (prev + 1) % Math.max(1, players.length))
    setDrawnCards([]); setLastBet(null); setIsCorrect(null); setCanContinue(false)
  }

  const closeResult = () => {
    if (!showResult) return
    setShowResult(false)
    setCurrentPlayerIndex(prev => (prev + 1) % Math.max(1, players.length))
    setDrawnCards([]); setLastBet(null)
  }

  const creditGame = () => {
    // Garde de réentrance : le bouton retour peut être tapé deux fois avant que
    // la navigation ne démonte l'écran — la partie ne doit compter qu'une fois.
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    players.forEach(p => updatePlayerStats(p.id, 'purple', { gamesPlayed: 1, totalDrinks: gameResults[p.id] || 0 }))
  }

  const quitGame = () => {
    creditGame()
    // Une partie terminée ne doit rien laisser derrière elle.
    session.clear()
    onGameEnd()
  }

  // ← en pleine partie : on ne sort plus sans un mot, la table voit d'abord
  // qui a bu combien (les gorgées n'étaient affichées nulle part en local).
  const askFinish = async () => {
    if (isRevealing) return
    // Aucune carte tirée : rien à résumer, on sort comme avant.
    if (totalCardsDrawn === 0) {
      quitGame()
      return
    }
    const ok = await confirm({
      title: t('endConfirm.title'),
      description: t('endConfirm.description'),
      confirmLabel: t('endConfirm.confirm'),
      cancelLabel: t('endConfirm.cancel'),
      tone: 'primary',
    })
    if (!ok) return
    creditGame()
    session.clear()
    setShowResult(false)
    setEnded(true)
  }

  const replay = () => {
    initializeGame()
    setEnded(false)
  }

  // ↺ effaçait tout au premier toucher (gorgées de chacun, compteur, paquet),
  // sauvegarde de reprise comprise : un doigt qui ripe en passant le téléphone
  // suffisait. Confirmation, et la partie effacée compte quand même dans les
  // statistiques si des cartes ont été tirées.
  const askRestart = async () => {
    // Pendant la révélation, le minuteur du pari appliquerait son verdict à
    // la partie neuve.
    if (isRevealing) return
    const ok = await confirm({
      title: tCommon('confirmRestart.title'),
      description: tCommon('confirmRestart.description'),
      confirmLabel: tCommon('confirmRestart.confirm'),
      cancelLabel: tCommon('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (!ok) return
    if (totalCardsDrawn > 0) creditGame()
    initializeGame()
  }

  const currentPlayer = players[currentPlayerIndex]
  const nextPlayer = players[(currentPlayerIndex + 1) % Math.max(1, players.length)]

  if (!isMounted || !session.ready) return null
  if (!players || players.length < 2) return <div className="p-6 text-center text-red-300">{t('minPlayers')}</div>

  if (session.pending) {
    return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  }

  // ── Fin de partie : qui a bu combien, du plus arrosé au plus sobre ─────────
  if (ended) {
    const tally = [...players].sort((a, b) => (gameResults[b.id] ?? 0) - (gameResults[a.id] ?? 0))
    return (
      <GameShell title={t('title')} onBack={quitGame} maxWidth={576} contentClassName="gap-4">
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <GameIconById id="purple" surface="felt" className="h-12 w-12" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('online.finishedTitle')}</h2>
          <p className="text-sm text-cream/80">{t('online.totalCards', { count: totalCardsDrawn })}</p>
        </div>

        <section className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('tallyTitle')}</h3>
          <ol className="space-y-2">
            {tally.map(p => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
                <PlayerIcon player={p} size="md" className="h-10 w-10 text-xl" />
                <span className="min-w-0 flex-1 truncate text-base font-semibold text-cream">
                  <PlayerName player={p} />
                </span>
                <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-sm font-bold tabular-nums text-[#24201A]">
                  {tCommon('sipsCount', { count: gameResults[p.id] ?? 0 })}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="purple" />}
        >
          <Button variant="primary" size="gameLg" className="w-full" onClick={replay}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {tCommon('replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" onClick={quitGame}>
            {tCommon('quit')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  }

  const deciding = isCorrect === true && canContinue
  const currentName = currentPlayer?.name ?? ''

  // Le seul vrai choix du jeu, sous le pouce, avec ce qu'il engage : relancer
  // le compteur, ou le refiler au joueur suivant (il ne retombe pas à zéro).
  const decisionBar = deciding ? (
    <div className="flex w-full flex-col gap-2">
      <p className="text-center text-sm text-cream/80">
        {t('decision.stake', { count: drinkCounter, name: currentName })}
      </p>
      <Button
        variant="primary"
        size="gameLg"
        className="w-full whitespace-normal leading-tight"
        onClick={handleContinue}
      >
        {t('decision.continue', { name: currentName })}
      </Button>
      <Button
        variant="quiet"
        size="game"
        className="w-full whitespace-normal leading-tight"
        onClick={handlePass}
      >
        {t('decision.pass', { name: nextPlayer?.name ?? '', count: drinkCounter })}
      </Button>
    </div>
  ) : undefined

  return (
    <>
      {confirmDialog}
      {/* Clé nulle avant la donne : le premier joueur tiré au sort sert de
          point de départ, sans flash ; ensuite, chaque changement de main. */}
      <PassPhoneOverlay
        playerKey={started ? currentPlayer?.id : null}
        name={currentName}
        avatar={currentPlayer ? <PlayerIcon player={currentPlayer} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
        enabled={!showResult}
      />
      <GameShell
        title={t('title')}
        onBack={() => void askFinish()}
        maxWidth={700}
        headerRight={
          <Button
            variant="ghost"
            size="gameIcon"
            onClick={() => void askRestart()}
            aria-label={tCommon('confirmRestart.confirm')}
            title={tCommon('confirmRestart.confirm')}
            className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
          >
            <RotateCcw aria-hidden className="h-5 w-5" />
          </Button>
        }
        actionBar={decisionBar}
        contentClassName={deciding ? DECISION_PADDING : undefined}
      >
        <div className="space-y-4 text-cream">

          {/* ── Joueur au tour + compteur ─────────────────────────────────
              Deux rangées : le nom avait ~32 px de large à 375 px, coincé
              entre l'avatar, le compteur et le paquet. */}
          <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <div className="flex items-center gap-3">
              {currentPlayer && <PlayerIcon player={currentPlayer} size="lg" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('yourTurn')}</p>
                <p className="break-words font-display text-xl font-bold leading-tight text-cream sm:text-2xl">
                  {currentPlayer && <PlayerName player={currentPlayer} />}
                </p>
              </div>
            </div>
            <PurplePotRow
              counter={drinkCounter}
              cardsLeft={deck.length}
              newDeck={newDeckFlash}
              className="mt-3 border-t border-gold/[0.15] pt-3"
            />
          </section>

          {/* ── Cartes tirées : dos le temps de la révélation, puis retournées ── */}
          {drawnCards.length > 0 && (
            <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <PurpleDrawnCards cards={drawnCards} hidden={isRevealing} drawKey={totalCardsDrawn} />
              {isRevealing && (
                <p className="mt-3 text-center font-display text-sm text-gold motion-safe:animate-pulse">{t('revealing')}</p>
              )}
              {deciding && (
                <p className="mt-4 flex items-center justify-center gap-1.5 text-center font-semibold text-emerald-300">
                  <Check aria-hidden className="h-5 w-5 shrink-0" />
                  {t('correct', { count: lastBet ? PURPLE_BET_META[lastBet].gulps : 0 })}
                </p>
              )}
            </section>
          )}

          {/* Toujours montée : une région live créée avec son texte est souvent
              tue. L'échec passe par le dialogue de verdict. */}
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {deciding
              ? `${drawnCards.map(c => `${c.value} ${c.suit}`).join(', ')}. ${t('correct', { count: lastBet ? PURPLE_BET_META[lastBet].gulps : 0 })}`
              : ''}
          </p>

          {/* ── Paris ─────────────────────────────────────────────────── */}
          {!canContinue && !showResult && (
            <section className="space-y-2">
              <h2 className="text-center text-sm font-semibold text-gold">
                {t('chooseBetFor', { name: currentName })}
              </h2>
              <PurpleBetGrid label={t('chooseBet')}>
                {PURPLE_BET_TYPES.map(bet => (
                  <PurpleBetButton key={bet} bet={bet} onClick={() => handleBet(bet)} disabled={isRevealing} />
                ))}
              </PurpleBetGrid>
            </section>
          )}

          <PurpleHistory cards={cardHistory} />
        </div>
      </GameShell>

      {/* ── Verdict : qui boit combien ─────────────────────────────────── */}
      <PurpleVerdictDialog
        open={showResult}
        name={currentName}
        amount={amountToDrink}
        cards={drawnCards}
        onDismiss={closeResult}
      >
        <Button
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          onClick={closeResult}
        >
          {t('nextTurn', { name: nextPlayer?.name ?? '' })}
        </Button>
      </PurpleVerdictDialog>
    </>
  )
}
