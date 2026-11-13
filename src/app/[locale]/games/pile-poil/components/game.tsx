"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, RotateCcw, Trophy } from 'lucide-react'
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
import { PlayerName } from '@/components/ui/PlayerName'
import { useDeadline } from '@/hooks/useDeadline'
import { useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { isSoundMuted, playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import {
  PILE_POIL_BULLSEYE_REWARD,
  PILE_POIL_SAVE_ID,
  PILE_POIL_SAVE_VERSION,
  cancelRun,
  createGame,
  currentPlayerId,
  finalRanking,
  isBullseye,
  isResumablePilePoilSave,
  nextPlayer,
  nextRound,
  recordResult,
  restorePilePoilSave,
  roundRanking,
  softPoints,
  startRun,
  toPilePoilSave,
  upcomingPlayerId,
  type PilePoilRankedResult,
  type PilePoilSave,
  type PilePoilSettings,
  type PilePoilState,
} from '@/lib/pile-poil/engine'
import { isPlausibleStop, measuredMs, pressStamp } from '@/lib/pile-poil/timing'
import { ChronoDial, type ChronoDialView } from './chrono-dial'
import { WatchedPassPhoneOverlay } from './watched-pass-phone'

interface GameProps {
  players: Player[]
  /** Réglages d'une partie neuve : une partie reprise garde ceux de sa sauvegarde. */
  settings: PilePoilSettings
  /** Figée au clic « Commencer » : gorgées (alcool) ou points (Sans alcool). */
  ambiance: AmbianceMode
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

/** Résultat individuel affiché avant « Au suivant » : un Stop tapé deux fois ne fait pas sauter le joueur suivant. */
const RESULT_HOLD_MS = 1_500
/**
 * Classement du tour, puis écran de fin : leur bouton (« Tour suivant »,
 * « Quitter » en bas du dock) prend la place exacte de celui qui les a
 * ouverts. Sans ce temps de lecture, un double toucher sautait le verdict du
 * tour, ou ramenait au pré-lobby sans montrer le classement final.
 */
const SCREEN_HOLD_MS = 1_000
/**
 * Délai entre la fin du flash « Passe le téléphone » et « Démarrer » : le
 * toucher qui visait le flash (fermé par son minuteur au même instant) ne
 * lance pas le chrono.
 */
const ARM_DELAY_MS = 500
/**
 * Garde-fou : un flash vu ouvert au-delà de ce délai (il dure 1,1 s) n'empêche
 * plus de jouer. S'il est vraiment encore là, il couvre l'écran et reçoit les
 * touchers à la place de « Démarrer » ; sinon, c'est sa détection qui s'est
 * trompée, et le jeu ne reste pas bloqué.
 */
const FLASH_GUARD_MS = 3_000
/**
 * Un clic arrivé moins d'une seconde après un toucher en est l'écho : le
 * toucher a déjà agi au pointerdown. iOS l'envoie à l'élément présent sous le
 * doigt au relâcher — le STOP apparu à la place de « Démarrer ». Seuls le
 * clavier et les lecteurs d'écran agissent par le clic.
 */
const CLICK_ECHO_MS = 1_000

// Barres hautes (consigne + bouton rond de 96 px, ou STOP de 112 px) : le
// padding par défaut de GameShell ne prévoit qu'une rangée de 56 px.
const TALL_BAR_PADDING = 'pb-[calc(10.5rem+env(safe-area-inset-bottom,0px))]'
const RESULT_BAR_PADDING = 'pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]'

type TranslationArgs = Record<string, string | number>

/** Comme Plinko : couper le son coupe aussi la vibration (absente sur iPhone). */
function buzz(pattern: number | number[]) {
  if (isSoundMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // vibration refusée : le son et l'écran suffisent
  }
}

export default function Game({ players, settings, ambiance, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.pile-poil')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [confirmDialog, confirm] = useConfirmAction()

  // La partie (tours, ordre, résultats) vit dans le moteur pur
  // src/lib/pile-poil/engine.ts ; ici, la mesure et l'affichage.
  const [game, setGame] = useState<PilePoilState | null>(null)
  const [started, setStarted] = useState(false)
  /** Départ de l'essai en cours, sur l'horloge de performance.now() (affichage du cadran). */
  const [runStart, setRunStart] = useState<number | null>(null)
  /** Compte les essais : remonte le cadran à chaque départ. */
  const [attempt, setAttempt] = useState(0)
  /** Fin du temps de lecture de l'écran qui vient de s'ouvrir (résultat, classement du tour, fin). */
  const [holdEndsAt, setHoldEndsAt] = useState<number | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [flashOpen, setFlashOpen] = useState(false)
  const [arming, setArming] = useState<{ key: string; at: number } | null>(null)

  // La table seule dans le prédicat : la sauvegarde porte ses propres réglages,
  // que la partie reprise garde (la prop, elle, repart des réglages par défaut
  // à chaque montage du pré-lobby).
  const session = useResumableLocalGame<PilePoilSave>(PILE_POIL_SAVE_ID, PILE_POIL_SAVE_VERSION, (s) =>
    isResumablePilePoilSave(s, players.map(p => p.id))
  )
  const { save: saveSession, clear: clearSession } = session

  /**
   * Départ de l'essai en cours (ou null). En ref : deux toucher sur STOP dans
   * la même image ne doivent enregistrer qu'un résultat.
   */
  const runRef = useRef<number | null>(null)
  /** Dernier toucher vu (pointerdown, pointerup), pour reconnaître l'écho d'un clic. */
  const lastPointerRef = useRef<number | null>(null)
  /** Une partie n'est créditée qu'une fois. */
  const gameCountedRef = useRef(false)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)

  const secondsFormat = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale]
  )
  const formatSeconds = useCallback((ms: number) => secondsFormat.format(ms / 1000), [secondsFormat])
  const formatDelta = useCallback(
    (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${secondsFormat.format(Math.abs(ms) / 1000)}`,
    [secondsFormat]
  )

  // La bibliothèque de confettis arrive par import dynamique : prête pour le premier pile poil.
  useEffect(() => {
    preloadConfetti()
  }, [])

  useEffect(() => {
    const mark = (event: globalThis.PointerEvent) => {
      lastPointerRef.current = event.timeStamp
    }
    window.addEventListener('pointerdown', mark, true)
    window.addEventListener('pointerup', mark, true)
    window.addEventListener('pointercancel', mark, true)
    return () => {
      window.removeEventListener('pointerdown', mark, true)
      window.removeEventListener('pointerup', mark, true)
      window.removeEventListener('pointercancel', mark, true)
    }
  }, [])

  // Partie neuve seulement quand la reprise a été lue ET tranchée.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    gameCountedRef.current = false
    setGame(createGame(players.map(p => p.id), settings, randomSeed()))
    setStarted(true)
  }, [session.ready, session.pending, started, players, settings])

  // Sauvegarde continue ; une partie finie ne laisse rien (toPilePoilSave → null).
  useEffect(() => {
    if (!started || !game) return
    const save = toPilePoilSave(game)
    if (save) saveSession(save)
  }, [started, game, saveSession])

  const phase = game?.phase ?? null
  const turnKey = game ? `${game.roundIndex}:${game.currentIndex}` : ''

  // « Démarrer » ne s'arme qu'une fois le flash « Passe le téléphone » refermé,
  // et un instant après : le toucher qui le fermait ne doit pas lancer le chrono.
  useEffect(() => {
    if (phase !== 'waiting') {
      setArming(null)
      return
    }
    setArming({ key: turnKey, at: Date.now() + (flashOpen ? FLASH_GUARD_MS : ARM_DELAY_MS) })
  }, [phase, flashOpen, turnKey])
  // Clé du tour dans l'armement : au changement de joueur, rien n'est armé dès le premier rendu.
  const armReached = useDeadline(arming && arming.key === turnKey ? arming.at : null)
  const armed = phase === 'waiting' && armReached

  const holdOver = useDeadline(holdEndsAt)
  // Partie reprise sur un résultat ou un classement affiché : pas d'attente à refaire.
  const held = holdEndsAt !== null && !holdOver
  const canGoNext = phase === 'between' && !held

  // Écran quitté pendant la mesure (appel, verrouillage, autre appli) : l'essai
  // ne vaut rien — iOS gèle la page, et le joueur ne voit plus rien. Il recommence.
  useEffect(() => {
    if (phase !== 'running') return
    const abort = () => {
      if (runRef.current === null) return
      runRef.current = null
      setRunStart(null)
      setCancelled(true)
      setGame(g => (g ? cancelRun(g) : g))
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') abort()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', abort)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', abort)
    }
  }, [phase])

  // La barre change de boutons (départ, STOP, suivant, tour suivant) : le focus
  // clavier retombait sur <body>. S'il s'est perdu, il revient au premier
  // bouton actif de la barre, ou au titre de l'écran de fin.
  const barKey = !game ? null : game.phase === 'finished' ? 'end' : `${game.phase}:${armed}:${held}`
  useEffect(() => {
    if (barKey === null) return
    const active = document.activeElement
    if (active && active !== document.body) return
    const target =
      barKey === 'end'
        ? endTitleRef.current
        : actionBarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    target?.focus({ preventScroll: barKey !== 'end' })
  }, [barKey])

  const resetTransient = () => {
    runRef.current = null
    setRunStart(null)
    setHoldEndsAt(null)
    setCancelled(false)
  }

  // Rejouer ou recommencer garde les réglages de la partie en cours : une partie reprise a les siens.
  const newGame = () => {
    resetTransient()
    gameCountedRef.current = false
    setGame(createGame(players.map(p => p.id), game?.settings ?? settings, randomSeed()))
  }

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Réhydratation : les profils viennent de la prop, la sauvegarde ne connaît
    // que des identifiants. Illisible ou autre table → partie neuve.
    const restored = restorePilePoilSave(saved, players.map(p => p.id))
    if (!restored) {
      session.discard()
      return
    }
    resetTransient()
    gameCountedRef.current = false
    setGame(restored)
    setStarted(true)
  }

  const startChrono = (timeStamp: number) => {
    if (!game || game.phase !== 'waiting' || !armed || runRef.current !== null) return
    const startedAt = pressStamp(timeStamp, performance.now())
    runRef.current = startedAt
    setRunStart(startedAt)
    setAttempt(n => n + 1)
    setCancelled(false)
    setGame(startRun(game))
    playGameSound('tick')
  }

  const stopChrono = (timeStamp: number) => {
    const startedAt = runRef.current
    if (startedAt === null || !game || game.phase !== 'running') return
    const stoppedAt = pressStamp(timeStamp, performance.now())
    // Second toucher d'un double toucher sur « Démarrer » : l'essai continue.
    if (!isPlausibleStop(startedAt, stoppedAt)) return
    runRef.current = null
    const next = recordResult(game, measuredMs(startedAt, stoppedAt))
    setGame(next)
    setRunStart(null)
    setHoldEndsAt(Date.now() + RESULT_HOLD_MS)
    const last = next.results[next.results.length - 1]
    const exact = last !== undefined && isBullseye(last.deltaMs)
    playGameSound(exact ? 'correct' : 'dice-result')
    buzz(exact ? [30, 60, 30] : 25)
    if (exact) fireConfetti({ particleCount: 80, spread: 75, origin: { x: 0.5, y: 0.4 }, colors: CONFETTI_COLORS })
  }

  /**
   * Démarrer et STOP agissent au pointerdown : le clic n'arrive qu'au
   * relâcher, 50 à 150 ms plus tard selon le doigt — la mesure en dépendrait.
   */
  const press = (action: (timeStamp: number) => void) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      lastPointerRef.current = event.timeStamp
      action(event.timeStamp)
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      const last = lastPointerRef.current
      if (last !== null && Math.abs(event.timeStamp - last) < CLICK_ECHO_MS) return
      action(event.timeStamp)
    },
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    // Entrée maintenue : la répétition cliquerait sur le STOP à peine apparu.
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.repeat) event.preventDefault()
    },
  })

  const goNextPlayer = () => {
    if (!game || game.phase !== 'between' || !canGoNext) return
    setCancelled(false)
    const next = nextPlayer(game)
    setGame(next)
    setHoldEndsAt(next.phase === 'roundEnd' ? Date.now() + SCREEN_HOLD_MS : null)
    if (next.phase === 'roundEnd') playGameSound('reveal')
  }

  const endGame = (state: PilePoilState) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    for (const row of finalRanking(state)) {
      updatePlayerStats(row.player, 'pile-poil', {
        gamesPlayed: 1,
        wins: row.won ? 1 : 0,
        totalDrinks: ambiance === 'soft' ? 0 : row.penalties,
      })
    }
    // Une partie terminée ne laisse rien derrière elle.
    clearSession()
    playGameSound('victory')
  }

  const goNextRound = () => {
    if (!game || game.phase !== 'roundEnd' || held) return
    const next = nextRound(game)
    setGame(next)
    setHoldEndsAt(next.phase === 'finished' ? Date.now() + SCREEN_HOLD_MS : null)
    if (next.phase === 'finished') endGame(next)
  }

  // ↺ efface les écarts de toute la table : on confirme.
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

  if (!session.ready) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  if (!game) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>

  const soft = ambiance === 'soft'
  /** Textes qui parlent de gorgées : leur variante Sans alcool vit sous `soft.`. */
  const tw = (key: string, values?: TranslationArgs) => t(soft ? `soft.${key}` : key, values)
  const playerById = (id: string | null | undefined) => (id ? players.find(p => p.id === id) : undefined)
  const nameOf = (id: string) => playerById(id)?.name ?? ''
  const joinNames = (ids: string[]) => {
    const names = ids.map(nameOf)
    if (names.length <= 1) return names.join('')
    return t('list.and', { head: names.slice(0, -1).join(', '), last: names[names.length - 1] })
  }
  const unit = t('dial.unit')
  // Espace insécable : sur la consigne en deux lignes, le « s » partait seul à la ligne.
  const withUnit = (ms: number) => `${formatSeconds(ms)}\u00a0${unit}`
  const formatPoints = (points: number) => `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points)}`

  // ─── Écran de fin ──────────────────────────────────────────────────────────
  if (game.phase === 'finished') {
    const ranking = finalRanking(game)
    const winners = ranking.filter(row => row.won)
    const winner = winners.length === 1 ? playerById(winners[0].player) : undefined
    return (
      <GameShell
        title={t('title')}
        onBack={onGameEnd}
        maxWidth={640}
        // Cale de la taille du ↺ : sans elle, le titre glissait à droite du ←.
        headerRight={<span aria-hidden className="h-11 w-11" />}
      >
        <section className="flex flex-col items-center gap-2 text-center">
          <Trophy aria-hidden className="h-10 w-10 text-gold" />
          <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
            {winner ? t('end.winner', { name: winner.name }) : t('end.tie')}
          </h2>
          <p className="text-sm text-cream/70">{t('end.subtitle', { count: game.settings.rounds })}</p>
        </section>

        <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('end.results')}</h3>
          <ol className="space-y-2">
            {ranking.map(row => {
              const player = playerById(row.player)
              if (!player) return null
              const points = softPoints(row)
              return (
                <li
                  key={row.player}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2',
                    row.won ? 'border border-gold/60 bg-gold/[0.15]' : 'bg-black/20'
                  )}
                >
                  <span className="w-5 shrink-0 text-center font-display text-lg font-bold tabular-nums text-gold">{row.rank}</span>
                  <PlayerIcon player={player} size="md" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <PlayerName player={player} className="truncate font-display text-base font-semibold text-cream" />
                    <span className="text-xs tabular-nums text-cream/70">
                      {t('end.gap', { gap: withUnit(row.totalGapMs) })}
                      {row.bullseyes > 0 ? ` · ${t('end.bullseyes', { count: row.bullseyes })}` : null}
                      {/* Sans alcool, les points se comptent à côté : affichés en tête, ils
                          passaient pour le score alors que l'écart cumulé fait le classement. */}
                      {soft ? ` · ${t('soft.end.points', { points: formatPoints(points), count: Math.abs(points) })}` : null}
                    </span>
                  </div>
                  {!soft && (
                    <span className="shrink-0 font-display text-base font-semibold tabular-nums text-gold">
                      {tc('sipsCount', { count: row.penalties })}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="pile-poil" />}
        >
          <Button variant="primary" size="gameLg" className="w-full" disabled={held} onClick={newGame}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {tc('replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" disabled={held} onClick={onGameEnd}>
            {tc('quit')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  }

  // ─── Partie en cours ───────────────────────────────────────────────────────
  const currentId = currentPlayerId(game)
  const current = playerById(currentId)
  const upcoming = playerById(upcomingPlayerId(game))
  const ranked = roundRanking(game.results)
  const lastResult = game.phase === 'between' ? game.results[game.results.length - 1] : undefined
  const lastBullseye = lastResult !== undefined && isBullseye(lastResult.deltaMs)
  const isLastRound = game.roundIndex + 1 >= game.settings.rounds
  const targetText = withUnit(game.target)
  // Classement provisoire : le « plus loin » ne veut rien dire avec un seul résultat.
  const provisionalFurthest = game.results.length >= 2 ? ranked.filter(row => row.furthest) : []
  const roundFurthest = ranked.filter(row => row.furthest)
  const roundBullseyes = ranked.filter(row => row.bullseye)

  const dialView: ChronoDialView =
    game.phase === 'running' && runStart !== null
      ? { kind: 'running', startedAt: runStart }
      : lastResult
        ? { kind: 'result', elapsedMs: lastResult.elapsedMs, deltaMs: lastResult.deltaMs, bullseye: lastBullseye }
        : { kind: 'idle' }

  const furthestLine = (rows: PilePoilRankedResult[]) =>
    tw('verdict.furthestLine', { names: joinNames(rows.map(row => row.player)), people: rows.length, count: rows[0]?.penalty ?? 0 })
  const bullseyeLine = (rows: PilePoilRankedResult[]) =>
    tw('verdict.bullseyeLine', { names: joinNames(rows.map(row => row.player)), people: rows.length, count: PILE_POIL_BULLSEYE_REWARD })

  // Une seule voix pour le lecteur d'écran, montée en permanence : une région
  // créée avec son texte se tait souvent.
  let liveText = ''
  if (game.phase === 'waiting' && cancelled) liveText = t('game.cancelled')
  else if (game.phase === 'between' && lastResult) {
    liveText = t('live.result', {
      name: nameOf(lastResult.player),
      time: withUnit(lastResult.elapsedMs),
      delta: formatDelta(lastResult.deltaMs),
    })
    if (lastBullseye) liveText = `${liveText} ${t('dial.exact')}`
  } else if (game.phase === 'roundEnd') {
    liveText = [
      t('live.roundEnd', { current: game.roundIndex + 1 }),
      roundFurthest.length > 0 ? furthestLine(roundFurthest) : '',
      roundBullseyes.length > 0 ? bullseyeLine(roundBullseyes) : '',
    ].filter(Boolean).join(' ')
  }

  const rowBadge = (row: PilePoilRankedResult, final: boolean) => {
    if (row.bullseye) return { text: tw('verdict.bullseyeBadge', { count: PILE_POIL_BULLSEYE_REWARD }), tone: 'text-gold' }
    if (row.furthest && final) {
      return { text: tw('verdict.furthestBadge', { delta: formatDelta(row.deltaMs), count: row.penalty }), tone: 'text-red-300' }
    }
    const marked = row.furthest && !final && provisionalFurthest.length > 0
    return { text: formatDelta(row.deltaMs), tone: marked ? 'text-red-300' : 'text-cream/70' }
  }

  const resultRows = (rows: PilePoilRankedResult[], final: boolean) => (
    <ol className="space-y-1.5">
      {rows.map(row => {
        const player = playerById(row.player)
        if (!player) return null
        const badge = rowBadge(row, final)
        const lose = row.furthest && (final || provisionalFurthest.length > 0)
        return (
          <li
            key={row.player}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2',
              row.bullseye
                ? 'border border-gold/60 bg-gold/[0.15]'
                : lose
                  ? 'border border-red-300/40 bg-red-300/10'
                  : 'bg-black/20'
            )}
          >
            <span className="w-5 shrink-0 text-center font-display text-base font-bold tabular-nums text-gold">{row.rank}</span>
            <PlayerIcon player={player} size="md" />
            <PlayerName player={player} className="min-w-0 flex-1 truncate text-base font-semibold text-cream" />
            <span className="shrink-0 text-right">
              <span className="block font-display text-base font-bold tabular-nums text-cream">{withUnit(row.elapsedMs)}</span>
              <span className={cn('block text-xs font-semibold tabular-nums', badge.tone)}>{badge.text}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )

  const restartButton = (
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
  let barPadding: string | undefined
  if (game.phase === 'waiting') {
    barPadding = TALL_BAR_PADDING
    actionBar = (
      <div ref={actionBarRef} className="flex w-full flex-col items-center gap-2">
        <p className="line-clamp-2 text-center font-display text-base font-bold leading-snug text-cream">
          {current ? t('game.prompt', { name: current.name, target: targetText }) : null}
        </p>
        <Button
          key="start"
          type="button"
          variant="primary"
          disabled={!armed}
          {...press(startChrono)}
          className="h-24 w-24 rounded-full p-0 font-display text-lg ring-4 ring-gold/20"
        >
          {t('game.start')}
        </Button>
      </div>
    )
  } else if (game.phase === 'running') {
    barPadding = TALL_BAR_PADDING
    actionBar = (
      <div ref={actionBarRef} className="flex w-full">
        <Button
          key="stop"
          type="button"
          variant="primary"
          {...press(stopChrono)}
          className="h-28 w-full rounded-3xl font-display text-4xl tracking-[0.2em]"
        >
          {t('game.stop')}
        </Button>
      </div>
    )
  } else if (game.phase === 'between') {
    barPadding = RESULT_BAR_PADDING
    actionBar = (
      <div ref={actionBarRef} className="flex w-full flex-col gap-2">
        <p className={cn('text-center font-display text-lg font-bold tabular-nums', lastBullseye ? 'text-gold' : 'text-cream')}>
          {lastResult ? t('game.resultLine', { time: withUnit(lastResult.elapsedMs), delta: formatDelta(lastResult.deltaMs) }) : null}
        </p>
        <Button
          key="next"
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          disabled={!canGoNext}
          onClick={goNextPlayer}
        >
          {upcoming ? t('game.next', { name: upcoming.name }) : t('game.showRanking')}
          <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
        </Button>
      </div>
    )
  } else {
    actionBar = (
      <div ref={actionBarRef} className="flex w-full">
        <Button
          key="round"
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          disabled={held}
          onClick={goNextRound}
        >
          {isLastRound ? t('round.final') : t('round.next')}
          <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
        </Button>
      </div>
    )
  }

  const general = game.phase === 'roundEnd' && game.roundIndex > 0 ? finalRanking(game) : []

  return (
    <>
      {confirmDialog}
      <WatchedPassPhoneOverlay
        playerKey={currentId}
        name={current?.name ?? ''}
        avatar={current ? <PlayerIcon player={current} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
        onOpenChange={setFlashOpen}
      />
      <GameShell
        title={t('title')}
        headerSubtitle={t('game.progress', { current: game.roundIndex + 1, total: game.settings.rounds })}
        onBack={onGameEnd}
        headerRight={restartButton}
        actionBar={actionBar}
        maxWidth={640}
        contentClassName={barPadding}
      >
        <p role="status" aria-live="polite" className="sr-only">{liveText}</p>

        {game.phase === 'roundEnd' ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col items-center gap-1 text-center">
              <h2 className="font-display text-2xl font-bold text-gold">
                {t('round.title', { current: game.roundIndex + 1, total: game.settings.rounds })}
              </h2>
              <p className="text-sm text-cream/70">{t('round.target', { target: targetText })}</p>
              {roundFurthest.length > 0 && (
                <p className="mt-2 font-display text-lg font-bold leading-snug text-red-300">{furthestLine(roundFurthest)}</p>
              )}
              {roundBullseyes.length > 0 && (
                <p className="font-display text-lg font-bold leading-snug text-gold">{bullseyeLine(roundBullseyes)}</p>
              )}
            </section>

            <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
              <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('round.ranking')}</h3>
              {resultRows(ranked, true)}
            </section>

            {general.length > 0 && (
              <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('round.general')}</h3>
                <ol className="space-y-1.5">
                  {general.map(row => {
                    const player = playerById(row.player)
                    if (!player) return null
                    return (
                      <li key={row.player} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-1.5">
                        <span className="w-5 shrink-0 text-center font-display text-sm font-bold tabular-nums text-gold">{row.rank}</span>
                        <PlayerName player={player} className="min-w-0 flex-1 truncate text-sm font-semibold text-cream" />
                        <span className="shrink-0 text-sm tabular-nums text-cream/80">{t('end.gap', { gap: withUnit(row.totalGapMs) })}</span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              {current && (
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerIcon player={current} size="lg" />
                  <PlayerName player={current} className="min-w-0 truncate font-display text-2xl font-bold text-cream" />
                </div>
              )}
              <span className="shrink-0 rounded-full border border-gold/30 bg-black/20 px-3 py-1 text-xs font-semibold text-cream/80">
                {t(`game.level.${game.settings.level}`)}
              </span>
            </div>

            <ChronoDial
              key={`${turnKey}#${attempt}`}
              view={dialView}
              targetMs={game.target}
              level={game.settings.level}
              formatSeconds={formatSeconds}
              formatDelta={formatDelta}
            />

            {cancelled && game.phase === 'waiting' && (
              <p className="text-center text-sm font-semibold text-red-300">{t('game.cancelled')}</p>
            )}

            {game.results.length > 0 && (
              <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.provisional')}</h2>
                {resultRows(ranked, false)}
                {provisionalFurthest.length > 0 && (
                  <p className="mt-2 text-sm text-cream/80">
                    {tw('verdict.provisional', {
                      names: joinNames(provisionalFurthest.map(row => row.player)),
                      people: provisionalFurthest.length,
                      count: provisionalFurthest[0].penalty,
                    })}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </GameShell>
    </>
  )
}
