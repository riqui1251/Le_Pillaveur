"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { RotateCcw, SkipForward, Trophy } from 'lucide-react'
import type { Player } from '@/lib/players'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { MedalDot } from '@/components/online/MedalDot'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { isSoundMuted, playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import { readChiffrePiegeInput, sanitizeChiffrePiegeInput, CHIFFRE_PIEGE_INPUT_MAX_LENGTH } from '@/lib/chiffre-piege/display'
import {
  CHIFFRE_PIEGE_JOKER_PENALTY,
  CHIFFRE_PIEGE_SAVE_ID,
  CHIFFRE_PIEGE_SAVE_VERSION,
  chiffrePiegeAttempts,
  chiffrePiegeNextStarterId,
  chiffrePiegeRanking,
  chiffrePiegeReadingLeftMs,
  createChiffrePiegeGame,
  currentChiffrePiegePlayerId,
  guessChiffrePiege,
  hasChiffrePiegeJoker,
  isChiffrePiegeForced,
  nextChiffrePiegeRound,
  passChiffrePiege,
  restoreChiffrePiegeSave,
  toChiffrePiegePublicView,
  toChiffrePiegeSave,
  type ChiffrePiegeResult,
  type ChiffrePiegeSave,
  type ChiffrePiegeSettings,
  type ChiffrePiegeState,
} from '@/lib/chiffre-piege/engine'
import { ChiffrePiegeBoomScreen, ChiffrePiegeHistory, ChiffrePiegeRangePanel, ChiffrePiegeTiles } from './chiffre-piege-ui'
import { useChiffrePiegeText } from './use-chiffre-piege-text'

interface GameProps {
  players: Player[]
  settings: ChiffrePiegeSettings
  /** Figée au clic « Commencer » : gorgées (alcool) ou points de pénalité (soft). */
  ambiance: AmbianceMode
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

// Barre du tour : consigne + champ et « Tenter » (56 px) + joker (48 px), ou
// la consigne du dernier nombre sur deux lignes : plus haute qu'une rangée.
const PLAY_PADDING = 'pb-[calc(11rem+env(safe-area-inset-bottom,0px))]'
const FORCED_PADDING = 'pb-[calc(14rem+env(safe-area-inset-bottom,0px))]'

const BOOM_VIBRATION = [120, 60, 220]

/**
 * Actions d'un écran neuf (main qui change, fin de partie) armées un instant
 * après : les touchers répétés sur « Manche suivante » grisé tombaient ensuite
 * sur « Quitter » (même place sur l'écran de fin) ou, le flash « Passe le
 * téléphone » refermé par l'un d'eux, sur le joker du joueur suivant.
 */
const ACTIONS_ARM_MS = 700

/**
 * Vrai `delayMs` après que `key` a pris sa valeur, faux tant qu'elle est null.
 * Compté par un minuteur et non par l'heure murale : une horloge qui recule
 * ne laisse rien grisé pendant tout le recul. Gelé par iOS en arrière-plan,
 * le minuteur repart au retour : l'attente ne fait que s'allonger.
 */
function useArmedAfter(key: string | null, delayMs: number): boolean {
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const armed = key !== null && armedKey === key
  useEffect(() => {
    if (key === null || armed) return
    const timer = setTimeout(() => setArmedKey(key), Math.max(0, delayMs))
    return () => clearTimeout(timer)
  }, [key, delayMs, armed])
  return armed
}

/** Le son coupé coupe aussi la vibration : un seul réglage pour tout le retour (convention Plinko). */
function vibrate(pattern: number[]) {
  if (isSoundMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // vibration refusée ou absente (iPhone) : l'écran et le son suffisent
  }
}

/** Écran tactile : le clavier se referme après l'essai, le suivant voit tout l'écran. */
function isTouchScreen(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

export default function Game({ players, settings, ambiance, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.chiffre-piege')
  const tc = useTranslations('common')
  const tx = useChiffrePiegeText(ambiance)
  const [confirmDialog, confirm] = useConfirmAction()
  const hintId = useId()

  const [game, setGame] = useState<ChiffrePiegeState | null>(null)
  const [started, setStarted] = useState(false)
  const [entry, setEntry] = useState('')
  // Table seule dans le prédicat : la partie sauvegardée garde ses propres réglages.
  const session = useResumableLocalGame<ChiffrePiegeSave>(CHIFFRE_PIEGE_SAVE_ID, CHIFFRE_PIEGE_SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  const { save: saveSession, clear: clearSession, discard: discardSession, accept: acceptSession } = session
  /** Une partie n'est créditée qu'une fois. */
  const gameCountedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const forcedBarRef = useRef<HTMLDivElement>(null)
  const boomTitleRef = useRef<HTMLHeadingElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)

  const soft = ambiance === 'soft'
  const phase = game?.phase ?? null
  const forced = game ? isChiffrePiegeForced(game) : false
  // Une clé par écran d'actions : chaque main (essai, joker, manche), le BOUM, la fin.
  const screenKey = game ? `${game.phase}:${game.roundIndex}:${game.history.length}` : null
  const actionsArmed = useArmedAfter(screenKey, ACTIONS_ARM_MS)
  const boomKey = game?.phase === 'boom' && game.lastBoom ? `${game.roundIndex}:${game.lastBoom.at}` : null
  const canContinue = useArmedAfter(boomKey, game ? (chiffrePiegeReadingLeftMs(game, Date.now()) ?? 0) : 0)

  const startGame = (next: ChiffrePiegeSettings) => {
    const created = createChiffrePiegeGame({ playerIds: players.map(p => p.id), settings: next, seed: randomSeed() })
    // Table refusée (moins de 2 joueurs) : retour au pré-lobby plutôt qu'un chargement sans fin.
    if (!created.ok) {
      onGameEnd()
      return
    }
    gameCountedRef.current = false
    setEntry('')
    setGame(created.state)
  }

  // Partie neuve seulement quand la reprise a été lue ET tranchée.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    startGame(settings)
    setStarted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule donne, avec la table et les réglages du lancement
  }, [session.ready, session.pending, started])

  // Sauvegarde continue : jamais avant `started` (elle écraserait la sauvegarde proposée), jamais après la fin.
  useEffect(() => {
    if (!started || !game || game.phase === 'finished') return
    saveSession(toChiffrePiegeSave(game))
  }, [started, game, saveSession])

  // Le BOUM et l'écran de fin remplacent la barre : le focus retombait sur <body>.
  useEffect(() => {
    if (phase === 'boom') boomTitleRef.current?.focus()
    else if (phase === 'finished') endTitleRef.current?.focus()
  }, [phase])

  // Au clavier, chaque main (essai, joker, manche) rend le focus au champ, ou
  // au premier bouton actif de la barre du dernier nombre une fois armée : le
  // joker validé à l'Entrée gardait le focus — une seconde Entrée grillait
  // celui du joueur suivant —, et cette barre, qui remplace le formulaire, le
  // laissait tomber sur <body>. Jamais sur un écran tactile, où le focus
  // ouvrirait le clavier pendant que le téléphone passe.
  const focusKey = phase === 'playing' ? `${screenKey}:${forced && actionsArmed}` : null
  useEffect(() => {
    if (focusKey === null || isTouchScreen()) return
    const target = inputRef.current ?? forcedBarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    target?.focus({ preventScroll: true })
  }, [focusKey])

  const resumeSavedGame = () => {
    const saved = acceptSession()
    if (!saved) return
    const restored = restoreChiffrePiegeSave(saved, players.map(p => p.id))
    if (!restored) {
      discardSession()
      return
    }
    gameCountedRef.current = false
    setEntry('')
    setGame(restored)
    setStarted(true)
  }

  const creditGame = (finished: ChiffrePiegeState) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    for (const row of chiffrePiegeRanking(finished)) {
      updatePlayerStats(row.playerId, 'chiffre-piege', {
        gamesPlayed: 1,
        wins: row.rank === 1 ? 1 : 0,
        // Sans alcool, les pénalités sont des points : rien à compter en gorgées.
        totalDrinks: soft ? 0 : row.penalty,
      })
    }
    clearSession()
  }

  const apply = (result: ChiffrePiegeResult): ChiffrePiegeState | null => {
    if (!result.ok) return null
    setGame(result.state)
    return result.state
  }

  const submitGuess = (value: number) => {
    if (!game) return
    const playerId = currentChiffrePiegePlayerId(game)
    if (!playerId) return
    const next = apply(guessChiffrePiege(game, { playerId, value, now: Date.now() }))
    if (!next) return
    setEntry('')
    if (isTouchScreen()) inputRef.current?.blur()
    if (next.phase === 'boom') {
      playGameSound('boom')
      vibrate(BOOM_VIBRATION)
    }
  }

  const playJoker = () => {
    if (!game) return
    const playerId = currentChiffrePiegePlayerId(game)
    if (!playerId) return
    if (!apply(passChiffrePiege(game, { playerId }))) return
    setEntry('')
    if (isTouchScreen()) inputRef.current?.blur()
    playGameSound('skip')
  }

  const goToNextRound = () => {
    if (!game) return
    const next = apply(nextChiffrePiegeRound(game, { now: Date.now() }))
    if (next?.phase === 'finished') {
      creditGame(next)
      playGameSound('victory')
    }
  }

  // Rejouer ou recommencer garde les réglages de la partie en cours (une reprise a les siens).
  const replay = () => {
    startGame(game ? { max: game.max, rounds: game.roundsTotal } : settings)
  }

  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok) replay()
  }

  if (!session.ready) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={discardSession} />
  if (!game) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>

  // L'écran ne lit que la vue publique : le piège en cours n'y est pas.
  const view = toChiffrePiegePublicView(game)
  const playerById = (id: string | null | undefined) => (id ? players.find(p => p.id === id) : undefined)
  const nameOf = (id: string) => playerById(id)?.name ?? ''
  const currentId = currentChiffrePiegePlayerId(view)
  const current = playerById(currentId)
  const ranking = chiffrePiegeRanking(view)
  const leaders = ranking.filter(row => row.rank === 1)

  // Une seule voix pour le lecteur d'écran, montée en permanence : le BOUM
  // ouvre un calque et la barre change à chaque tour, une région créée avec
  // son texte se tait souvent.
  let liveText = ''
  if (view.phase === 'boom' && view.lastBoom) {
    liveText = tx('boom.live', { name: nameOf(view.lastBoom.playerId), value: view.lastBoom.trap, count: view.lastBoom.penalty })
  } else if (view.phase === 'finished') {
    liveText = leaders.length === 1 ? t('end.winner', { name: nameOf(leaders[0].playerId) }) : t('end.tie', { count: leaders.length })
  } else {
    const lastMove = view.history.length > 0 ? view.history[view.history.length - 1] : null
    if (lastMove?.kind === 'guess') {
      const where = isChiffrePiegeForced(view)
        ? t('game.forcedTitle', { value: view.low })
        : t('game.rangeSummary', { low: view.low, high: view.high, max: view.max })
      liveText = `${t('game.liveMiss', { name: nameOf(lastMove.playerId), value: lastMove.value, dir: lastMove.dir })} ${where}`
    } else if (lastMove?.kind === 'pass') {
      liveText = t('game.livePass', { name: nameOf(lastMove.playerId) })
    } else {
      liveText = t('game.liveRound', { round: view.roundIndex + 1, max: view.max })
    }
  }

  let screen
  if (view.phase === 'finished') {
    // ─── Écran de fin ────────────────────────────────────────────────────────
    screen = (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640}>
        <section className="flex flex-col items-center gap-2 text-center">
          <Trophy aria-hidden className="h-10 w-10 text-gold" />
          <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
            {t('end.title')}
          </h2>
          <p className="text-base text-cream/80">
            {leaders.length === 1 ? t('end.winner', { name: nameOf(leaders[0].playerId) }) : t('end.tie', { count: leaders.length })}
          </p>
        </section>

        <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('end.results')}</h3>
          <ol className="space-y-2">
            {ranking.map(row => {
              const player = playerById(row.playerId)
              if (!player) return null
              return (
                <li
                  key={row.playerId}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2',
                    row.rank === 1 ? 'border-gold/60 bg-gold/10' : 'border-gold/20 bg-black/20'
                  )}
                >
                  <span className="flex w-6 shrink-0 items-center justify-center text-sm font-bold tabular-nums text-cream/80">
                    {row.rank <= 3 ? <MedalDot position={row.rank} /> : `${row.rank}.`}
                  </span>
                  <PlayerIcon player={player} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base text-cream">
                      <PlayerName player={player} />
                    </p>
                    {/* Replié et non tronqué : à 375 px, « joker grillé » disparaissait sous l'ellipse. */}
                    <p className="break-words text-xs text-cream/70">
                      {t('end.details', { booms: row.booms, joker: row.jokerUsed ? 'used' : 'kept' })}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-base font-semibold lining-nums tabular-nums text-gold">
                    {tx('end.penalty', { count: row.penalty })}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="chiffre-piege" />}
        >
          <Button variant="primary" size="gameLg" className="w-full" disabled={!actionsArmed} onClick={replay}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {tc('replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" disabled={!actionsArmed} onClick={onGameEnd}>
            {tc('quit')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  } else if (view.phase === 'boom' && view.lastBoom) {
    // ─── BOUM ────────────────────────────────────────────────────────────────
    screen = (
      <ChiffrePiegeBoomScreen
        boom={view.lastBoom}
        loser={playerById(view.lastBoom.playerId)}
        roundIndex={view.roundIndex}
        roundsTotal={view.roundsTotal}
        nextStarter={playerById(chiffrePiegeNextStarterId(view))}
        canContinue={canContinue}
        onContinue={goToNextRound}
        ambiance={ambiance}
        titleRef={boomTitleRef}
      />
    )
  } else {
    // ─── Tour de jeu ─────────────────────────────────────────────────────────
    const jokerAvailable = currentId !== null && hasChiffrePiegeJoker(view, currentId)
    const input = readChiffrePiegeInput(entry, view.low, view.high)
    const jokerButton = jokerAvailable && (
      <Button
        type="button"
        variant="quiet"
        size="game"
        className="w-full whitespace-normal leading-tight"
        disabled={!actionsArmed}
        onClick={playJoker}
      >
        <SkipForward aria-hidden className="mr-2 h-4 w-4 shrink-0" />
        {tx('game.jokerButton', { count: CHIFFRE_PIEGE_JOKER_PENALTY })}
      </Button>
    )

    const actionBar = forced ? (
      <div ref={forcedBarRef} className="flex w-full flex-col gap-2">
        <p className="text-center font-display text-lg font-bold leading-snug lining-nums text-red-300">
          {t('game.forcedTitle', { value: view.low })}
        </p>
        <p className="text-center text-sm text-cream/80">
          {jokerAvailable ? t('game.forcedWithJoker') : t('game.forcedNoJoker')}
        </p>
        {/* Armé un instant après la main : il prend la place de « Tenter », sous le doigt du joueur d'avant. */}
        <Button
          variant="danger"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          disabled={!actionsArmed}
          onClick={() => submitGuess(view.low)}
        >
          {t('game.forcedPlay', { value: view.low })}
        </Button>
        {jokerButton}
      </div>
    ) : (
      <form
        className="flex w-full flex-col gap-2"
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          if (input.status === 'ok') submitGuess(input.value)
        }}
      >
        <p
          id={hintId}
          className={cn(
            'text-sm font-semibold leading-snug',
            input.status === 'out-of-range' ? 'text-red-300' : 'text-cream/80'
          )}
        >
          {input.status === 'out-of-range'
            ? t('game.outOfRange', { low: view.low, high: view.high })
            : t('game.inputHint', { low: view.low, high: view.high })}
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={entry}
            onChange={(event) => setEntry(sanitizeChiffrePiegeInput(event.target.value))}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={CHIFFRE_PIEGE_INPUT_MAX_LENGTH}
            autoComplete="off"
            enterKeyHint="go"
            aria-label={t('game.inputLabel', { low: view.low, high: view.high })}
            aria-describedby={hintId}
            aria-invalid={input.status === 'out-of-range'}
            placeholder={t('game.inputPlaceholder', { low: view.low, high: view.high })}
            className="h-14 w-0 min-w-0 flex-1 rounded-xl border border-cream/50 bg-black/30 px-4 text-center text-base font-semibold tabular-nums text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <Button
            type="submit"
            variant="primary"
            size="gameLg"
            className="shrink-0 px-5"
            disabled={input.status !== 'ok'}
          >
            {input.status === 'ok' ? t('game.tryValue', { value: input.value }) : t('game.try')}
          </Button>
        </div>
        {jokerButton}
      </form>
    )

    screen = (
      <GameShell
        title={t('title')}
        headerSubtitle={t('game.progress', {
          round: view.roundIndex + 1,
          total: view.roundsTotal,
          attempt: chiffrePiegeAttempts(view) + 1,
        })}
        onBack={onGameEnd}
        headerRight={
          <Button
            variant="ghost"
            size="gameIcon"
            onClick={() => void askRestart()}
            aria-label={tc('confirmRestart.confirm')}
            className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
          >
            <RotateCcw aria-hidden className="h-5 w-5" />
          </Button>
        }
        actionBar={actionBar}
        maxWidth={640}
        contentClassName={forced ? FORCED_PADDING : PLAY_PADDING}
      >
        <div className="flex flex-col gap-4">
          {current && (
            <div className="flex min-w-0 items-center justify-center gap-3">
              <PlayerIcon player={current} size="lg" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.yourTurn')}</p>
                <p className="truncate font-display text-2xl font-bold leading-tight text-cream">
                  <PlayerName player={current} />
                </p>
              </div>
            </div>
          )}
          <ChiffrePiegeRangePanel view={view} mark={input.status === 'ok' ? input.value : null} />
          <ChiffrePiegeTiles view={view} ambiance={ambiance} />
          <ChiffrePiegeHistory view={view} nameOf={nameOf} />
        </div>
      </GameShell>
    )
  }

  return (
    <>
      {confirmDialog}
      <p role="status" aria-live="polite" className="sr-only">{liveText}</p>
      <PassPhoneOverlay
        playerKey={currentId}
        name={current?.name ?? ''}
        avatar={current ? <PlayerIcon player={current} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
      />
      {screen}
    </>
  )
}
