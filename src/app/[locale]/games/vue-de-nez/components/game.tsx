/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Diff, Eye, Lock, RotateCcw, Trophy, Undo2 } from 'lucide-react'
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
import { useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import type { VdnTheme } from '@/lib/vue-de-nez/data/types'
import {
  VDN_MAX_ABS_ESTIMATE,
  VDN_POINTS,
  VDN_SAVE_ID,
  VDN_SAVE_VERSION,
  VDN_SIPS,
  allAnswered,
  answerOrder,
  createGame,
  currentMin,
  currentQuestionId,
  hasAnswered,
  nextQuestion,
  nextToAnswer,
  ranking,
  restoreVdnSave,
  reveal,
  scaleFor,
  sipsDrunk,
  sipsGiven,
  submitEstimate,
  toVdnSave,
  type VdnError,
  type VdnQuestionCount,
  type VdnSave,
  type VdnState,
  type VdnTag,
} from '@/lib/vue-de-nez/engine'
import { parseEstimateInput, sanitizeEstimateDraft } from '@/lib/vue-de-nez/input'
import { VDN_QUESTION_IDS, loadVdnQuestions, type VdnQuestion } from '@/lib/vue-de-nez/load'
import { VdnRuler, type RulerMarker } from './ruler'
import { QuestionCard, TAG_TONE, useNumberFormats } from './vdn-ui'

interface GameProps {
  players: Player[]
  questionCount: VdnQuestionCount
  themes: VdnTheme[]
  /** Figée au clic « Commencer » : gorgées (alcool) ou points (soft) à l'affichage. */
  ambiance: AmbianceMode
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

type Screen = 'handoff' | 'input' | 'ready' | 'reveal' | 'end'

/** Révélation terminée : toutes les estimations posées, la réponse tombée. */
const ALL_SHOWN = Number.MAX_SAFE_INTEGER
/** Un marqueur toutes les ~0,4 s, plus vite à grande table : la pose entière tient en 4 s environ. */
const REVEAL_BUDGET_MS = 3_600
const BEAT_MIN_MS = 220
const BEAT_MAX_MS = 450
/** Le suspense avant que la réponse tombe. */
const ANSWER_DELAY_MS = 800

const HEADER_BUTTON_CLASS = 'border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold'

export default function Game({ players, questionCount, themes, ambiance, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.vue-de-nez')
  const tc = useTranslations('common')
  const tp = useTranslations('gameUi.passPhone')
  const locale = useLocale()
  const formats = useNumberFormats(locale)
  const reduceMotion = useReducedMotion() ?? false
  const [confirmDialog, confirm] = useConfirmAction()
  const inputId = useId()
  const hintId = useId()
  const soft = ambiance === 'soft'

  const [bank, setBank] = useState<VdnQuestion[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [game, setGame] = useState<VdnState | null>(null)
  const [startError, setStartError] = useState<VdnError | null>(null)
  const [started, setStarted] = useState(false)
  /** Joueur qui tape en ce moment : son champ n'existe que pour lui. */
  const [typingFor, setTypingFor] = useState<string | null>(null)
  /** Joueur choisi à la main pour estimer avant son tour (quelqu'un s'est absenté). */
  const [pickedNext, setPickedNext] = useState<string | null>(null)
  const [lastValidated, setLastValidated] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [submitError, setSubmitError] = useState<VdnError | null>(null)
  const [beat, setBeat] = useState(ALL_SHOWN)

  // La table seule décide, jamais les réglages : la pré-partie revient à ses défauts après un
  // rechargement ou un changement de langue, et un prédicat faux EFFACE la sauvegarde. Elle porte
  // ses propres réglages et ses questions déjà tirées : la partie reprend telle quelle.
  const session = useResumableLocalGame<VdnSave>(VDN_SAVE_ID, VDN_SAVE_VERSION, (s) =>
    restoreVdnSave(s, players.map(p => p.id), VDN_QUESTION_IDS) !== null
  )
  const { save: saveSession, clear: clearSession } = session
  /** Une partie n'est créditée qu'une fois. */
  const gameCountedRef = useRef(false)
  /** Pose des estimations en cours : une relance ou un démontage l'annule. */
  const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const questionsById = useMemo(() => new Map((bank ?? []).map(q => [q.id, q])), [bank])

  const cancelBeats = () => {
    if (beatTimerRef.current) {
      clearTimeout(beatTimerRef.current)
      beatTimerRef.current = null
    }
  }

  // Banque de la langue de la page, un morceau par langue (lib/vue-de-nez/load.ts).
  useEffect(() => {
    let alive = true
    setLoadFailed(false)
    loadVdnQuestions(locale)
      .then(questions => {
        if (alive) setBank(questions)
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [locale, loadAttempt])

  // Partie neuve seulement quand la reprise a été lue ET tranchée, banque chargée.
  useEffect(() => {
    if (!session.ready || session.pending || started || !bank) return
    startNewGame()
    setStarted(true)
  }, [session.ready, session.pending, started, bank])

  // Sauvegarde continue : jamais avant `started` (elle écraserait la sauvegarde proposée), jamais une partie finie.
  useEffect(() => {
    if (!started || !game || game.phase === 'finished') return
    saveSession(toVdnSave(game))
  }, [started, game, saveSession])

  // iOS gèle les minuteurs d'un onglet caché : au retour, la règle se pose d'un coup.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && beatTimerRef.current) {
        cancelBeats()
        setBeat(ALL_SHOWN)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      cancelBeats()
    }
  }, [])

  const screen: Screen | null = !game
    ? null
    : game.phase === 'finished'
      ? 'end'
      : game.phase === 'reveal'
        ? 'reveal'
        : allAnswered(game)
          ? 'ready'
          : typingFor && !hasAnswered(game, typingFor)
            ? 'input'
            : 'handoff'
  const handoffTarget =
    game && screen === 'handoff'
      ? pickedNext && game.playerIds.includes(pickedNext) && !hasAnswered(game, pickedNext)
        ? pickedNext
        : nextToAnswer(game)
      : null
  const revealDone = beat === ALL_SHOWN
  const focusKey = screen === null ? '' : `${screen}|${game?.index ?? 0}|${typingFor ?? ''}|${handoffTarget ?? ''}|${revealDone}`

  // La barre change de bouton à chaque écran : le focus clavier retombait sur <body>.
  useEffect(() => {
    if (!screen) return
    if (screen === 'input') {
      inputRef.current?.focus()
      return
    }
    if (screen === 'end') {
      endTitleRef.current?.focus()
      return
    }
    const active = document.activeElement
    if (active && active !== document.body) return
    actionBarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [focusKey])

  const resetRound = () => {
    setTypingFor(null)
    setPickedNext(null)
    setLastValidated(null)
    setDraft('')
    setSubmitError(null)
  }

  const startNewGame = () => {
    if (!bank) return
    cancelBeats()
    setBeat(ALL_SHOWN)
    resetRound()
    gameCountedRef.current = false
    // Rejouer et ↺ gardent les réglages de la partie (reprise comprise) ; sans partie, ceux de la pré-partie.
    const outcome = createGame({
      playerIds: players.map(p => p.id),
      pool: bank,
      seed: randomSeed(),
      questionCount: game?.settings.questionCount ?? questionCount,
      themes: game?.settings.themes ?? themes,
    })
    if (outcome.ok) {
      setGame(outcome.state)
      setStartError(null)
    } else {
      setGame(null)
      setStartError(outcome.error)
    }
  }

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved || !bank) return
    // Avec la banque chargée : une question sans texte dans cette langue ne se reprend pas.
    const restored = restoreVdnSave(saved, players.map(p => p.id), new Set(bank.map(q => q.id)))
    if (!restored) {
      session.discard()
      return
    }
    cancelBeats()
    setBeat(ALL_SHOWN)
    resetRound()
    gameCountedRef.current = false
    setGame(restored)
    setStarted(true)
  }

  const endGame = (finished: VdnState) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    const rows = ranking(finished)
    for (const row of rows) {
      updatePlayerStats(row.playerId, 'vue-de-nez', {
        gamesPlayed: 1,
        wins: row.won ? 1 : 0,
        totalDrinks: soft ? 0 : sipsDrunk(row.tally),
      })
    }
    // Une partie terminée ne laisse rien derrière elle.
    clearSession()
    if (rows.some(row => row.won)) {
      playGameSound('victory')
      fireConfetti({ particleCount: 90, spread: 80, origin: { x: 0.5, y: 0.3 }, colors: CONFETTI_COLORS })
    }
  }

  const openInput = (playerId: string) => {
    setTypingFor(playerId)
    setDraft('')
    setSubmitError(null)
  }

  const closeInput = () => {
    setTypingFor(null)
    setDraft('')
    setSubmitError(null)
  }

  const toggleSign = () => {
    setDraft(d => (d.startsWith('-') ? d.slice(1) : `-${d}`))
    setSubmitError(null)
    // Toujours dans le geste : le clavier reste ouvert sur iOS.
    inputRef.current?.focus()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!game || !typingFor) return
    const value = parseEstimateInput(draft, formats.decimal)
    if (value === null) {
      setSubmitError('NOT_A_NUMBER')
      return
    }
    const outcome = submitEstimate(game, typingFor, value)
    if (!outcome.ok) {
      setSubmitError(outcome.error)
      return
    }
    setGame(outcome.state)
    setLastValidated(typingFor)
    setTypingFor(null)
    setPickedNext(null)
    setDraft('')
    setSubmitError(null)
    playGameSound(allAnswered(outcome.state) ? 'step' : 'turn')
  }

  const animateReveal = (state: VdnState) => {
    cancelBeats()
    const results = state.reveal?.results ?? []
    const total = results.length
    const finalSound = results.some(r => r.tag === 'bullseye') ? 'correct' : 'reveal'
    if (reduceMotion || total === 0) {
      setBeat(ALL_SHOWN)
      playGameSound(finalSound)
      return
    }
    const beatMs = Math.max(BEAT_MIN_MS, Math.min(BEAT_MAX_MS, Math.round(REVEAL_BUDGET_MS / total)))
    setBeat(1)
    playGameSound('step')
    const schedule = (next: number) => {
      beatTimerRef.current = setTimeout(
        () => {
          beatTimerRef.current = null
          if (next <= total) {
            setBeat(next)
            playGameSound('step')
            schedule(next + 1)
          } else {
            setBeat(ALL_SHOWN)
            playGameSound(finalSound)
          }
        },
        next <= total ? beatMs : ANSWER_DELAY_MS
      )
    }
    schedule(2)
  }

  const revealQuestion = () => {
    if (!game) return
    const question = questionsById.get(currentQuestionId(game) ?? '')
    if (!question) return
    const outcome = reveal(game, question)
    if (!outcome.ok) return
    resetRound()
    setGame(outcome.state)
    animateReveal(outcome.state)
    // Dernière question : les confettis du classement partent sans attendre le chargement de la bibliothèque.
    if (outcome.state.index + 1 >= outcome.state.questionIds.length) preloadConfetti()
  }

  const goNext = () => {
    if (!game) return
    const outcome = nextQuestion(game)
    if (!outcome.ok) return
    cancelBeats()
    setBeat(ALL_SHOWN)
    resetRound()
    setGame(outcome.state)
    if (outcome.state.phase === 'finished') endGame(outcome.state)
  }

  // En pleine partie, ↺ efface les scores de toute la table : on confirme.
  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok) startNewGame()
  }

  if (loadFailed && !bank) {
    return (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640}>
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <p className="text-base text-cream/80">{t('loadFailed')}</p>
          <Button variant="primary" size="gameLg" onClick={() => setLoadAttempt(n => n + 1)}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {t('retry')}
          </Button>
        </div>
      </GameShell>
    )
  }

  if (!session.ready || !bank) return <div className="p-6 text-center text-cream/70">{t('loading')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />

  if (startError) {
    return (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640}>
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <p className="text-base text-cream/80">{t('noQuestions')}</p>
          <Button variant="primary" size="gameLg" onClick={onGameEnd}>
            {tc('back')}
          </Button>
        </div>
      </GameShell>
    )
  }

  if (!game || !screen) return <div className="p-6 text-center text-cream/70">{t('loading')}</div>

  const playerById = (id: string | null | undefined) => (id ? players.find(p => p.id === id) : undefined)
  const nameOf = (id: string | null | undefined) => playerById(id)?.name ?? '?'
  const total = game.questionIds.length
  const question = questionsById.get(currentQuestionId(game) ?? '') ?? null
  const withUnit = (value: string) => (question?.unit ? t('game.valueUnit', { value, unit: question.unit }) : value)
  const verdictFor = (tag: VdnTag) =>
    soft
      ? t(`soft.verdict.${tag}`, { count: Math.abs(VDN_POINTS[tag]) })
      : t(`verdict.${tag}`, { count: VDN_SIPS[tag] })

  // ─── Écran de fin ──────────────────────────────────────────────────────────
  if (screen === 'end') {
    const rows = ranking(game)
    const winners = rows.filter(row => row.won)
    const endTitle =
      winners.length === 1
        ? t('end.winner', { name: nameOf(winners[0].playerId) })
        : winners.length > 1
          ? t('end.tie', { names: winners.map(row => nameOf(row.playerId)).join(', ') })
          : t('end.noWinner')
    return (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640}>
        <section className="flex flex-col items-center gap-2 text-center">
          <Trophy aria-hidden className="h-10 w-10 text-gold" />
          <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
            {endTitle}
          </h2>
          <p className="text-sm text-cream/80">{t('end.subtitle', { count: total })}</p>
        </section>

        <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('end.ranking')}</h3>
          <ol className="space-y-2">
            {rows.map(row => {
              const player = playerById(row.playerId)
              return (
                <li
                  key={row.playerId}
                  className={cn(
                    'flex items-start gap-3 rounded-xl px-3 py-2',
                    row.won ? 'bg-gold/[0.15] ring-1 ring-inset ring-gold/40' : 'bg-black/20'
                  )}
                >
                  <span className="w-6 shrink-0 text-center font-display text-lg font-bold tabular-nums text-gold">{row.rank}</span>
                  {player ? <PlayerIcon player={player} size="md" /> : null}
                  {/* Les points sur la ligne du nom : sur 375 px, le détail garde toute la largeur. */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate font-display text-base font-bold text-cream">
                        {player ? <PlayerName player={player} /> : nameOf(row.playerId)}
                      </p>
                      <span className="shrink-0 font-display text-base font-bold tabular-nums text-gold">
                        {t('end.points', { count: row.score, score: formats.full(row.score) })}
                      </span>
                    </div>
                    <p className="text-xs text-cream/70">
                      {t('end.tally', { closest: row.tally.closest, bullseye: row.tally.bullseye, farthest: row.tally.farthest })}
                    </p>
                    {!soft && (
                      <p className="text-xs text-cream/70">
                        {t('end.sips', { given: sipsGiven(row.tally), drunk: sipsDrunk(row.tally) })}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="vue-de-nez" />}
        >
          <Button variant="primary" size="gameLg" className="w-full" onClick={startNewGame}>
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
  const order = answerOrder(game)
  const answeredCount = order.filter(id => hasAnswered(game, id)).length
  const validatedName = lastValidated ? nameOf(lastValidated) : null
  const card = question ? (
    <QuestionCard
      number={game.index + 1}
      theme={t(`themes.${question.theme}`)}
      text={question.text}
      compact={screen === 'reveal' || screen === 'input'}
    />
  ) : null

  const chips = (
    <section className="mt-4">
      <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
        {t('game.answered', { count: answeredCount, total: order.length })}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {order.map(id => {
          const player = playerById(id)
          const done = hasAnswered(game, id)
          if (done || screen !== 'handoff') {
            return (
              <li
                key={id}
                className={cn(
                  'flex min-h-[44px] items-center gap-1.5 rounded-full border bg-black/20 px-3 text-sm',
                  done ? 'border-emerald-300/40 text-cream/80' : 'border-gold/20 text-cream/70'
                )}
              >
                {done ? <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-300" /> : null}
                {player ? <PlayerName player={player} /> : nameOf(id)}
                {done ? <span className="sr-only">{t('game.chipDone')}</span> : null}
              </li>
            )
          }
          const isTarget = id === handoffTarget
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={isTarget}
                aria-label={t('game.chipPick', { name: nameOf(id) })}
                onClick={() => setPickedNext(id)}
                className={cn(
                  'flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                  isTarget
                    ? 'border-gold/60 bg-gold/[0.15] text-cream'
                    : 'border-gold/20 bg-black/20 text-cream/70 hover:border-gold/40 hover:text-cream'
                )}
              >
                {player ? <PlayerIcon player={player} size="sm" /> : null}
                {player ? <PlayerName player={player} /> : nameOf(id)}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )

  let content: ReactNode = null
  let actionBar: ReactNode = undefined
  let liveText = ''

  if (screen === 'handoff') {
    const target = playerById(handoffTarget)
    liveText = [
      validatedName ? t('game.handoff.validated', { name: validatedName }) : '',
      handoffTarget ? tp('label', { name: nameOf(handoffTarget) }) : '',
    ]
      .filter(Boolean)
      .join(' ')
    content = (
      <>
        <section className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-6 text-center">
          {validatedName ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
              <Check aria-hidden className="h-4 w-4 shrink-0" />
              {t('game.handoff.validated', { name: validatedName })}
            </p>
          ) : null}
          <p className="text-sm font-semibold text-cream/80">{tp('lead')}</p>
          {target ? <PlayerIcon player={target} size="lg" className="h-16 w-16 text-5xl" /> : null}
          <p className="max-w-full break-words font-display text-3xl font-bold leading-tight text-cream">
            {target ? <PlayerName player={target} /> : nameOf(handoffTarget)}
          </p>
          <p className="text-sm text-cream/70">{t('game.handoff.hint')}</p>
        </section>
        {chips}
      </>
    )
    actionBar = (
      <div ref={actionBarRef} className="flex w-full">
        <Button
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          disabled={!handoffTarget}
          onClick={() => {
            if (handoffTarget) openInput(handoffTarget)
          }}
        >
          <Lock aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          {t('game.handoff.cta', { name: nameOf(handoffTarget) })}
        </Button>
      </div>
    )
  } else if (screen === 'input') {
    const typing = playerById(typingFor)
    const min = currentMin(game)
    const parsed = parseEstimateInput(draft, formats.decimal)
    let draftError: VdnError | null = submitError
    if (!draftError && draft.trim() !== '' && draft.trim() !== '-' && parsed === null) draftError = 'NOT_A_NUMBER'
    if (!draftError && parsed !== null && Math.abs(parsed) > VDN_MAX_ABS_ESTIMATE) draftError = 'TOO_LARGE'
    if (!draftError && parsed !== null && parsed < min) draftError = 'BELOW_MIN'
    const errorText =
      draftError === null
        ? null
        : draftError === 'NOT_A_NUMBER'
          ? t('game.input.errors.notANumber')
          : draftError === 'BELOW_MIN'
            ? t('game.input.errors.belowMin', { min: formats.full(min) })
            : draftError === 'TOO_LARGE'
              ? t('game.input.errors.tooLarge')
              : t('game.input.errors.generic')
    content = (
      <form onSubmit={submit} autoComplete="off" className="mt-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
        <label htmlFor={inputId} className="flex items-center gap-2 font-display text-xl font-bold text-cream">
          {typing ? <PlayerIcon player={typing} size="md" /> : null}
          <span className="min-w-0">{t('game.input.label', { name: nameOf(typingFor) })}</span>
        </label>
        <div className="mt-3 flex items-stretch gap-2">
          {min < 0 ? (
            <Button
              type="button"
              variant="quiet"
              size="gameIcon"
              className="h-14 w-14 shrink-0"
              onClick={toggleSign}
              aria-label={t('game.input.sign')}
            >
              <Diff aria-hidden className="h-6 w-6" />
            </Button>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center rounded-xl border border-[#D8CCAE] bg-cream px-4 focus-within:ring-2 focus-within:ring-gold">
            <input
              ref={inputRef}
              id={inputId}
              value={draft}
              onChange={event => {
                setDraft(sanitizeEstimateDraft(event.target.value))
                setSubmitError(null)
              }}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              placeholder={t('game.input.placeholder')}
              aria-describedby={hintId}
              aria-invalid={draftError ? true : undefined}
              className="h-14 min-w-0 flex-1 bg-transparent font-display text-base font-bold tabular-nums text-[#24201A] placeholder:text-[#24201A]/40 focus:outline-none sm:text-3xl"
            />
            {question?.unit ? (
              <span className="ml-2 max-w-[40%] shrink-0 truncate text-sm font-semibold text-[#24201A]/70">{question.unit}</span>
            ) : null}
          </div>
        </div>
        <p
          id={hintId}
          aria-live="polite"
          className={cn('mt-2 min-h-[2.5rem] text-sm', errorText ? 'font-semibold text-red-300' : 'text-cream/80')}
        >
          {errorText ??
            (parsed !== null ? t('game.input.preview', { value: formats.full(parsed) }) : t('game.input.hint'))}
        </p>
        <Button
          type="submit"
          variant="primary"
          size="gameLg"
          className="mt-2 w-full"
          disabled={parsed === null || draftError !== null}
        >
          <Check aria-hidden className="mr-2 h-5 w-5" />
          {t('game.input.submit')}
        </Button>
        <Button type="button" variant="quiet" size="game" className="mt-2 w-full" onClick={closeInput}>
          <Undo2 aria-hidden className="mr-2 h-5 w-5" />
          {t('game.input.notMe')}
        </Button>
      </form>
    )
  } else if (screen === 'ready') {
    liveText = [validatedName ? t('game.handoff.validated', { name: validatedName }) : '', t('game.ready.title')]
      .filter(Boolean)
      .join(' ')
    content = (
      <>
        <section className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-6 text-center">
          {validatedName ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
              <Check aria-hidden className="h-4 w-4 shrink-0" />
              {t('game.handoff.validated', { name: validatedName })}
            </p>
          ) : null}
          <Eye aria-hidden className="h-8 w-8 text-gold" />
          <h2 className="font-display text-2xl font-bold text-gold">{t('game.ready.title')}</h2>
          <p className="text-sm text-cream/80">{t('game.ready.body')}</p>
        </section>
        {chips}
      </>
    )
    actionBar = (
      <div ref={actionBarRef} className="flex w-full">
        <Button variant="primary" size="gameLg" className="w-full whitespace-normal leading-tight" onClick={revealQuestion}>
          <Eye aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          {t('game.ready.cta')}
        </Button>
      </div>
    )
  } else if (game.reveal) {
    const revealed = game.reveal
    const results = revealed.results
    const rowById = new Map(results.map(row => [row.playerId, row]))
    const markers: RulerMarker[] = []
    for (const id of order) {
      const row = rowById.get(id)
      if (!row) continue
      markers.push({
        id,
        value: row.estimate,
        label: formats.short(row.estimate),
        player: playerById(id) ?? { name: '?' },
        tone: row.tag ? TAG_TONE[row.tag] : null,
      })
    }
    const scale = scaleFor(revealed.answer, results.map(row => row.estimate))
    const allEqual = results.length > 1 && results.every(row => row.tag === null)
    const isLast = game.index + 1 >= total
    if (revealDone) {
      liveText = [
        t('game.reveal.live', { answer: withUnit(formats.full(revealed.answer)) }),
        ...results.flatMap(row =>
          row.tag ? [t('game.reveal.liveRow', { name: nameOf(row.playerId), verdict: verdictFor(row.tag) })] : []
        ),
        allEqual ? t(soft ? 'soft.verdict.allEqual' : 'verdict.allEqual') : '',
      ]
        .filter(Boolean)
        .join(' ')
    }
    content = (
      <>
        <section className="mt-4 rounded-2xl border border-gold/20 bg-felt-deep/70 px-2 pb-4 pt-5">
          <VdnRuler
            scale={scale}
            markers={markers}
            shownCount={beat}
            answer={revealDone ? { value: revealed.answer, label: formats.short(revealed.answer) } : null}
            startLabel={formats.short(scale.min)}
            endLabel={formats.short(scale.max)}
            reduceMotion={reduceMotion}
          />
          {scale.kind === 'log' ? <p className="mt-1 px-2 text-right text-xs text-cream/60">{t('game.reveal.logScale')}</p> : null}
          {revealDone ? (
            <div className="mt-3 px-2 text-center">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.reveal.answer')}</p>
              <p className="font-display text-3xl font-bold leading-tight tabular-nums text-gold">
                {formats.full(revealed.answer)}
                {question?.unit ? (
                  <>
                    {' '}
                    <span className="ml-1 font-sans text-base font-semibold text-cream/80">{question.unit}</span>
                  </>
                ) : null}
              </p>
              {question?.source ? (
                <p className="mt-1 text-xs text-cream/70">{t('game.reveal.source', { source: question.source })}</p>
              ) : null}
            </div>
          ) : null}
        </section>
        {revealDone ? (
          <section className="mt-4">
            <ul className="space-y-2">
              {results.map(row => {
                const player = playerById(row.playerId)
                const tone = row.tag ? TAG_TONE[row.tag] : null
                return (
                  <li
                    key={row.playerId}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2',
                      tone === 'win' ? 'bg-gold/[0.15] ring-1 ring-inset ring-gold/40' : 'bg-black/20'
                    )}
                  >
                    {player ? <PlayerIcon player={player} size="md" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold text-cream">
                        {player ? <PlayerName player={player} /> : nameOf(row.playerId)}
                      </p>
                      <p className="text-xs tabular-nums text-cream/70">
                        {t('game.reveal.row', { estimate: formats.full(row.estimate), gap: formats.full(row.gap) })}
                      </p>
                    </div>
                    {row.tag ? (
                      <div className={cn('shrink-0 text-right', tone === 'win' ? 'text-gold' : 'text-red-300')}>
                        {row.tag === 'bullseye' ? (
                          <p className="text-xs font-semibold uppercase tracking-wide">{t('game.reveal.bullseye')}</p>
                        ) : null}
                        <p className="text-sm font-bold">{verdictFor(row.tag)}</p>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {allEqual ? (
              <p className="mt-3 text-center text-sm text-cream/80">{t(soft ? 'soft.verdict.allEqual' : 'verdict.allEqual')}</p>
            ) : null}
          </section>
        ) : null}
      </>
    )
    actionBar = (
      <div ref={actionBarRef} className="flex w-full">
        <Button
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          disabled={!revealDone}
          onClick={goNext}
        >
          {isLast ? t('game.reveal.toRanking') : t('game.reveal.next')}
          <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
        </Button>
      </div>
    )
  }

  return (
    <>
      {confirmDialog}
      <GameShell
        title={t('title')}
        headerSubtitle={t('game.progress', { current: game.index + 1, total })}
        onBack={onGameEnd}
        headerRight={
          <Button
            variant="ghost"
            size="gameIcon"
            onClick={() => void askRestart()}
            aria-label={tc('confirmRestart.confirm')}
            className={HEADER_BUTTON_CLASS}
          >
            <RotateCcw aria-hidden className="h-5 w-5" />
          </Button>
        }
        actionBar={actionBar}
        maxWidth={640}
      >
        <p role="status" aria-live="polite" className="sr-only">
          {liveText}
        </p>
        {card}
        {content}
      </GameShell>
    </>
  )
}
