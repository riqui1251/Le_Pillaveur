"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowDown, ArrowRight, ArrowUp, Hand, RefreshCw, RotateCcw, RotateCw, Smartphone, Trophy, Volume2, VolumeX } from 'lucide-react'
import type { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { useGameSounds } from '@/hooks/useGameSounds'
import { useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { playGameSound } from '@/lib/sound/game-sounds'
import {
  FC_BEST_BONUS,
  FC_SAVE_ID,
  FC_SAVE_VERSION,
  cancelTurn,
  createGame,
  currentGuesserId,
  endTurn,
  extendPhase,
  flagSaid,
  isPhaseOver,
  markFound,
  markPassed,
  nextTurn,
  playerResults,
  ranking,
  restoreFcSave,
  startCountdown,
  startPlaying,
  summarizeLog,
  teamOfPlayer,
  toFcSave,
  turnSummary,
  unflagSaid,
  upcomingGuesserId,
  type FcAmbiance,
  type FcRankEntry,
  type FcSave,
  type FcSettings,
  type FcState,
  type FcWord,
} from '@/lib/front-colle/engine'
import type { TiltGesture } from '@/lib/front-colle/tilt'
import { cn } from '@/lib/utils'
import { Arena, type SensorStatus } from './arena'
import { Recap } from './recap'
import { requestTiltPermission, vibrate, type TiltPermission } from './device'

interface GameProps {
  players: Player[]
  settings: FcSettings
  words: FcWord[]
  /** Ambiance figée au clic « Commencer » : gorgées ou points. */
  ambiance: FcAmbiance
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

// Barre d'action à une rangée (bouton de 56 px) sous un texte court : un peu plus que le padding par défaut.
const BAR_PADDING = 'pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]'

export default function Game({ players, settings, words, ambiance, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.front-colle')
  const tc = useTranslations('common')
  const format = useFormatter()
  const [confirmDialog, confirm] = useConfirmAction()
  const { muted, toggleMuted } = useGameSounds()

  const [game, setGame] = useState<FcState | null>(null)
  const [started, setStarted] = useState(false)
  // Choix « Retourner » gardé pour toute la partie ; côté lu par le capteur, d'un tour à l'autre.
  const [flipped, setFlipped] = useState(false)
  const [side, setSide] = useState<1 | -1 | null>(null)
  const [permission, setPermission] = useState<TiltPermission>('granted')
  const [sensor, setSensor] = useState<SensorStatus>('unknown')
  const [stopping, setStopping] = useState(false)
  const [liveText, setLiveText] = useState('')

  // La table seule (et une sauvegarde lisible) : la partie reprend avec SES réglages,
  // la pré-partie revenant aux valeurs par défaut à chaque chargement de la page.
  const session = useResumableLocalGame<FcSave>(FC_SAVE_ID, FC_SAVE_VERSION, (save) =>
    restoreFcSave(save, players.map((player) => player.id), words) !== null
  )
  const { save: saveSession, clear: clearSession } = session
  /** « Arrêter ce tour ? » ouvert : le chrono est gelé (lu par le réveil et les gestes, plus rapides qu'un rendu). */
  const stoppingRef = useRef(false)
  /** Une partie n'est créditée qu'une fois. */
  const gameCountedRef = useRef(false)
  /** Dernier état connu, lu par les gestes et les échéances (plus rapides qu'un rendu). */
  const gameRef = useRef<FcState | null>(game)
  gameRef.current = game
  const startingRef = useRef(false)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)

  const wordsById = useMemo(() => new Map(words.map((entry) => [entry.id, entry])), [words])
  const playerById = (id: string | null | undefined) => (id ? players.find((player) => player.id === id) : undefined)

  const commit = (next: FcState) => {
    gameRef.current = next
    setGame(next)
  }

  const newGame = (previous: FcState | null) => {
    gameCountedRef.current = false
    startingRef.current = false
    stoppingRef.current = false
    setStopping(false)
    // « Rejouer », « Recommencer » : les réglages de la partie jouée, ceux d'une sauvegarde reprise compris.
    commit(
      createGame({
        settings: previous?.settings ?? settings,
        playerIds: players.map((player) => player.id),
        seed: randomSeed(),
        deckUsed: previous?.deckUsed,
      })
    )
  }

  // Partie neuve seulement quand la reprise a été lue ET tranchée.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    newGame(null)
    setStarted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- newGame lit la table et les réglages du moment, une fois
  }, [session.ready, session.pending, started])

  // Sauvegarde continue : jamais avant `started` (elle écraserait la proposition de reprise), jamais après la fin.
  useEffect(() => {
    if (!started || !game || game.roundPhase === 'finished') return
    saveSession(toFcSave(game))
  }, [started, game, saveSession])

  // Échéances du décompte et du chrono : un réveil calé sur l'heure, réarmé au retour d'onglet (iOS gèle les minuteurs).
  const phase = game?.roundPhase
  const phaseEndsAt = game?.phaseEndsAt ?? null
  useEffect(() => {
    if (stopping || (phase !== 'countdown' && phase !== 'playing') || phaseEndsAt === null) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const check = () => {
      const current = gameRef.current
      if (!current || !isPhaseOver(current, Date.now())) return false
      if (current.roundPhase === 'countdown') {
        commit(startPlaying(current, words, Date.now()))
        playGameSound('reveal')
      } else {
        commit(endTurn(current))
        playGameSound('dice-result')
        vibrate([80, 60, 80])
        setLiveText(t('recap.title'))
      }
      return true
    }
    const arm = () => {
      if (timer) clearTimeout(timer)
      timer = null
      // Question « Arrêter ce tour ? » ouverte : rien n'expire, l'effet se réarme à sa fermeture.
      if (stoppingRef.current || check()) return
      timer = setTimeout(arm, Math.max(0, phaseEndsAt - Date.now()) + 20)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') arm()
    }
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seuls la phase, son échéance et la question d'arrêt réarment le réveil
  }, [phase, phaseEndsAt, stopping])

  // L'écran change (prêt, récapitulatif, fin) : le focus perdu revient au bouton de la barre ou au titre de fin.
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'recap' && phase !== 'finished') return
    const active = document.activeElement
    if (active && active !== document.body) return
    const target =
      phase === 'finished'
        ? endTitleRef.current
        : actionBarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    target?.focus({ preventScroll: phase !== 'finished' })
  }, [phase, game?.turnIndex])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Autre table ou sauvegarde illisible : partie neuve plutôt qu'un écran planté.
    const restored = restoreFcSave(saved, players.map((player) => player.id), words)
    if (!restored) {
      session.discard()
      return
    }
    gameCountedRef.current = false
    commit(restored)
    setStarted(true)
  }

  const finishGame = (finished: FcState) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    for (const result of playerResults(finished, ambiance)) {
      updatePlayerStats(result.playerId, 'front-colle', {
        gamesPlayed: 1,
        wins: result.won ? 1 : 0,
        totalDrinks: result.drinks,
      })
    }
    clearSession()
    playGameSound('victory')
  }

  const handleReady = () => {
    const current = gameRef.current
    if (!current || current.roundPhase !== 'ready' || startingRef.current) return
    startingRef.current = true
    // Premier son DANS le geste : iOS n'ouvre l'audio qu'ainsi. Il marque aussi le « 3 ».
    playGameSound('tick')
    // Demande d'accès au capteur (iOS) dans le même geste, avant tout await.
    void requestTiltPermission()
      .then((answer) => {
        setPermission(answer)
        const latest = gameRef.current
        if (latest && latest.roundPhase === 'ready') {
          commit(startCountdown(latest, Date.now()))
          setLiveText(t('arena.getReady'))
        }
      })
      .finally(() => {
        startingRef.current = false
      })
  }

  const handleGesture = (gesture: TiltGesture): boolean => {
    const current = gameRef.current
    if (stoppingRef.current || !current || current.roundPhase !== 'playing' || !current.current) return false
    const next = gesture === 'found' ? markFound(current, words, Date.now()) : markPassed(current, words, Date.now())
    if (next === current) return false
    commit(next)
    playGameSound(gesture === 'found' ? 'correct' : 'skip')
    vibrate(gesture === 'found' ? 40 : [30, 50, 30])
    // Le compte change à chaque geste : un texte identique au précédent ne serait pas relu.
    const tally = summarizeLog(next.turnLog)
    setLiveText(
      gesture === 'found'
        ? t('arena.liveFound', { count: tally.found })
        : t('arena.livePassed', { count: tally.passed })
    )
    return true
  }

  const askStop = async () => {
    const current = gameRef.current
    if (stoppingRef.current || !current) return
    if (current.roundPhase !== 'countdown' && current.roundPhase !== 'playing') return
    // Chrono gelé pendant la question : « Continuer » rend le temps passé dans la boîte.
    const pausedAt = Date.now()
    stoppingRef.current = true
    setStopping(true)
    const ok = await confirm({
      title: t('arena.stopConfirm.title'),
      description: t('arena.stopConfirm.description'),
      confirmLabel: t('arena.stopConfirm.confirm'),
      cancelLabel: t('arena.stopConfirm.cancel'),
      tone: 'danger',
    })
    stoppingRef.current = false
    setStopping(false)
    // Tour relancé : la prochaine annonce (« Colle le téléphone… ») doit différer de la dernière pour être relue.
    if (ok) setLiveText('')
    const latest = gameRef.current
    if (latest) commit(ok ? cancelTurn(latest) : extendPhase(latest, Date.now() - pausedAt))
  }

  const advance = () => {
    const current = gameRef.current
    if (!current || current.roundPhase !== 'recap') return
    const next = nextTurn(current)
    commit(next)
    if (next.roundPhase === 'finished') finishGame(next)
  }

  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok) newGame(gameRef.current)
  }

  if (!session.ready) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  if (!game) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>

  const soft = ambiance === 'soft'
  const teams = game.settings.teamMode === 'teams'
  const guesserId = currentGuesserId(game)
  const guesser = playerById(guesserId)
  const guesserTeam = teams && guesserId ? teamOfPlayer(game.playerIds, guesserId) : null
  const progress = t('progress', { current: Math.min(game.turnIndex + 1, game.order.length), total: game.order.length })
  const entries = ranking(game, ambiance)
  const entryName = (entry: FcRankEntry) => (entry.team ? t(`teams.${entry.team}`) : (playerById(entry.id)?.name ?? ''))
  // Sans alcool, le bonus du meilleur score ne compte qu'au classement final.
  const entryScore = (entry: FcRankEntry, final: boolean) =>
    soft
      ? t('soft.end.points', { count: final ? entry.total : entry.score })
      : t('end.foundCount', { count: entry.found })

  const headerRight = (
    <>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={toggleMuted}
        aria-label={muted ? t('ready.soundOn') : t('ready.soundOff')}
        className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
      >
        {muted ? <VolumeX aria-hidden className="h-5 w-5" /> : <Volume2 aria-hidden className="h-5 w-5" />}
      </Button>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={() => void askRestart()}
        aria-label={tc('confirmRestart.confirm')}
        className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
      >
        <RotateCcw aria-hidden className="h-5 w-5" />
      </Button>
    </>
  )

  let screen: ReactNode

  if (game.roundPhase === 'finished') {
    // ─── Fin de partie : classement ──────────────────────────────────────────
    const winners = entries.filter((entry) => entry.best)
    const winnerNames = winners.map(entryName).join(', ')
    screen = (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640}>
        <section className="flex flex-col items-center gap-2 text-center">
          <Trophy aria-hidden className="h-10 w-10 text-gold" />
          <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
            {t('end.title')}
          </h2>
          <p className="max-w-md text-base text-cream/80">
            {winners.length === 0
              ? soft
                ? t('soft.end.noBest')
                : t('end.noBest')
              : soft
                ? t('soft.end.bestLine', { names: winnerNames, count: FC_BEST_BONUS, winners: winners.length })
                : t('end.bestLine', { names: winnerNames, count: FC_BEST_BONUS, winners: winners.length })}
          </p>
        </section>

        <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('end.results')}</h3>
          <ol className="space-y-2">
            {entries.map((entry) => {
              const player = entry.team ? undefined : playerById(entry.id)
              const members = entry.team
                ? entry.playerIds
                    .map((id) => playerById(id)?.name ?? '')
                    .filter(Boolean)
                    .join(', ')
                : ''
              // Alcool : le score affiché est déjà le nombre de mots trouvés.
              const details = soft
                ? [t('end.detail', { found: entry.found, passed: entry.passed })]
                : [t('arena.passedCount', { count: entry.passed })]
              if (entry.said > 0) details.push(t('end.saidCount', { count: entry.said }))
              if (!soft && entry.drinks > 0) details.push(t('end.drinks', { count: entry.drinks }))
              return (
                <li
                  key={entry.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl px-3 py-2',
                    entry.best ? 'border border-gold/60 bg-gold/[0.15]' : 'bg-black/20'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-6 shrink-0 text-center font-display text-base font-bold tabular-nums text-gold">
                      {format.number(entry.rank)}
                    </span>
                    {player && <PlayerIcon player={player} size="md" />}
                    <div className="min-w-0">
                      {player ? (
                        <PlayerName player={player} className="block min-w-0 truncate font-display text-base text-cream" />
                      ) : (
                        <span className="block truncate font-display text-base font-bold text-cream">{entryName(entry)}</span>
                      )}
                      {members && <span className="block truncate text-xs text-cream/70">{members}</span>}
                      <span className="block text-xs text-cream/70">{details.join(' · ')}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-right font-display text-base font-semibold tabular-nums text-gold">
                    {entryScore(entry, true)}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="front-colle" />}
        >
          <Button variant="primary" size="gameLg" className="w-full" onClick={() => newGame(gameRef.current)}>
            <RefreshCw aria-hidden className="mr-2 h-5 w-5" />
            {tc('replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" onClick={onGameEnd}>
            {tc('quit')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  } else if (game.roundPhase === 'countdown' || game.roundPhase === 'playing') {
    // ─── Tour en cours : arène plein écran (décompte puis jeu) ───────────────
    const tally = summarizeLog(game.turnLog)
    const currentWord = game.current ? (wordsById.get(game.current.wordId) ?? null) : null
    screen = (
      <Arena
        phase={game.roundPhase}
        phaseEndsAt={game.phaseEndsAt ?? 0}
        durationMs={game.settings.durationSec * 1000}
        word={currentWord}
        mode={game.current?.mode ?? null}
        found={tally.found}
        passed={tally.passed}
        flipped={flipped}
        side={side}
        onSide={setSide}
        permission={permission}
        sensor={sensor}
        onSensor={setSensor}
        onGesture={handleGesture}
        onStop={() => void askStop()}
        paused={stopping}
      />
    )
  } else if (game.roundPhase === 'recap') {
    // ─── Récapitulatif du tour ───────────────────────────────────────────────
    const summary = turnSummary(game)
    const upcoming = playerById(upcomingGuesserId(game))
    const lastTurn = game.turnIndex + 1 >= game.order.length || !upcoming
    const actionBar = (
      <div ref={actionBarRef} className="flex w-full flex-col gap-2">
        <Button variant="primary" size="gameLg" className="w-full whitespace-normal leading-tight" onClick={advance}>
          {lastTurn ? t('recap.toRanking') : t('recap.next', { name: upcoming.name })}
          {lastTurn ? (
            <Trophy aria-hidden className="ml-2 h-5 w-5 shrink-0" />
          ) : (
            <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
          )}
        </Button>
      </div>
    )
    screen = (
      <GameShell
        title={t('title')}
        headerSubtitle={progress}
        onBack={onGameEnd}
        headerRight={headerRight}
        actionBar={actionBar}
        maxWidth={640}
        contentClassName={BAR_PADDING}
      >
        <section className="mb-4 flex flex-col items-center gap-1 text-center">
          <h2 className="font-display text-2xl font-bold text-gold">{t('recap.title')}</h2>
          <p className="text-sm text-cream/80">
            {t('recap.summary', { name: guesser?.name ?? '', found: summary.found, passed: summary.passed })}
          </p>
        </section>
        <Recap
          log={game.turnLog}
          wordsById={wordsById}
          summary={summary}
          guesser={guesser}
          others={players.filter((player) => player.id !== guesserId)}
          ambiance={ambiance}
          onFlag={(playerId) => {
            const current = gameRef.current
            if (current) commit(flagSaid(current, playerId))
          }}
          onUndo={() => {
            const current = gameRef.current
            if (current) commit(unflagSaid(current))
          }}
        />
      </GameShell>
    )
  } else {
    // ─── Prêt : le devineur prend le téléphone ───────────────────────────────
    const actionBar = (
      <div ref={actionBarRef} className="flex w-full flex-col gap-2">
        <Button variant="primary" size="gameLg" className="w-full whitespace-normal leading-tight" onClick={handleReady}>
          <Smartphone aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          {t('ready.go')}
        </Button>
      </div>
    )
    screen = (
      <GameShell
        title={t('title')}
        headerSubtitle={progress}
        onBack={onGameEnd}
        headerRight={headerRight}
        actionBar={actionBar}
        maxWidth={640}
        contentClassName={BAR_PADDING}
      >
        <section className="flex flex-col items-center gap-2 text-center">
          {guesser && <PlayerIcon player={guesser} size="lg" className="h-16 w-16 text-5xl" />}
          <h2 className="font-display text-3xl font-bold leading-tight text-cream">
            {t('ready.turnOf', { name: guesser?.name ?? '' })}
          </h2>
          {guesserTeam && (
            <span className="rounded-full border border-gold/40 bg-gold/[0.15] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {t(`teams.${guesserTeam}`)}
            </span>
          )}
          <p className="text-base text-cream/80">{t('ready.lead')}</p>
        </section>

        <section className="mt-5 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
          <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            {t('ready.gesturesTitle')}
          </h3>
          <ul className="space-y-2 text-base font-semibold">
            <li className="flex items-center gap-3 text-emerald-300">
              <ArrowDown aria-hidden className="h-6 w-6 shrink-0" />
              {t('ready.down')}
            </li>
            <li className="flex items-center gap-3 text-red-300">
              <ArrowUp aria-hidden className="h-6 w-6 shrink-0" />
              {t('ready.up')}
            </li>
          </ul>
          <p className="mt-3 flex items-start gap-2 text-sm text-cream/70">
            <Hand aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {permission === 'denied'
              ? t('ready.sensorDenied')
              : sensor === 'unavailable'
                ? t('ready.noSensor')
                : t('ready.touchHint')}
          </p>
          <p className="mt-2 text-sm text-cream/70">{t('ready.forbidden')}</p>
        </section>

        <button
          type="button"
          aria-pressed={flipped}
          onClick={() => setFlipped((value) => !value)}
          className={cn(
            'mt-4 flex min-h-[44px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
            flipped
              ? 'border-gold/60 bg-gold/[0.15] text-cream'
              : 'border-gold/[0.15] bg-black/20 text-cream/80 hover:border-gold/40 hover:text-cream'
          )}
        >
          <RotateCw aria-hidden className={cn('h-5 w-5 shrink-0 text-gold transition-transform', flipped && 'rotate-180')} />
          <span className="flex flex-col">
            <span className="text-sm font-bold">{t('ready.flip')}</span>
            <span className="text-xs text-cream/70">{t('ready.flipHint')}</span>
          </span>
        </button>

        {game.turnIndex > 0 && (
          <section className="mt-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {t('ready.scoresTitle')}
            </h3>
            <ul className="space-y-1.5">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate text-cream">{entryName(entry)}</span>
                  <span className="shrink-0 font-display font-semibold tabular-nums text-gold">{entryScore(entry, false)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </GameShell>
    )
  }

  // Flash « Passe le téléphone » à chaque nouveau devineur ; la clé du récapitulatif
  // retient le devineur qui vient de jouer (un tour repris au récapitulatif flashe aussi).
  const handKey =
    (game.roundPhase === 'ready' || game.roundPhase === 'recap') && guesserId ? `${guesserId}#${game.turnIndex}` : null

  return (
    <>
      {confirmDialog}
      <p role="status" aria-live="polite" className="sr-only">
        {liveText}
      </p>
      <PassPhoneOverlay
        playerKey={handKey}
        enabled={game.roundPhase === 'ready'}
        name={guesser?.name ?? ''}
        avatar={guesser ? <PlayerIcon player={guesser} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
      />
      {screen}
    </>
  )
}
