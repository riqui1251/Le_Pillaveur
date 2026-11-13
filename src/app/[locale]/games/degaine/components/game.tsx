"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { Flag, RotateCcw, Swords, Trophy, Volume2, VolumeX } from 'lucide-react'
import type { Player } from '@/lib/players'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { CONFETTI_COLORS, fireConfetti, preloadConfetti } from '@/components/online/EndConfetti'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { useGameSounds } from '@/hooks/useGameSounds'
import { useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { playGameSound } from '@/lib/sound/game-sounds'
import {
  DEGAINE_DRINKS,
  DEGAINE_SAVE_ID,
  DEGAINE_SAVE_VERSION,
  champion,
  chooseDuellists,
  closeDuel,
  createDegaineGame,
  currentRoundRecord,
  degaineDrinks,
  degaineSoftPointsLost,
  degaineTally,
  duelDeadline,
  duelSignalAt,
  findMatch,
  finishFreePlay,
  freeRanking,
  interruptDuel,
  isResumableDegaineSave,
  markReady,
  nextRound,
  openDuel,
  otherSide,
  rematch,
  restoreDegaineSave,
  roundKind,
  showSignal,
  tapDuel,
  timeoutDuel,
  toDegaineSave,
  tournamentRanking,
  type DegaineSave,
  type DegaineSettings,
  type DegaineState,
  type DegaineTally,
  type DuelSide,
} from '@/lib/degaine/engine'
import { stageRef } from '@/lib/degaine/display'
import { DuelArena } from './arena'
import { BracketView, FreePicker, NextDuelCard, TallyRow } from './board'
import { useDegaineText } from './use-degaine-text'

interface GameProps {
  players: Player[]
  settings: DegaineSettings
  /** Figée au clic « Commencer » : gorgées (alcool) ou points (Sans alcool). */
  ambiance: AmbianceMode
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

const HEADER_BUTTON = 'border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold'

export default function Game({ players, settings, ambiance, onGameEnd, updatePlayerStats }: GameProps) {
  const text = useDegaineText(ambiance)
  const tc = useTranslations('common')
  const locale = useLocale()
  const [confirmDialog, confirm] = useConfirmAction()
  const { muted, toggleMuted } = useGameSounds()

  // La partie (tableau, manches, verdicts) vit dans le moteur pur src/lib/degaine/engine.ts ;
  // ici, la mesure des instants et l'affichage.
  const [game, setGame] = useState<DegaineState | null>(null)
  /**
   * Dernier état, lu par les touchers et la boucle d'images : deux doigts traités dans la même
   * image doivent voir chacun l'effet de l'autre, sans attendre le rendu.
   */
  const gameRef = useRef<DegaineState | null>(null)
  const [started, setStarted] = useState(false)
  /** Duel libre : les deux duellistes choisis, le premier en haut de l'écran. */
  const [picked, setPicked] = useState<string[]>(() => (players.length === 2 ? players.map(p => p.id) : []))
  /** Téléphone posé entre deux joueurs face à face ; faux sur un ordinateur (souris, clavier). */
  const [faceToFace, setFaceToFace] = useState(true)
  const gameCountedRef = useRef(false)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)

  // La table seule dans le prédicat : la pré-partie revient aux réglages par défaut après un rechargement,
  // la partie sauvegardée reprend avec les siens.
  const session = useResumableLocalGame<DegaineSave>(DEGAINE_SAVE_ID, DEGAINE_SAVE_VERSION, (s) =>
    isResumableDegaineSave(s, players.map(p => p.id))
  )
  const { save: saveSession, clear: clearSession } = session

  const msFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale])
  const formatMs = useCallback((ms: number) => text('arena.ms', { ms: msFormat.format(ms) }), [text, msFormat])

  /** `sync` : rendu immédiat, pour que le signal soit peint dans l'image qui l'horodate. */
  const commit = useCallback((next: DegaineState, sync = false) => {
    if (next === gameRef.current) return
    gameRef.current = next
    if (sync) flushSync(() => setGame(next))
    else setGame(next)
  }, [])

  useEffect(() => {
    preloadConfetti()
    try {
      setFaceToFace(!window.matchMedia('(hover: hover) and (pointer: fine)').matches)
    } catch {
      // matchMedia absent : on reste sur le téléphone posé entre deux joueurs
    }
  }, [])

  // Partie neuve seulement quand la reprise a été lue ET tranchée.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    gameCountedRef.current = false
    commit(createDegaineGame({ playerIds: players.map(p => p.id), settings, seed: randomSeed() }))
    setStarted(true)
  }, [session.ready, session.pending, started, players, settings, commit])

  // Sauvegarde à chaque manche inscrite ou duel choisi (les images du signal n'y changent rien) ;
  // une partie finie ne laisse rien derrière elle.
  const saveKey = game
    ? [game.rngState, game.log.length, game.currentMatch ?? '', game.freeMatches.length, game.finished ? 1 : 0].join('|')
    : null
  useEffect(() => {
    const state = gameRef.current
    if (!started || !state || saveKey === null) return
    const save = toDegaineSave(state)
    if (save) saveSession(save)
    else clearSession()
  }, [started, saveKey, saveSession, clearSession])

  // Partie finie (champion, ou fin des duels libres) : créditée une fois, sur-le-champ.
  useEffect(() => {
    if (!game?.finished || gameCountedRef.current) return
    gameCountedRef.current = true
    const tally = degaineTally(game)
    const soft = ambiance === 'soft'
    const tournament = game.settings.format === 'tournament'
    const winnerId = tournament ? champion(game.bracket) : null
    const leaders = new Set(
      tournament ? [] : freeRanking(game).filter(row => row.rank === 1 && tally[row.playerId].matchesWon > 0).map(row => row.playerId)
    )
    for (const playerId of game.playerIds) {
      const row = tally[playerId]
      if (!row || (!tournament && row.roundsPlayed === 0)) continue
      const wins = (tournament ? playerId === winnerId : leaders.has(playerId)) ? 1 : 0
      updatePlayerStats(playerId, 'degaine', soft ? { gamesPlayed: 1, wins } : { gamesPlayed: 1, wins, totalDrinks: degaineDrinks(row) })
    }
    clearSession()
  }, [game, ambiance, updatePlayerStats, clearSession])

  // Un appel, l'écran qui se verrouille : une attente ou un « FEU ! » n'a plus de sens.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      const state = gameRef.current
      if (state) commit(interruptDuel(state))
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [commit])

  const duelPhase = game?.duel?.phase ?? null
  const duelSeq = game?.duelSeq ?? 0
  const clockOn = duelPhase === 'waiting' || duelPhase === 'decoy' || duelPhase === 'fire'

  // Boucle d'images de l'attente : chaque signal (leurre, « FEU ! ») est rendu DANS l'image dont
  // l'horodatage devient son instant d'affichage ; le temps de réaction part de là.
  useEffect(() => {
    if (!clockOn) return
    let frame = 0
    let stopped = false
    const tick = (now: number) => {
      if (stopped) return
      const state = gameRef.current
      const duel = state?.duel
      if (!state || !duel) return
      if (duel.phase === 'waiting' || duel.phase === 'decoy') commit(showSignal(state, duelSignalAt(duel, now), now), true)
      else if (duel.phase === 'fire') commit(timeoutDuel(state, now))
      else return
      if (!stopped) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      stopped = true
      window.cancelAnimationFrame(frame)
    }
  }, [clockOn, duelSeq, commit])

  // Fenêtre du perdant (1,5 s) : le verdict se fige à l'échéance, même si personne ne touche plus.
  const deadline = game?.duel ? duelDeadline(game.duel) : null
  useEffect(() => {
    if (deadline === null || duelPhase !== 'result') return
    const timer = window.setTimeout(() => {
      const state = gameRef.current
      if (state) commit(timeoutDuel(state, performance.now()))
    }, Math.max(0, deadline - performance.now()) + 20)
    return () => window.clearTimeout(timer)
  }, [deadline, duelPhase, commit])

  const screen = !game ? null : game.duel ? 'arena' : game.finished ? 'end' : 'board'

  // La barre d'action change avec l'écran : le focus clavier retombait sur <body>.
  useEffect(() => {
    if (screen === 'end') {
      endTitleRef.current?.focus()
      return
    }
    if (screen !== 'board') return
    const active = document.activeElement
    if (active && active !== document.body) return
    actionBarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [screen])

  const hasWinner = game?.finished
    ? game.settings.format === 'tournament' || game.log.some(record => record.decided)
    : false
  useEffect(() => {
    if (screen !== 'end' || !hasWinner) return
    playGameSound('victory')
    fireConfetti({ particleCount: 90, spread: 80, origin: { x: 0.5, y: 0.3 }, colors: CONFETTI_COLORS })
  }, [screen, hasWinner])

  const press = useCallback(
    (side: DuelSide, at: number) => {
      const state = gameRef.current
      const duel = state?.duel
      if (!state || !duel) return
      const next = duel.phase === 'ready' ? markReady(state, side, at) : tapDuel(state, side, at)
      if (next === state) return
      commit(next)
      const after = next.duel
      if (duel.phase !== 'result' && after?.phase === 'result') {
        playGameSound(after.falseStart !== null || after.outcome === 'double-false-start' ? 'skip' : 'shot')
      }
    },
    [commit]
  )

  const onNextRound = useCallback(() => {
    const state = gameRef.current
    if (state) commit(nextRound(state))
  }, [commit])
  const onRematch = useCallback(() => {
    const state = gameRef.current
    if (state) commit(rematch(state))
  }, [commit])
  // Un verdict déjà tombé (fenêtre du perdant en cours) est inscrit avant de fermer ;
  // une attente ou un « FEU ! » sans tir est simplement annulé.
  const onCloseArena = useCallback(() => {
    const state = gameRef.current
    if (state) commit(closeDuel(interruptDuel(state)))
  }, [commit])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    const restored = isResumableDegaineSave(saved, players.map(p => p.id))
      ? restoreDegaineSave(saved, players.map(p => p.id))
      : null
    if (!restored) {
      session.discard()
      return
    }
    gameCountedRef.current = false
    const current = restored.currentMatch ? findMatch(restored, restored.currentMatch) : null
    if (restored.settings.format === 'free' && current?.a && current.b && !current.winner) setPicked([current.a, current.b])
    commit(restored)
    setStarted(true)
  }

  // « Rejouer » et ↺ gardent les réglages de la partie en cours (ceux d'une partie reprise compris).
  const newGame = () => {
    gameCountedRef.current = false
    const current = gameRef.current
    commit(createDegaineGame({ playerIds: players.map(p => p.id), settings: current ? current.settings : settings, seed: randomSeed() }))
  }

  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok) newGame()
  }

  /** Duel libre : pas de fin naturelle, la table s'arrête quand elle veut et voit le bilan. */
  const askFinish = async () => {
    const state = gameRef.current
    if (!state) return
    if (state.log.length === 0) {
      clearSession()
      onGameEnd()
      return
    }
    const ok = await confirm({
      title: text('endConfirm.title'),
      description: text('endConfirm.description'),
      confirmLabel: text('endConfirm.confirm'),
      cancelLabel: text('endConfirm.cancel'),
      tone: 'primary',
    })
    const latest = gameRef.current
    if (ok && latest) commit(finishFreePlay(latest))
  }

  const togglePick = (id: string) =>
    setPicked(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id].slice(-2)))

  const startDuel = () => {
    const state = gameRef.current
    if (!state) return
    if (state.settings.format === 'free') {
      if (picked.length !== 2) return
      commit(openDuel(chooseDuellists(state, picked[0], picked[1])))
    } else {
      commit(openDuel(state))
    }
  }

  const playerById = (id: string | null | undefined) => (id ? players.find(p => p.id === id) : undefined)
  const costOf = (row: DegaineTally | undefined) => {
    if (!row || !game) return ''
    return ambiance === 'soft'
      ? text('end.pointsLost', { count: degaineSoftPointsLost(row, game.settings.format) })
      : tc('sipsCount', { count: degaineDrinks(row) })
  }
  const bestOf = (row: DegaineTally | undefined) =>
    row && row.bestReactionMs !== null ? text('end.best', { time: formatMs(row.bestReactionMs) }) : text('end.noBest')
  /** Tour où un joueur est tombé (« Demi-finale »). */
  const stageName = (round: number) => {
    const ref = stageRef(roundKind(game?.bracket.length ?? 1, round), round)
    return text(ref.key, ref.values)
  }

  if (!session.ready) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  if (!game) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>

  const tournament = game.settings.format === 'tournament'
  const record = game.duel?.phase === 'result' ? currentRoundRecord(game) : null

  // ─── Annonces (une région montée en permanence, quel que soit l'écran) ──────
  let liveText = ''
  if (record) {
    if (record.outcome === 'tie') liveText = text('arena.live.tie')
    else if (record.outcome === 'no-shot') liveText = text('arena.live.noShot')
    else if (record.outcome === 'double-false-start') liveText = text('arena.live.double')
    else if (record.winner) {
      const loser = otherSide(record.winner)
      const loserKind = record.kinds[loser]
      const winnerMs = record.reactionMs[record.winner]
      liveText =
        loserKind === 'early' || loserKind === 'decoy' || winnerMs === null
          ? text('arena.live.falseStart', { name: playerById(record[loser])?.name ?? '' })
          : text('arena.live.win', { name: playerById(record[record.winner])?.name ?? '', time: formatMs(winnerMs) })
    }
  }

  const tally = degaineTally(game)
  const winnerId = tournament ? champion(game.bracket) : null
  const freeRows = tournament ? [] : freeRanking(game)
  const leaders = freeRows.filter(row => row.rank === 1 && (tally[row.playerId]?.matchesWon ?? 0) > 0)
  let endTitle = ''
  if (game.finished) {
    if (tournament) endTitle = text('end.champion', { name: playerById(winnerId)?.name ?? '' })
    else if (leaders.length === 1) endTitle = text('end.freeLeader', { name: playerById(leaders[0].playerId)?.name ?? '' })
    else if (leaders.length > 1) endTitle = text('end.freeTie')
    else endTitle = text('end.freeNone')
    if (screen === 'end') liveText = endTitle
  }

  const live = (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {liveText}
    </p>
  )

  // ─── Duel ──────────────────────────────────────────────────────────────────
  if (game.duel) {
    return (
      <>
        {confirmDialog}
        {live}
        <DuelArena
          state={game}
          players={players}
          ambiance={ambiance}
          faceToFace={faceToFace}
          text={text}
          formatMs={formatMs}
          onPress={press}
          onNextRound={onNextRound}
          onRematch={onRematch}
          onClose={onCloseArena}
        />
      </>
    )
  }

  // ─── Fin de partie ─────────────────────────────────────────────────────────
  if (game.finished) {
    const winner = playerById(winnerId)
    return (
      <>
        {confirmDialog}
        {live}
        <GameShell title={text('title')} onBack={onGameEnd} maxWidth={640}>
          <section className="flex flex-col items-center gap-2 text-center">
            {winner ? (
              <PlayerIcon player={winner} size="lg" className="h-20 w-20 text-6xl" />
            ) : (
              <Trophy aria-hidden className="h-10 w-10 text-gold" />
            )}
            <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
              {endTitle}
            </h2>
            {winner && (
              <p className="text-base text-cream/80">
                {text('end.championPrize', { name: winner.name, count: DEGAINE_DRINKS.championGives })}
              </p>
            )}
          </section>

          <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <h3 className="mb-2 px-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {text(tournament ? 'end.rankingTournament' : 'end.rankingFree')}
            </h3>
            <ol className="space-y-2">
              {tournament
                ? tournamentRanking(game).map(row => {
                    const player = playerById(row.playerId)
                    if (!player) return null
                    const stage = row.playerId === winnerId ? text('end.reachedChampion') : stageName(row.lostRound ?? 0)
                    return (
                      <TallyRow
                        key={row.playerId}
                        rank={row.rank}
                        player={player}
                        highlight={row.playerId === winnerId}
                        detail={`${stage} · ${bestOf(tally[row.playerId])}`}
                        cost={costOf(tally[row.playerId])}
                      />
                    )
                  })
                : freeRows.map(row => {
                    const player = playerById(row.playerId)
                    if (!player) return null
                    const stats = tally[row.playerId]
                    return (
                      <TallyRow
                        key={row.playerId}
                        rank={row.rank}
                        player={player}
                        highlight={leaders.some(leader => leader.playerId === row.playerId)}
                        detail={`${text('board.free.duelsWon', { count: stats?.matchesWon ?? 0 })} · ${bestOf(stats)}`}
                        cost={costOf(stats)}
                      />
                    )
                  })}
            </ol>
          </section>

          <EndActionDock
            voiceGutter={false}
            feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="degaine" />}
          >
            <Button variant="primary" size="gameLg" className="w-full" onClick={newGame}>
              <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
              {tc('replay')}
            </Button>
            <Button variant="quiet" size="game" className="w-full" onClick={onGameEnd}>
              {tc('quit')}
            </Button>
          </EndActionDock>
        </GameShell>
      </>
    )
  }

  // ─── Tableau (tournoi) ou choix des duellistes (duel libre) ────────────────
  const current = game.currentMatch ? findMatch(game, game.currentMatch) : null
  const seats: Record<string, 'top' | 'bottom'> = {}
  let resumable = false
  if (tournament) {
    resumable = Boolean(current && current.wins.a + current.wins.b > 0)
  } else {
    const samePairOpen = Boolean(
      current?.a && current.b && !current.winner && picked.includes(current.a) && picked.includes(current.b)
    )
    resumable = samePairOpen && Boolean(current && current.wins.a + current.wins.b > 0)
    const order = samePairOpen && current?.a && current.b ? [current.a, current.b] : picked
    if (order[0]) seats[order[0]] = 'top'
    if (order[1]) seats[order[1]] = 'bottom'
  }
  const canStart = tournament ? Boolean(current) : picked.length === 2
  const bestOf3 = game.settings.roundsPerDuel === 3

  // Sans « au meilleur des 3 », tronqué à 375 px : la carte du prochain duel ou le choix des duellistes le rappelle.
  const subtitle = tournament ? text('board.subtitle.tournament', { count: players.length }) : text('board.subtitle.free')

  const headerRight = (
    <>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={toggleMuted}
        aria-label={muted ? text('game.soundOn') : text('game.soundOff')}
        className={HEADER_BUTTON}
      >
        {muted ? <VolumeX aria-hidden className="h-5 w-5" /> : <Volume2 aria-hidden className="h-5 w-5" />}
      </Button>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={() => void askRestart()}
        aria-label={tc('confirmRestart.confirm')}
        className={HEADER_BUTTON}
      >
        <RotateCcw aria-hidden className="h-5 w-5" />
      </Button>
    </>
  )

  const actionBar = (
    <div ref={actionBarRef} className="flex w-full gap-2">
      {!tournament && game.log.length > 0 && (
        <Button
          variant="quiet"
          size="gameLg"
          className="shrink-0 whitespace-normal px-4 leading-tight"
          onClick={() => void askFinish()}
        >
          <Flag aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          {text('board.free.finish')}
        </Button>
      )}
      <Button
        variant="primary"
        size="gameLg"
        className="flex-1 whitespace-normal px-3 leading-tight"
        disabled={!canStart}
        onClick={startDuel}
      >
        <Swords aria-hidden className="mr-2 h-5 w-5 shrink-0" />
        {!canStart ? text('board.free.pickTwo') : resumable ? text('board.resume') : text('board.start')}
      </Button>
    </div>
  )

  return (
    <>
      {confirmDialog}
      {live}
      <GameShell
        title={text('title')}
        headerSubtitle={subtitle}
        onBack={tournament ? onGameEnd : () => void askFinish()}
        headerRight={headerRight}
        actionBar={actionBar}
        maxWidth={640}
      >
        <div className="space-y-4">
          {tournament ? (
            <>
              {current && <NextDuelCard state={game} match={current} players={players} text={text} />}
              <BracketView state={game} players={players} text={text} />
            </>
          ) : (
            <>
              <FreePicker players={players} picked={picked} seats={seats} bestOf3={bestOf3} onToggle={togglePick} text={text} />
              {freeRows.length > 0 && (
                <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                  <h2 className="mb-2 px-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                    {text('board.free.standings')}
                  </h2>
                  <ol className="space-y-2">
                    {freeRows.map(row => {
                      const player = playerById(row.playerId)
                      if (!player) return null
                      const stats = tally[row.playerId]
                      return (
                        <TallyRow
                          key={row.playerId}
                          rank={row.rank}
                          player={player}
                          detail={`${text('board.free.duelsWon', { count: stats?.matchesWon ?? 0 })} · ${bestOf(stats)}`}
                          cost={costOf(stats)}
                        />
                      )
                    })}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
      </GameShell>
    </>
  )
}
