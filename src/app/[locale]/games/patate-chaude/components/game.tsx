"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Ban, Bomb, Flame, RotateCcw, Trophy, Volume2, VolumeX } from 'lucide-react'
import type { Player } from '@/lib/players'
import type { AmbianceMode } from '@/components/providers/AmbianceAttribute'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { useGameSounds } from '@/hooks/useGameSounds'
import { useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { isSoundMuted, playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import {
  PC_EXPLOSION_POINTS,
  PC_EXPLOSION_SIPS,
  PC_SAVE_ID,
  PC_SAVE_VERSION,
  PC_UNLIMITED_ROUNDS,
  createGame,
  finish,
  isLastRound,
  nextHolderId,
  nextRound,
  pass,
  pcFuseRangeMs,
  pcTally,
  ranking,
  reject,
  resolveIfExpired,
  restorePcSave,
  startRound,
  toPcSave,
  type PcChallenge,
  type PcChallengeSource,
  type PcSave,
  type PcSettings,
  type PcState,
} from '@/lib/patate-chaude/engine'
import { pcTickIntervalMs } from '@/lib/patate-chaude/tick'
import { BombArt } from './bomb'
import { PcBoomScreen } from './boom-screen'

interface GameProps {
  players: Player[]
  settings: PcSettings
  /** Figée au clic « Commencer » : gorgées (alcool) ou points de pénalité (Soft). */
  ambiance: AmbianceMode
  bank: PcChallengeSource
  onGameEnd: () => void
  updatePlayerStats: (
    playerId: string,
    gameId: string,
    stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }
  ) => void
}

const HEADER_BUTTON = 'border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold'
const BOOM_VIBRATION_MS = [220, 90, 420]
/** Un double toucher ne doit ni sauter un joueur, ni rejeter deux fois (deux rejets = une pénalité). */
const ACTION_COOLDOWN_MS = 400
/** Le BOUM reste à l'écran : un toucher lancé juste avant l'explosion ne doit pas l'enjamber. */
const BOOM_LOCK_MS = 1200
/** Le minuteur peut se réveiller une poussière avant l'échéance : on le réarme alors. */
const EXPLOSION_MARGIN_MS = 10

// leading-* APRÈS la taille : dans cn(), tailwind-merge efface un interlignage posé avant un text-<taille>.
const CHALLENGE_VALUE_CLASS: Record<PcChallenge['kind'], string> = {
  theme: 'text-2xl leading-tight sm:text-3xl',
  letter: 'text-7xl leading-none',
  syllable: 'text-6xl leading-none tracking-wide',
}

export default function Game({ players, settings, ambiance, bank, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.patate-chaude')
  const tc = useTranslations('common')
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const [confirmDialog, confirm] = useConfirmAction()
  const { muted, toggleMuted } = useGameSounds()

  const [game, setGame] = useState<PcState | null>(null)
  const [started, setStarted] = useState(false)
  const [liveText, setLiveText] = useState('')
  /** Porteur qui vient de prendre une pénalité pour deux rejets de suite (bandeau éphémère). */
  const [penaltyFor, setPenaltyFor] = useState<string | null>(null)
  const [boomLocked, setBoomLocked] = useState(false)

  // Dernier état connu des minuteurs : la mèche et un toucher peuvent tomber dans le même rendu.
  const gameRef = useRef<PcState | null>(null)
  /** Une partie n'est créditée qu'une fois. */
  const gameCountedRef = useRef(false)
  const lastActionAtRef = useRef(-Infinity)
  const boomLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bombRef = useRef<HTMLDivElement>(null)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)

  // La table seule décide : la partie sauvegardée garde ses propres réglages (le pré-lobby revient
  // aux défauts après un rechargement). restorePcSave relit tout : jamais de reprise refusée ensuite.
  const session = useResumableLocalGame<PcSave>(
    PC_SAVE_ID,
    PC_SAVE_VERSION,
    (s) => restorePcSave(s, players.map((p) => p.id)) !== null
  )
  const { ready: sessionReady, pending: sessionPending, save: saveSession, clear: clearSession } = session

  const soft = ambiance === 'soft'
  const playerById = (id: string | null | undefined) => (id ? players.find((p) => p.id === id) : undefined)
  const nameOf = (id: string) => playerById(id)?.name ?? ''

  /** Texte d'un défi dans la langue de la page (un thème repris d'une sauvegarde se relit par son id). */
  const challengeText = (challenge: PcChallenge) => {
    if (challenge.kind !== 'theme') return challenge.value
    return bank.themes.find((theme) => theme.id === challenge.id)?.text ?? challenge.value
  }

  const verdictFor = (playerId: string) =>
    soft
      ? t('soft.verdict', { name: nameOf(playerId), count: PC_EXPLOSION_POINTS })
      : t('boom.verdict', { name: nameOf(playerId), count: PC_EXPLOSION_SIPS })

  const holdBoomScreen = () => {
    if (boomLockTimerRef.current) clearTimeout(boomLockTimerRef.current)
    setBoomLocked(true)
    boomLockTimerRef.current = setTimeout(() => {
      boomLockTimerRef.current = null
      setBoomLocked(false)
    }, BOOM_LOCK_MS)
  }

  const releaseBoomScreen = () => {
    if (boomLockTimerRef.current) clearTimeout(boomLockTimerRef.current)
    boomLockTimerRef.current = null
    setBoomLocked(false)
  }

  const announceBoom = (next: PcState) => {
    playGameSound('boom')
    // Le réglage du son coupe aussi la vibration : un seul interrupteur pour tout le retour sensoriel.
    if (!isSoundMuted()) {
      try {
        navigator.vibrate?.(BOOM_VIBRATION_MS)
      } catch {
        // vibration refusée ou absente (iPhone) : l'écran rouge suffit
      }
    }
    holdBoomScreen()
    setPenaltyFor(null)
    const loser = next.lastBoom?.playerId ?? next.holder
    setLiveText(t('boom.live', { name: nameOf(loser), verdict: verdictFor(loser) }))
  }

  /** Toute écriture passe ici : le ref suit l'état sans attendre le rendu, et le BOUM s'annonce une fois. */
  const commit = (next: PcState) => {
    const previous = gameRef.current
    gameRef.current = next
    setGame(next)
    if (previous?.phase === 'burning' && next.phase === 'boom') announceBoom(next)
  }

  const throttled = () => {
    const now = performance.now()
    if (now - lastActionAtRef.current < ACTION_COOLDOWN_MS) return true
    lastActionAtRef.current = now
    return false
  }

  // Rejouer et ↺ gardent les réglages de la partie jouée (une reprise a les siens) ; la première
  // donne prend ceux du pré-lobby.
  const newGame = () => {
    const created = createGame({
      playerIds: players.map((p) => p.id),
      settings: gameRef.current?.settings ?? settings,
      seed: randomSeed(),
    })
    if (!created.ok) return
    gameCountedRef.current = false
    releaseBoomScreen()
    setPenaltyFor(null)
    setLiveText('')
    commit(created.state)
  }

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Les profils viennent de la table courante, la sauvegarde ne connaît que des identifiants ;
    // ses réglages sont les siens, quels que soient ceux du pré-lobby.
    const restored = restorePcSave(saved, players.map((p) => p.id))
    if (!restored) {
      session.discard()
      return
    }
    gameCountedRef.current = false
    releaseBoomScreen()
    setPenaltyFor(null)
    setLiveText('')
    commit(restored)
    setStarted(true)
  }

  const endGame = (final: PcState) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    for (const entry of ranking(final)) {
      updatePlayerStats(entry.playerId, 'patate-chaude', {
        gamesPlayed: 1,
        wins: entry.won ? 1 : 0,
        // Sans alcool, aucune gorgée n'a été bue : les statistiques n'en inventent pas.
        totalDrinks: soft ? 0 : pcTally(entry, 'alcool'),
      })
    }
    clearSession()
  }

  const announceChallenge = (challenge: PcChallenge | null) =>
    challenge ? t(`game.announce.${challenge.kind}`, { value: challengeText(challenge) }) : ''

  const light = () => {
    const current = gameRef.current
    if (!current || current.phase !== 'ready' || throttled()) return
    const result = startRound(current, Date.now(), bank)
    if (!result.ok) return
    // Premier tic DANS le toucher : iOS n'ouvre l'audio qu'à l'intérieur d'un geste.
    playGameSound('tick')
    setPenaltyFor(null)
    commit(result.state)
    setLiveText(
      t('game.liveLit', { challenge: announceChallenge(result.state.challenge), name: nameOf(result.state.holder) })
    )
  }

  const passBomb = () => {
    const current = gameRef.current
    if (!current || current.phase !== 'burning' || throttled()) return
    const result = pass(current, { now: Date.now() })
    if (!result.ok) return
    setPenaltyFor(null)
    commit(result.state)
    if (result.state.phase !== 'burning') return
    playGameSound('step')
    setLiveText(t('game.liveHolder', { name: nameOf(result.state.holder) }))
  }

  const rejectWord = () => {
    const current = gameRef.current
    if (!current || current.phase !== 'burning' || throttled()) return
    const result = reject(current, Date.now())
    if (!result.ok) return
    commit(result.state)
    if (result.state.phase !== 'burning') return
    playGameSound('skip')
    const name = nameOf(current.holder)
    const penalized = (result.state.penalties[current.holder] ?? 0) > (current.penalties[current.holder] ?? 0)
    if (penalized) {
      setPenaltyFor(current.holder)
      setLiveText(t(soft ? 'soft.rejectPenalty' : 'game.rejectPenalty', { name }))
    } else {
      setPenaltyFor(null)
      setLiveText(t('game.liveRejected', { name }))
    }
  }

  const goNextRound = () => {
    const current = gameRef.current
    if (!current || current.phase !== 'boom' || throttled()) return
    const result = nextRound(current)
    if (!result.ok) return
    commit(result.state)
    if (result.state.phase === 'finished') endGame(result.state)
    else setLiveText(t('game.liveReady', { name: nameOf(result.state.holder) }))
  }

  const finishNow = () => {
    const current = gameRef.current
    if (!current || current.phase === 'finished') return
    const result = finish(current, Date.now())
    if (!result.ok) return
    commit(result.state)
    endGame(result.state)
  }

  /** ← en partie illimitée : la seule fin possible, donc on passe au classement après confirmation. */
  const askFinish = async () => {
    const current = gameRef.current
    if (!current || (current.roundIndex === 0 && current.phase !== 'boom')) {
      onGameEnd()
      return
    }
    const ok = await confirm({
      title: t('finishConfirm.title'),
      description: t('finishConfirm.description'),
      confirmLabel: t('finishConfirm.confirm'),
      cancelLabel: t('finishConfirm.cancel'),
      tone: 'primary',
    })
    if (ok) finishNow()
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

  /** Rend vrai quand il n'y a plus de mèche à surveiller (explosée ou éteinte). */
  const checkExplosion = (): boolean => {
    const current = gameRef.current
    if (!current || current.phase !== 'burning') return true
    const next = resolveIfExpired(current, Date.now())
    if (next === current) return false
    commit(next)
    return true
  }

  /** La bombe bat au rythme du tic-tac : le signal reste visible son coupé. */
  const beat = () => {
    const el = bombRef.current
    if (reduceMotion || !el || typeof el.animate !== 'function') return
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], {
      duration: 160,
      easing: 'ease-out',
    })
  }

  // Les minuteurs appellent toujours la DERNIÈRE version de ces gestes (fermetures du rendu courant).
  const actions = useRef({ newGame, checkExplosion, beat })
  actions.current = { newGame, checkExplosion, beat }

  useEffect(
    () => () => {
      if (boomLockTimerRef.current) clearTimeout(boomLockTimerRef.current)
    },
    []
  )

  // Partie neuve seulement quand la reprise a été lue ET tranchée.
  useEffect(() => {
    if (!sessionReady || sessionPending || started) return
    actions.current.newGame()
    setStarted(true)
  }, [sessionReady, sessionPending, started])

  // Sauvegarde continue (jamais avant `started`, qui écraserait la reprise proposée ; jamais une partie finie).
  useEffect(() => {
    if (!started || !game || game.phase === 'finished') return
    saveSession(toPcSave(game))
  }, [started, game, saveSession])

  const phase = game?.phase ?? null
  const explodeAt = game?.explodeAt ?? null
  const roundStartedAt = game?.roundStartedAt ?? null
  const maxFuseMs = pcFuseRangeMs(game?.settings.fuse ?? settings.fuse).max

  // La mèche : un réveil à l'échéance, revérifié au retour d'un onglet caché (iOS gèle les minuteurs).
  useEffect(() => {
    if (phase !== 'burning' || explodeAt === null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!actions.current.checkExplosion()) arm()
      }, Math.max(0, explodeAt - Date.now()) + EXPLOSION_MARGIN_MS)
    }
    const onVisibility = () => {
      if (document.hidden) return
      if (!actions.current.checkExplosion()) arm()
    }
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [phase, explodeAt])

  // Le tic-tac : son rythme ne dépend que du temps écoulé et de la borne HAUTE de la mèche.
  useEffect(() => {
    if (phase !== 'burning' || roundStartedAt === null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (document.hidden) return
        playGameSound('tick')
        actions.current.beat()
        schedule()
      }, pcTickIntervalMs(Date.now() - roundStartedAt, maxFuseMs))
    }
    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer)
      else schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [phase, roundStartedAt, maxFuseMs])

  // La barre change de boutons à chaque phase : le focus retombait sur <body>.
  useEffect(() => {
    if (!phase) return
    const active = document.activeElement
    if (active && active !== document.body) return
    if (phase === 'finished') {
      endTitleRef.current?.focus()
      return
    }
    const bar = actionBarRef.current
    const target =
      bar?.querySelector<HTMLButtonElement>('button[data-autofocus]:not(:disabled)') ??
      bar?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    target?.focus({ preventScroll: true })
  }, [phase, boomLocked])

  if (!sessionReady) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>
  if (sessionPending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  if (!game) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>

  const unlimited = game.settings.rounds === PC_UNLIMITED_ROUNDS

  // ─── Fin de partie ─────────────────────────────────────────────────────────
  if (game.phase === 'finished') {
    const rows = ranking(game)
    // Simple virgule plutôt qu'Intl.ListFormat, absent des vieux navigateurs (Safari < 14.1, TV).
    const winners = rows.filter((row) => row.won).map((row) => nameOf(row.playerId))
    return (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640}>
        <section className="flex flex-col items-center gap-2 text-center">
          <Trophy aria-hidden className="h-10 w-10 text-gold" />
          <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
            {t('end.title')}
          </h2>
          <p className="text-base text-cream/80">{t('end.winners', { count: winners.length, names: winners.join(', ') })}</p>
        </section>

        <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            {t('end.ranking')}
          </h3>
          <ol className="space-y-2">
            {rows.map((row) => {
              const player = playerById(row.playerId)
              if (!player) return null
              return (
                <li
                  key={row.playerId}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2',
                    row.won ? 'border border-gold/60 bg-gold/[0.15]' : 'bg-black/20'
                  )}
                >
                  <span className="w-6 shrink-0 text-center font-display text-lg font-bold tabular-nums lining-nums text-gold">
                    {format.number(row.rank)}
                  </span>
                  <PlayerIcon player={player} size="md" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <PlayerName player={player} className="truncate font-display text-base text-cream" />
                    <span className="flex flex-wrap gap-x-2 text-xs text-cream/70">
                      <span>{t('game.explosions', { count: row.explosions })}</span>
                      {row.penalties > 0 && <span>{t('end.penalties', { count: row.penalties })}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-base font-semibold tabular-nums lining-nums text-gold">
                    {soft
                      ? t('soft.points', { count: pcTally(row, 'soft') })
                      : tc('sipsCount', { count: pcTally(row, 'alcool') })}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="patate-chaude" />}
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
    )
  }

  // ─── Partie en cours ───────────────────────────────────────────────────────
  const roundLabel = unlimited
    ? t('game.round', { current: game.roundIndex + 1 })
    : t('game.roundOf', { current: game.roundIndex + 1, total: game.settings.rounds })

  // Une seule voix pour le lecteur d'écran, montée en permanence au même rang devant le BOUM et la
  // coquille du jeu, qui se remplacent : une région créée avec son texte se tait souvent.
  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {liveText}
    </p>
  )

  if (game.phase === 'boom') {
    // Un BOUM a toujours son bilan (resolveIfExpired, restorePcSave) : le repli ne sert qu'au typage.
    const boom = game.lastBoom ?? { playerId: game.holder, round: game.roundIndex, fuseMs: 0, passes: game.passes }
    return (
      <>
        {confirmDialog}
        {liveRegion}
        <PcBoomScreen
          boom={boom}
          loser={playerById(boom.playerId)}
          verdict={verdictFor(boom.playerId)}
          roundLabel={roundLabel}
          lastRound={isLastRound(game)}
          locked={boomLocked}
          onNext={goNextRound}
          onFinish={unlimited ? finishNow : undefined}
          actionsRef={actionBarRef}
        />
      </>
    )
  }

  const holder = playerById(game.holder)
  const nextPlayer = playerById(nextHolderId(game))
  const challenge = game.phase === 'burning' ? game.challenge : null

  const headerRight = (
    <>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={toggleMuted}
        aria-label={muted ? t('game.soundOn') : t('game.soundOff')}
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

  let actionBar: ReactNode
  if (game.phase === 'ready') {
    actionBar = (
      <div key="ready" ref={actionBarRef} className="flex w-full">
        <Button data-autofocus variant="primary" size="gameLg" className="w-full" onClick={light}>
          <Flame aria-hidden className="mr-2 h-5 w-5" />
          {t('game.light')}
        </Button>
      </div>
    )
  } else {
    actionBar = (
      <div key="burning" ref={actionBarRef} className="flex w-full gap-2">
        <Button
          variant="quiet"
          size="gameLg"
          className="w-[7.5rem] shrink-0 whitespace-normal px-3 leading-tight"
          onClick={rejectWord}
        >
          <Ban aria-hidden className="mr-1.5 h-5 w-5 shrink-0" />
          {t('game.rejected')}
        </Button>
        <Button
          data-autofocus
          variant="primary"
          size="gameLg"
          className="min-w-0 flex-1 whitespace-normal px-3 leading-tight"
          onClick={passBomb}
        >
          <span className="line-clamp-2">{t('game.passTo', { name: nextPlayer?.name ?? '' })}</span>
          <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
        </Button>
      </div>
    )
  }

  return (
    <>
      {confirmDialog}
      {liveRegion}
      <GameShell
        title={t('title')}
        headerSubtitle={roundLabel}
        onBack={unlimited ? () => void askFinish() : onGameEnd}
        headerRight={headerRight}
        actionBar={actionBar}
        maxWidth={640}
        center={game.phase === 'ready' && game.roundIndex === 0}
      >
        <div className="flex flex-col items-center gap-4">
          {challenge && (
            <PlayingCard corners={false} className="w-full max-w-sm px-5 py-4 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#24201A]/70">
                {t(`game.kinds.${challenge.kind}`)}
              </p>
              <p className={cn('mt-1 break-words font-display font-extrabold', CHALLENGE_VALUE_CLASS[challenge.kind])}>
                {challengeText(challenge)}
              </p>
            </PlayingCard>
          )}

          <div className="flex flex-col items-center gap-1">
            <BombArt ref={bombRef} lit={game.phase === 'burning'} className="h-32 w-32 sm:h-40 sm:w-40" />
            {game.phase === 'burning' && (
              <p aria-hidden className="font-display text-sm italic tracking-[0.06em] text-cream/70">
                {t('game.tickTock')}
              </p>
            )}
          </div>

          <div className="flex w-full flex-col items-center gap-1 text-center">
            <span className="text-sm font-medium text-cream/80">{t('game.holderLead')}</span>
            {holder && (
              <motion.div
                key={holder.id}
                initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex min-w-0 max-w-full items-center gap-3"
              >
                <PlayerIcon player={holder} size="lg" />
                <PlayerName player={holder} className="min-w-0 truncate font-display text-3xl font-bold text-cream" />
              </motion.div>
            )}
          </div>

          {game.phase === 'burning' ? (
            <div className="flex flex-col items-center gap-2">
              <span className="rounded-full border border-gold/30 bg-black/20 px-3 py-1 text-xs font-semibold tabular-nums text-cream/80">
                {t('game.passes', { count: game.passes })}
              </span>
              {penaltyFor ? (
                <p className="rounded-xl bg-suit-red px-3 py-2 text-center text-sm font-semibold text-cream">
                  {t(soft ? 'soft.rejectPenalty' : 'game.rejectPenalty', { name: nameOf(penaltyFor) })}
                </p>
              ) : game.rejectsInARow > 0 ? (
                <p className="text-center text-sm font-semibold text-red-300">
                  {t(soft ? 'soft.rejectedOnce' : 'game.rejectedOnce', { name: holder?.name ?? '' })}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <p className="max-w-sm text-center text-sm text-cream/80">{t('game.readyHint')}</p>
              {game.roundIndex > 0 && <Standings state={game} players={players} soft={soft} />}
            </>
          )}
        </div>
      </GameShell>
    </>
  )
}

/** Tableau des explosions entre deux manches, du moins exposé au plus exposé. */
function Standings({ state, players, soft }: { state: PcState; players: Player[]; soft: boolean }) {
  const t = useTranslations('games.patate-chaude')
  const tc = useTranslations('common')
  const format = useFormatter()
  return (
    <section className="w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
        {t('game.standings')}
      </h3>
      <ul className="space-y-1.5">
        {ranking(state).map((row) => {
          const player = players.find((p) => p.id === row.playerId)
          if (!player) return null
          return (
            <li key={row.playerId} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
              <PlayerIcon player={player} size="md" />
              <PlayerName player={player} className="min-w-0 flex-1 truncate text-sm font-semibold text-cream" />
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-cream/80">
                <Bomb aria-hidden className="h-4 w-4 text-gold" />
                <span aria-hidden>{format.number(row.explosions)}</span>
                <span className="sr-only">{t('game.explosions', { count: row.explosions })}</span>
              </span>
              <span className="w-[5.5rem] shrink-0 text-right font-display text-sm font-bold tabular-nums lining-nums text-gold">
                {soft
                  ? t('soft.points', { count: pcTally(row, 'soft') })
                  : tc('sipsCount', { count: pcTally(row, 'alcool') })}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
