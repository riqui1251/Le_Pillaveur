/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUp, Check, Equal, LogOut, RefreshCw, RotateCcw, Trophy } from 'lucide-react'
import { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { EndActionDock } from '@/components/game/EndActionDock'
import { PulsingCount } from '@/components/petit-buveur/drink-feedback'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import {
  acknowledgeHiLoMiss,
  advanceHiLoTurn,
  currentHiLoPlayerId,
  DECK_SIZE,
  HI_LO_SAVE_ID,
  HI_LO_SAVE_VERSION,
  hiLoCardsPlayed,
  MAX_SAME_CARD_DRAWS,
  resolveHiLoGuess,
  restoreHiLoSave,
  startHiLoGame,
  toHiLoSave,
  upcomingHiLoPlayerId,
  type CardSuit,
  type HiLoCard,
  type HiLoEnd,
  type HiLoGuess,
  type HiLoPenalty,
  type HiLoSave,
  type HiLoState,
} from '@/lib/hi-lo/engine'
import type { GameSuit } from '@/lib/games'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { cn } from '@/lib/utils'

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
const isSpecialPlayer = (player: Player | string | null | undefined): boolean => {
  if (!player) return false;

  // Si le joueur a explicitement activé l'effet spécial dans ses préférences
  if (typeof player !== 'string' && player.preferences?.specialEffect) {
    return true;
  }

  // Sinon, vérifier si c'est un des noms spéciaux par défaut
  const name = typeof player === 'string'
    ? player.toLowerCase()
    : player?.name?.toLowerCase();
  return name === 'sim' || name === 'riqui';
}

// Durée de l'animation de retournement, puis délai avant le tour suivant après une bonne réponse.
const FLIP_MS = 600
const AUTO_NEXT_MS = 1500
// Sans animation (préférence système), la carte se montre d'un coup : on ne
// fait plus attendre la durée d'un retournement qui n'a pas lieu.
const REDUCED_REVEAL_MS = 150

const SUIT_BY_GLYPH: Record<CardSuit, GameSuit> = {
  '♠': 'spade',
  '♥': 'heart',
  '♦': 'diamond',
  '♣': 'club',
}

const CARD_SIZE = 'w-[clamp(5rem,26vw,8rem)] h-[clamp(7.5rem,39vw,12rem)]'

/**
 * Le dernier coup joué, gardé le temps du verdict : le moteur a déjà retiré
 * de la traversée celui qui vient de sortir sur une égalité, et `currentHiLoPlayerId`
 * désignerait alors le voisin, pas celui qui a deviné.
 */
type LastTurn = {
  playerId: string | null
  guess: HiLoGuess
  penalty: HiLoPenalty | null
  /** La traversée perd une série en cours (pas une série déjà à zéro). */
  streakReset: boolean
  /** Mise avant le tirage : la hausse annoncée est lue sur le moteur, pas recopiée. */
  stakeBefore: number
}

function HiLoCardFace({ card, className }: { card: HiLoCard; className?: string }) {
  return (
    <PlayingCard
      suit={SUIT_BY_GLYPH[card.suit]}
      rank={card.value}
      className={cn(
        'flex flex-col items-center justify-center font-display text-[clamp(1.5rem,8vw,2.25rem)] font-bold',
        card.color === 'red' ? 'text-suit-red' : 'text-[#24201A]',
        className
      )}
    >
      <div>{card.value}</div>
      <div>{card.suit}</div>
    </PlayingCard>
  )
}

function PlayerAvatar({ player, className, glyphClassName }: { player: Player; className?: string; glyphClassName?: string }) {
  return (
    <Avatar className={cn(className, isSpecialPlayer(player) && 'border-2 border-red-500 shadow-lg shadow-red-500/50')}>
      <AvatarImage src={player.preferences?.avatar} />
      <AvatarFallback className={cn(player.preferences?.color || 'bg-primary', glyphClassName)}>
        {player.preferences?.icon || (player.name ? player.name.charAt(0).toUpperCase() : '?')}
      </AvatarFallback>
    </Avatar>
  )
}

export default function Game({ players, onGameEnd, updatePlayerStats, gameMode }: GameProps) {
  const t = useTranslations('games.hi-lo')
  const tc = useTranslations('common')
  const format = useFormatter()
  const compliments = t.raw('compliments') as string[]
  const debMessages = t.raw('debMessages') as string[]
  const reduceMotion = useReducedMotion()
  const [confirmDialog, confirm] = useConfirmAction()

  // État pour vérifier si le composant est monté (côté client)
  const [isMounted, setIsMounted] = useState(false);

  // La partie (paquet, mise, gorgées, tour, fin) vit dans le moteur pur
  // src/lib/hi-lo/engine.ts ; ce composant ne garde que l'affichage et les
  // délais d'animation.
  const [game, setGame] = useState<HiLoState | null>(null)
  const [lastTurn, setLastTurn] = useState<LastTurn | null>(null)
  const [isFlipping, setIsFlipping] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  // Indices pour les messages aléatoires (pour éviter les problèmes d'hydratation)
  const [complimentIndex, setComplimentIndex] = useState(0)
  const [debMessageIndex, setDebMessageIndex] = useState(0)

  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<HiLoSave>(HI_LO_SAVE_ID, HI_LO_SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  /** Une partie ne doit être créditée qu'une fois : plusieurs chemins de fin
   *  (5 cartes identiques, objectif atteint, table vidée) peuvent y mener. */
  const gameCountedRef = useRef(false)
  /** Retournement en cours. Une relance pendant l'animation l'annule : sans
   *  cela, le verdict de l'ancienne partie retombait sur la nouvelle. */
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Joueurs encore en jeu (traversée) : le moteur ne connaît que des identifiants.
  const activeIds = useMemo(() => new Set(game?.activePlayerIds ?? []), [game?.activePlayerIds])

  // Vérifier si le composant est monté (côté client)
  useEffect(() => {
    setIsMounted(true);

    // Initialiser les indices aléatoires une seule fois après le montage
    setComplimentIndex(Math.floor(Math.random() * compliments.length));
    setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
  }, []);

  // Initialisation du jeu — on ne distribue rien tant qu'une reprise est
  // proposée : c'est le joueur qui tranche.
  useEffect(() => {
    if (!isMounted || !session.ready || session.pending || started) return
    initializeGame();
    setStarted(true)
  }, [isMounted, session.ready, session.pending, started]);

  // Sauvegarde continue : un onglet recyclé par le navigateur ne coûte plus la partie.
  useEffect(() => {
    if (!started || !game || game.gameOver) return
    session.save(toHiLoSave(game))
  }, [started, game]);

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Une sauvegarde d'un autre mode de jeu OU d'une autre table n'est pas
    // rejouable ici : reprendre donnerait un index de joueur hors bornes et
    // créditerait des gorgées à des gens qui n'ont pas joué.
    if (saved.gameMode !== gameMode || !isSameLocalTable(saved.playerIds, players)) {
      session.discard()
      return
    }
    // Réhydratation : les profils viennent de la prop, la sauvegarde ne
    // connaît que des identifiants. Illisible → partie neuve, pas d'écran planté.
    const restored = restoreHiLoSave(saved, players.map(p => p.id))
    if (!restored) {
      session.discard()
      return
    }
    setGame(restored)
    setLastTurn(null)
    setIsFlipping(false)
    setIsProcessing(false)
    setStarted(true)
  }

  // Bonne réponse : la main passe toute seule après un court délai (le verdict
  // « Bien vu ! Au tour de … » reste lisible le temps de passer le téléphone).
  useEffect(() => {
    if (!isMounted) return;

    if (game?.showResult && game.isCorrect && !game.gameOver && !isProcessing) {
      setIsProcessing(true)
      const timer = setTimeout(() => {
        nextTurn()
        setIsProcessing(false)
      }, AUTO_NEXT_MS)

      return () => clearTimeout(timer)
    }
  }, [game?.showResult, game?.isCorrect, isMounted]);

  // Verdict, tour suivant et fin remplacent les boutons de la barre : le focus
  // clavier retombait sur <body> (les anciennes fenêtres « mauvais choix » et
  // « fin de partie » le prenaient d'elles-mêmes). S'il s'est perdu, il revient
  // au premier bouton actif de la barre, ou au titre de l'écran de fin.
  const actionBarRef = useRef<HTMLDivElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)
  const barPhase = !game ? null : game.gameOver ? 'end' : !game.showResult ? 'guess' : game.isCorrect ? 'right' : 'miss'
  useEffect(() => {
    if (barPhase === null || barPhase === 'right') return
    const active = document.activeElement
    if (active && active !== document.body) return
    const target =
      barPhase === 'end'
        ? endTitleRef.current
        : actionBarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    // Le titre de fin peut être hors de vue (partie défilée) : on l'y ramène.
    target?.focus({ preventScroll: barPhase !== 'end' })
  }, [barPhase])

  const rollMessageIndices = () => {
    setComplimentIndex(Math.floor(Math.random() * compliments.length));
    setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
  }

  const cancelReveal = () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }

  // Quitter l'écran pendant le retournement : le minuteur appelait encore
  // endGame après le démontage (statistiques créditées, sauvegarde effacée).
  useEffect(() => () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
  }, [])

  // Initialiser le jeu
  const initializeGame = () => {
    // Nouvelle partie : elle a le droit d'être comptée à son tour.
    gameCountedRef.current = false
    cancelReveal()
    setGame(startHiLoGame({ mode: gameMode, playerIds: players.map(p => p.id), previous: game }))
    setLastTurn(null)
    setIsFlipping(false)
    setIsProcessing(false)

    // Générer de nouveaux indices aléatoires pour les messages
    if (isMounted) rollMessageIndices()
  }

  // Gérer la prédiction du joueur
  const handleGuess = (guess: HiLoGuess) => {
    if (!game || isFlipping || isProcessing) return
    const outcome = resolveHiLoGuess(game, guess)
    if (!outcome) return

    // Carte tirée face cachée, puis animation de retournement
    setGame(outcome.drawn)
    setIsFlipping(true)
    setLastTurn({
      playerId: currentHiLoPlayerId(game),
      guess,
      penalty: outcome.penalty,
      streakReset: game.correctGuessesInRow > 0 && outcome.resolved.correctGuessesInRow === 0,
      stakeBefore: game.drinkCounter,
    })

    // Attendre que l'animation soit terminée avant de montrer le résultat
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null
      setGame(outcome.resolved)
      setIsFlipping(false)
      if (outcome.end) endGame(outcome.end)
    }, reduceMotion ? REDUCED_REVEAL_MS : FLIP_MS)
  }

  // Tour suivant. Après une erreur, un seul toucher : la mise repart à 1
  // (sauf égalité non annoncée en traversée, où le cumul est conservé), puis
  // la main passe.
  const nextTurn = () => {
    if (!game) return
    const turn = advanceHiLoTurn(acknowledgeHiLoMiss(game))
    if (turn.state !== game) setGame(turn.state)
    if (turn.end) endGame(turn.end)
    setLastTurn(null)

    // Générer de nouveaux indices aléatoires pour les messages
    if (turn.advanced && isMounted) rollMessageIndices()
  }

  // Terminer le jeu : statistiques (une seule fois), sauvegarde effacée
  const endGame = (end: HiLoEnd) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true

    // Mettre à jour les statistiques des joueurs
    end.results.forEach(({ playerId, drinks, won }) => {
      updatePlayerStats(playerId, 'hi-lo', {
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        totalDrinks: drinks
      })
    })

    // Une partie terminée ne doit rien laisser derrière elle.
    session.clear()
  }

  // Redémarrer le jeu
  const restartGame = () => {
    initializeGame()
  }

  // En pleine partie, ↺ efface les gorgées de toute la table : on confirme.
  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok) restartGame()
  }

  // Quitter le jeu
  const quitGame = () => {
    onGameEnd()
  }

  // Si le composant n'est pas encore monté (côté client), afficher un état de chargement ou rien
  if (!isMounted || !session.ready) {
    return <div className="p-6 text-center text-cream/70">{t('loading')}</div>;
  }

  if (session.pending) {
    return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />;
  }

  // Première donne pas encore distribuée (un rendu, le temps de l'effet d'initialisation)
  if (!game) {
    return <div className="p-6 text-center text-cream/70">{t('loading')}</div>;
  }

  const {
    deck,
    currentCard,
    nextCard,
    drinkCounter,
    gameResults,
    sameCardCount,
    correctGuessesInRow,
    targetGuesses,
    gameOver,
    showResult,
    isCorrect,
    isUnguessedEqual,
  } = game

  const playerById = (id: string | null | undefined) => (id ? players.find(p => p.id === id) : undefined)

  // Phrase de gage du joueur (clins d'œil de la tablée compris)
  const getPersonalizedMessage = (player: Player, count: number): string => {
    const name = player.name.toLowerCase();

    if (name === 'sim' || name === 'riqui') {
      const compliment = compliments[complimentIndex];
      return t('drinkMessageSpecial', { compliment, name: player.name, count });
    }
    if (name === 'deb') {
      const message = debMessages[debMessageIndex];
      return t('drinkMessageDeb', { name: player.name, count, message });
    }

    return t('drinkMessageDefault', { name: player.name, count });
  }

  // Verdict NOMMÉ : qui boit, combien — jamais un « tu bois » anonyme.
  const describePenalty = (penalty: HiLoPenalty | null | undefined): string => {
    if (!penalty) return ''
    const drinkers = penalty.playerIds.map(id => playerById(id)).filter((p): p is Player => Boolean(p))
    if (drinkers.length === 0) return ''
    if (drinkers.length === 1) return getPersonalizedMessage(drinkers[0], penalty.drinks)
    if (drinkers.length === players.length) return t('verdict.everyone', { count: penalty.drinks })
    return t('verdict.group', {
      names: format.list(drinkers.map(p => p.name), { type: 'conjunction' }),
      count: penalty.drinks,
    })
  }

  // Joueur montré : celui qui a deviné tant que son verdict est à l'écran,
  // sinon le joueur au tour.
  const currentPlayerId = currentHiLoPlayerId(game)
  const shownPlayerId = (showResult || isFlipping) && lastTurn ? lastTurn.playerId : currentPlayerId
  const shownPlayer = playerById(shownPlayerId)
  const upcomingPlayer = showResult && !gameOver ? playerById(upcomingHiLoPlayerId(game)) : undefined

  const cardsPlayed = hiLoCardsPlayed(game)
  const fiveSameKey = nextCard ? `${nextCard.value}-${nextCard.suit}` : null
  const fiveSame = fiveSameKey !== null && (sameCardCount[fiveSameKey] ?? 0) > MAX_SAME_CARD_DRAWS
  const goalReached = gameMode === 'traversee' && correctGuessesInRow >= targetGuesses

  const missed = showResult && isCorrect === false && !gameOver
  const guessedRight = showResult && isCorrect === true && !gameOver
  const busy = isFlipping || isProcessing

  const missReason = [
    isUnguessedEqual ? t('wrong.unguessedEqual') : t('wrong.title'),
    lastTurn?.streakReset ? t('verdict.streakReset') : null,
  ].filter(Boolean).join(' · ')
  const missVerdict = describePenalty(lastTurn?.penalty)
  const rightVerdict = upcomingPlayer ? t('correctNext', { name: upcomingPlayer.name }) : ''
  const exitedPlayer =
    guessedRight && gameMode === 'traversee' && lastTurn?.guess === 'equal' ? playerById(lastTurn.playerId) : undefined
  const rightNote = exitedPlayer
    ? t('traverseeExit', { name: exitedPlayer.name })
    : t('stakeUp', { count: Math.max(0, drinkCounter - (lastTurn?.stakeBefore ?? drinkCounter)) })

  // Une seule voix pour le lecteur d'écran, montée en permanence : le verdict
  // apparaît dans la barre du bas, une région créée avec son texte se tait souvent.
  const liveText = missed ? `${missReason} ${missVerdict}` : guessedRight ? `${rightNote} ${rightVerdict}` : ''

  // ─── Écran de fin ──────────────────────────────────────────────────────────
  if (gameOver) {
    const endTitle = goalReached ? t('gameOver.congrats') : fiveSame ? t('gameOver.fiveCards') : t('gameOver.end')
    const finalVerdict = fiveSame ? describePenalty(lastTurn?.penalty) : ''
    return (
      <>
        <GameShell title={t('title')} onBack={quitGame} maxWidth={760}>
          <section className="flex flex-col items-center gap-2 text-center">
            <Trophy aria-hidden className="h-10 w-10 text-gold" />
            <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
              {endTitle}
            </h2>
            {goalReached && (
              <p className="text-base font-medium text-emerald-300">
                {t('gameOver.goalReached', { count: targetGuesses })}
              </p>
            )}
            {fiveSame && (
              <p className="text-base text-cream/80">
                {t('gameOver.fiveSame', { value: nextCard?.value ?? '', suit: nextCard?.suit ?? '' })}
              </p>
            )}
            {finalVerdict && <p className="font-display text-lg font-bold text-red-300">{finalVerdict}</p>}
          </section>

          <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              {t('gameOver.results')}
            </h3>
            <ul className="space-y-2">
              {players.map(player => (
                <li key={player.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlayerAvatar player={player} className="h-9 w-9 shrink-0" glyphClassName="text-lg" />
                    <PlayerName
                      player={player}
                      className={cn('min-w-0 truncate font-display text-base text-cream', getSpecialEffectClass(player.preferences?.specialEffect))}
                    />
                  </div>
                  <span className="shrink-0 font-display text-base font-semibold tabular-nums text-gold">
                    {t('gameOver.sipsResult', { count: gameResults[player.id] || 0 })}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <EndActionDock
            voiceGutter={false}
            feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="hi-lo" />}
          >
            <Button variant="primary" size="gameLg" className="w-full" onClick={restartGame}>
              <RefreshCw aria-hidden className="mr-2 h-5 w-5" />
              {tc('replay')}
            </Button>
            <Button variant="quiet" size="game" className="w-full" onClick={quitGame}>
              {tc('quit')}
            </Button>
          </EndActionDock>
        </GameShell>
      </>
    )
  }

  // ─── Partie en cours ───────────────────────────────────────────────────────
  // La mise, sous le pouce de celui qui va deviner : c'est elle qu'il risque.
  const stake = (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-gold/30 bg-black/20 px-3 py-1.5">
      <PulsingCount
        value={drinkCounter}
        className="inline-block font-display text-3xl font-bold leading-none tabular-nums text-gold"
      />
      <span className="flex flex-col text-xs font-semibold leading-tight text-cream/80">
        <span>{t('stakeUnit', { count: drinkCounter })}</span>
        <span>{t('stakeTag')}</span>
      </span>
    </div>
  )

  const headerRight = (
    <Button
      variant="ghost"
      size="gameIcon"
      onClick={() => void askRestart()}
      aria-label={tc('confirmRestart.confirm')}
      className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
    >
      <RotateCcw aria-hidden className="h-5 w-5" />
    </Button>
  )

  let actionBar
  if (missed) {
    actionBar = (
      <div ref={actionBarRef} className="flex w-full flex-col gap-2">
        <div className="rounded-2xl bg-suit-red px-4 py-2.5 text-center text-cream shadow-[0_10px_22px_-12px_rgba(179,56,46,0.7)]">
          <p className="text-sm font-semibold">{missReason}</p>
          <p className="font-display text-xl font-bold leading-tight">{missVerdict}</p>
        </div>
        <Button
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          onClick={nextTurn}
        >
          {upcomingPlayer ? t('nextTurnButton', { name: upcomingPlayer.name }) : tc('next')}
          <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
        </Button>
      </div>
    )
  } else if (guessedRight) {
    actionBar = (
      <div ref={actionBarRef} className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-emerald-300">{rightNote}</p>
          {stake}
        </div>
        <div className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 text-center font-display text-lg font-bold leading-tight text-emerald-300">
          <Check aria-hidden className="h-5 w-5 shrink-0" />
          <span className="line-clamp-2">{rightVerdict}</span>
        </div>
      </div>
    )
  } else {
    actionBar = (
      <div ref={actionBarRef} className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-3">
          <p className="line-clamp-2 min-w-0 flex-1 font-display text-base font-bold leading-snug text-cream">
            {shownPlayer ? t('guessPrompt', { name: shownPlayer.name }) : null}
          </p>
          {stake}
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="gameLg"
            className="flex-1 whitespace-normal px-3 leading-tight"
            onClick={() => handleGuess('higher')}
            disabled={busy}
          >
            <ArrowUp aria-hidden className="mr-1.5 h-5 w-5 shrink-0" />
            {t('higher')}
          </Button>
          <Button
            variant="quiet"
            size="gameLg"
            className="w-[5.75rem] shrink-0 whitespace-normal px-1.5 leading-tight"
            onClick={() => handleGuess('equal')}
            disabled={busy}
          >
            <Equal aria-hidden className="mr-1 h-4 w-4 shrink-0" />
            {t('equal')}
          </Button>
          <Button
            variant="primary"
            size="gameLg"
            className="flex-1 whitespace-normal px-3 leading-tight"
            onClick={() => handleGuess('lower')}
            disabled={busy}
          >
            <ArrowDown aria-hidden className="mr-1.5 h-5 w-5 shrink-0" />
            {t('lower')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {confirmDialog}
      <PassPhoneOverlay
        playerKey={shownPlayerId}
        name={shownPlayer?.name ?? ''}
        avatar={shownPlayer ? <PlayerIcon player={shownPlayer} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
      />
      <GameShell
        title={t('title')}
        onBack={quitGame}
        headerRight={headerRight}
        actionBar={actionBar}
        maxWidth={760}
        // Barre haute : mise + trois boutons de 56 px (≈ 8,5 rem), le « tall »
        // du socle (8,75 rem) ne laisse aucun air. Le verdict d'une erreur
        // (raison + phrase sur deux ou trois lignes + bouton) monte à ≈ 13 rem.
        contentClassName={
          missed
            ? 'pb-[calc(14rem+env(safe-area-inset-bottom,0px))]'
            : 'pb-[calc(11rem+env(safe-area-inset-bottom,0px))]'
        }
      >
        <p role="status" aria-live="polite" className="sr-only">{liveText}</p>

        {gameMode === 'traversee' && (
          <>
            <div className="mb-2 flex flex-wrap items-baseline justify-center gap-x-3 text-center">
              <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t('traverseeMode')}</span>
              <span className="font-display text-base font-bold text-gold">
                {t('traverseeGoal', { current: correctGuessesInRow, target: targetGuesses })}
              </span>
            </div>

            <ul className="mb-4 flex flex-wrap justify-center gap-2">
              {players.map(player => {
                const inGame = activeIds.has(player.id)
                const isTurn = player.id === shownPlayerId
                return (
                  <li
                    key={player.id}
                    aria-current={isTurn ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
                      inGame ? 'border-gold/60 bg-gold/[0.15] text-cream' : 'border-gold/20 bg-black/25 text-cream/70',
                      isTurn && 'ring-2 ring-gold'
                    )}
                  >
                    {inGame ? (
                      <span aria-hidden className="h-2 w-2 rounded-full bg-gold" />
                    ) : (
                      <LogOut aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <PlayerName player={player} />
                    {!inGame && <span className="sr-only">{t('traverseeOut')}</span>}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <div className="flex flex-col items-center gap-5">
          {/* Joueur au tour (ou celui dont on lit le verdict) */}
          {shownPlayer && (
            <div className="flex min-w-0 max-w-full items-center gap-3">
              <PlayerAvatar player={shownPlayer} className="h-12 w-12 shrink-0" glyphClassName="text-2xl" />
              <PlayerName
                player={shownPlayer}
                className={cn('min-w-0 truncate font-display text-2xl font-bold text-cream', getSpecialEffectClass(shownPlayer.preferences?.specialEffect))}
              />
            </div>
          )}

          {/* Cartes */}
          <div className="flex justify-center items-center gap-3 sm:gap-8">
            {/* Carte actuelle */}
            {currentCard && <HiLoCardFace card={currentCard} className={CARD_SIZE} />}

            {/* Carte suivante avec animation */}
            <div className={`relative ${CARD_SIZE}`}>
              {isFlipping ? (
                <motion.div
                  className="absolute w-full h-full"
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: 180 }}
                  transition={{ duration: reduceMotion ? 0 : FLIP_MS / 1000 }}
                >
                  <PlayingCardBack className="absolute w-full h-full backface-hidden" />
                  <div
                    className="absolute w-full h-full backface-hidden"
                    style={{ transform: 'rotateY(180deg)' }}
                  >
                    {nextCard ? (
                      <HiLoCardFace card={nextCard} className="h-full w-full" />
                    ) : (
                      <PlayingCard className="h-full w-full" />
                    )}
                  </div>
                </motion.div>
              ) : showResult ? (
                nextCard ? (
                  <HiLoCardFace card={nextCard} className="h-full w-full" />
                ) : (
                  <PlayingCard className="h-full w-full" />
                )
              ) : (
                <PlayingCardBack className="w-full h-full" />
              )}
            </div>
          </div>

          {/* Indicateur de progression du paquet de cartes */}
          <div className="w-full max-w-xs">
            <div className="h-2 bg-black/30 rounded-full overflow-hidden">
              <div
                // Rouge clair : bg-suit-red tombait à 2,1:1 sur le feutre, la
                // jauge disparaissait au moment où le paquet s'épuise.
                className={`h-full transition-all duration-300 ease-in-out ${deck.length < 10 ? 'bg-red-400' : 'bg-gold'}`}
                style={{ width: `${(cardsPlayed / DECK_SIZE) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1 text-cream/70">
              <span>{t('cardsPlayedLabel', { count: cardsPlayed })}</span>
              <span>{t('cardsLeftLabel', { count: deck.length + (nextCard ? 1 : 0) })}</span>
            </div>
          </div>
        </div>
      </GameShell>

      <style jsx global>{`
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
      `}</style>
    </>
  )
}
