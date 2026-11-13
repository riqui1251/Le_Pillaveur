"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Diff, Loader2, Lock, PencilLine, Trophy, WifiOff } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { ADVANCE_TICK_MIN_DELAY_MS, useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useDeadline } from '@/hooks/useDeadline'
import { useGameAction } from '@/hooks/useGameAction'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { OnlineEndScreen } from './OnlineEndScreen'
import { XpGainBanner } from './XpGainBanner'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { Button } from '@/components/ui/button'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import {
  VDN_MAX_ABS_ESTIMATE,
  VDN_POINTS,
  VDN_SIPS,
  scaleFor,
  sipsDrunk,
  sipsGiven,
  type VdnTag,
} from '@/lib/vue-de-nez/engine'
import { parseEstimateInput, sanitizeEstimateDraft } from '@/lib/vue-de-nez/input'
import {
  VDN_ANSWER_MS,
  VDN_REVEAL_MS,
  vdnBotDueAt,
  vdnBotTempoRand,
  vdnPendingBot,
  vdnRevealLeader,
  type VdnClientView,
} from '@/lib/vue-de-nez/online-view'
import { VdnRuler, type RulerMarker } from '@/app/[locale]/games/vue-de-nez/components/ruler'
import {
  QuestionCard,
  TAG_TONE,
  VDN_ALL_SHOWN,
  useNumberFormats,
  useOnlineRevealBeat,
} from '@/app/[locale]/games/vue-de-nez/components/vdn-ui'

/**
 * À VUE DE NEZ en ligne (serveur-autoritaire). Une question à réponse
 * chiffrée pour toute la table ; chacun estime en SECRET sur son téléphone et
 * peut corriger jusqu'à la révélation (la vue ne porte que « a répondu » pour
 * les autres). Elle tombe dès que la table présente a répondu, au plus tard
 * au bout des 60 s : les estimations se posent sur la règle graduée du jeu
 * local, puis la réponse et sa source. Gorgées ou points selon l'ambiance de
 * CE téléphone ; « Question suivante » chez le meneur seulement.
 */

type DraftError = 'NOT_A_NUMBER' | 'BELOW_MIN' | 'TOO_LARGE'

function parseView(json: string | null | undefined): VdnClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as VdnClientView
    return Array.isArray(v.players) && Array.isArray(v.ranking) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function VueDeNezOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.vue-de-nez')
  const tc = useTranslations('common')
  const locale = useLocale()
  const formats = useNumberFormats(locale)
  const reduceMotion = useReducedMotion() ?? false
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const formId = useId()
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  /** Le formulaire vient de disparaître (envoi, « Annuler ») : « Corriger mon estimation » reprendra le focus. */
  const focusEditRef = useRef(false)

  const inGame = room?.gameId === 'vue-de-nez' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('vue-de-nez', inGame)
  const cosmetics = useMemberCosmetics(room)
  // Le serveur refuse « Question suivante » avant le temps de lecture (READING_TIME) : bouton grisé jusque-là.
  const continueUnlocked = useDeadline(view?.phase === 'reveal' ? view.continueAt : null)

  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [submitError, setSubmitError] = useState<DraftError | null>(null)
  const phaseKeyNow = view?.phaseKey ?? null
  const phaseNow = view?.phase ?? null

  // À chaque nouvelle PHASE, pas à chaque version : l'estimation d'un autre
  // fait monter la version et effaçait le nombre qu'on était en train de taper.
  useEffect(() => {
    setDraft('')
    setEditing(false)
    setSubmitError(null)
    focusEditRef.current = false
  }, [phaseKeyNow])

  // Révélation posée marqueur par marqueur ; un seul son, quand la réponse
  // tombe — toute la table l'entend de chaque téléphone à la fois.
  const bullseye = Boolean(view?.reveal?.results.some((r) => r.tag === 'bullseye'))
  const beat = useOnlineRevealBeat({
    phaseKey: phaseKeyNow,
    phase: phaseNow,
    count: view?.reveal?.results.length ?? 0,
    reduceMotion,
    onAnswer: () => playGameSound(bullseye ? 'correct' : 'reveal'),
  })

  // Le formulaire disparaît avec le champ ou le bouton qui avait le focus, qui
  // retombait sur <body> : « Corriger mon estimation » le reprend dès qu'il est
  // monté et actif (la vue du serveur peut arriver un rendu plus tard).
  useEffect(() => {
    const button = editButtonRef.current
    if (!focusEditRef.current || !button || button.disabled) return
    focusEditRef.current = false
    const active = document.activeElement
    if (active && active !== document.body) return
    button.focus({ preventScroll: true })
  })

  // Révélation : la barre change de bouton (« Question suivante » se débloque
  // après la pose) ; un focus perdu va au premier bouton actif, comme en local.
  const revealFocusKey =
    phaseNow === 'reveal' ? `${phaseKeyNow}|${beat === VDN_ALL_SHOWN}|${continueUnlocked}|${busy}` : ''
  useEffect(() => {
    if (!revealFocusKey) return
    const active = document.activeElement
    if (active && active !== document.body) return
    actionsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [revealFocusKey])

  // ── Ticks de service ─────────────────────────────────────────────────────
  const live = Boolean(view && user && room && view.phase !== 'finished')
  // Échéances (question 60 s, révélation 30 s) : arbitrage par rang.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: live,
    advance: view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })
  // Un bot estime par tick, au tempo de son persona compté depuis le début de
  // la question (même formule que serviceTick) : les estimations des autres ne
  // repoussent plus son coup, un bot en retard part aussitôt.
  const pendingBot = view ? vdnPendingBot(view.phase, view.players) : undefined
  let botTick: { body: Record<string, unknown>; delayMs: number } | null = null
  if (view && pendingBot) {
    const now = Date.now()
    const tempoMs = botTickDelayMs(pendingBot.name, vdnBotTempoRand(pendingBot.id, view.phaseKey))
    botTick = {
      body: { action: 'bot' },
      delayMs: Math.max(ADVANCE_TICK_MIN_DELAY_MS, vdnBotDueAt(view.phaseEndsAt, tempoMs, now) - now),
    }
  }
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: live,
    botTick,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="vue-de-nez" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6">
        <Loader2 aria-hidden className="h-8 w-8 text-gold motion-safe:animate-spin" />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const playerOf = (id: string) => view.players.find((p) => p.id === id)
  const nameOf = (id: string) => playerOf(id)?.name ?? '—'
  const verdictFor = (tag: VdnTag) =>
    soft
      ? t(`soft.verdict.${tag}`, { count: Math.abs(VDN_POINTS[tag]) })
      : t(`verdict.${tag}`, { count: VDN_SIPS[tag] })
  const question = view.question
  const withUnit = (value: string) => (question?.unit ? t('game.valueUnit', { value, unit: question.unit }) : value)
  const youTag = (id: string) =>
    id === user.id ? <span className="ml-1 text-sm font-semibold text-cream/70">{t('online.you')}</span> : null
  const avatarOf = (id: string, className = 'text-2xl') => {
    const p = playerOf(id)
    return p ? (
      <span aria-hidden className={cn('shrink-0 leading-none', className)}>
        <PlayerAvatarGlyph value={iconOf(p)} />
      </span>
    ) : null
  }

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (view.phase === 'finished') {
    const winners = view.ranking.filter((row) => row.won)
    const title =
      winners.length === 1
        ? t('end.winner', { name: nameOf(winners[0].playerId) })
        : winners.length > 1
          ? t('end.tie', { names: winners.map((row) => nameOf(row.playerId)).join(', ') })
          : t('end.noWinner')
    const won = winners.some((row) => row.playerId === user.id)
    return (
      <OnlineEndScreen
        confetti={winners.length > 0}
        won={won}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy aria-hidden className="h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl font-bold text-gold">{title}</h2>
            <p className="text-sm text-cream/80">{t('end.subtitle', { count: view.questionCount })}</p>
          </motion.div>
        }
        ranking={
          <section className="w-full max-w-sm rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('end.ranking')}</h3>
            <ol className="space-y-2">
              {view.ranking.map((row) => (
                <li
                  key={row.playerId}
                  className={cn(
                    'flex items-start gap-3 rounded-xl px-3 py-2',
                    row.won ? 'bg-gold/[0.15] ring-1 ring-inset ring-gold/40' : 'bg-black/20'
                  )}
                >
                  <span className="w-6 shrink-0 text-center font-display text-lg font-bold tabular-nums text-gold">{row.rank}</span>
                  {avatarOf(row.playerId, 'text-xl')}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate font-display text-base font-bold text-cream">
                        <OnlinePlayerName name={nameOf(row.playerId)} cosmetics={cosmetics.get(row.playerId)} />
                        {youTag(row.playerId)}
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
              ))}
            </ol>
          </section>
        }
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const isAnswering = view.phase === 'answering'
  const seat = playerOf(user.id)
  const seated = Boolean(seat && !seat.isBot && !seat.leftAt)
  const active = view.players.filter((p) => !p.leftAt)
  const answeredCount = active.filter((p) => p.hasAnswered).length
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const isLast = view.questionNumber >= view.questionCount
  const revealDone = beat === VDN_ALL_SHOWN
  // « Question suivante » : le meneur seul (le serveur refuse les autres), la suite arrive sinon à l'échéance.
  const leader = vdnRevealLeader(view.players)
  const isLeader = leader?.id === user.id

  // Saisie simultanée : SANS verrou de version (l'estimation d'un autre le
  // ferait sauter, et le 409 est muet), plus un renvoi si l'écriture a perdu
  // la course côté serveur.
  const sendUnlocked = async (body: Record<string, unknown>) => {
    const res = await sendAction(body)
    return res?.status === 409 ? sendAction(body) : res
  }

  const min = question?.min ?? 0
  const parsed = parseEstimateInput(draft, formats.decimal)
  let draftError: DraftError | null = submitError
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
          : t('game.input.errors.tooLarge')
  const showForm = isAnswering && seated && (view.myEstimate === null || editing)

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!showForm || busy) return
    const value = parseEstimateInput(draft, formats.decimal)
    if (value === null) {
      setSubmitError('NOT_A_NUMBER')
      return
    }
    if (draftError) return
    const res = await sendUnlocked({ action: 'estimate', value })
    if (res?.ok) {
      focusEditRef.current = true
      setDraft('')
      setEditing(false)
      setSubmitError(null)
      playGameSound('turn')
    }
  }

  const startEditing = () => {
    // Le champ rendu tout de suite, puis le focus DANS le geste : iOS n'ouvre le clavier qu'ainsi.
    flushSync(() => {
      setEditing(true)
      setDraft(view.myEstimate !== null ? sanitizeEstimateDraft(formats.full(view.myEstimate)) : '')
      setSubmitError(null)
    })
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }

  const cancelEditing = () => {
    focusEditRef.current = true
    setEditing(false)
  }

  const toggleSign = () => {
    setDraft((d) => (d.startsWith('-') ? d.slice(1) : `-${d}`))
    setSubmitError(null)
    // Dans le geste : le clavier reste ouvert sur iOS.
    inputRef.current?.focus()
  }

  // ── Révélation ───────────────────────────────────────────────────────────
  const revealed = view.phase === 'reveal' ? view.reveal : null
  const results = revealed?.results ?? []
  const markers: RulerMarker[] = view.players.flatMap((p) => {
    const row = results.find((r) => r.playerId === p.id)
    return row
      ? [
          {
            id: p.id,
            value: row.estimate,
            label: formats.short(row.estimate),
            player: { name: p.name },
            avatar: <PlayerAvatarGlyph value={iconOf(p)} />,
            tone: row.tag ? TAG_TONE[row.tag] : null,
          },
        ]
      : []
  })
  const scale = revealed ? scaleFor(revealed.answer, results.map((r) => r.estimate)) : null
  const silent = view.players.filter((p) => !results.some((r) => r.playerId === p.id))
  const allEqual = results.length > 1 && results.every((r) => r.tag === null)
  const revealNote =
    results.length === 0
      ? t('online.nobodyAnswered')
      : results.length === 1
        ? t('online.singleAnswer')
        : allEqual
          ? t(soft ? 'soft.verdict.allEqual' : 'verdict.allEqual')
          : null
  // Région montée en permanence : l'envoi s'annonce (le bloc « Estimation envoyée » n'est pas une région live).
  const liveText =
    revealed && revealDone
      ? [
          t('game.reveal.live', { answer: withUnit(formats.full(revealed.answer)) }),
          ...results.flatMap((r) =>
            r.tag ? [t('game.reveal.liveRow', { name: nameOf(r.playerId), verdict: verdictFor(r.tag) })] : []
          ),
          revealNote ?? '',
        ]
          .filter(Boolean)
          .join(' ')
      : isAnswering && seated && view.myEstimate !== null && !showForm
        ? t('online.sealedTitle')
        : ''

  let content: ReactNode = null
  let actions: ReactNode = null

  if (isAnswering) {
    content = (
      <>
        {showForm ? (
          <form
            id={formId}
            onSubmit={(event) => void submit(event)}
            autoComplete="off"
            className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4"
          >
            <label htmlFor={inputId} className="font-display text-lg font-bold text-cream">
              {t('online.yourEstimate')}
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
                  onChange={(event) => {
                    setDraft(sanitizeEstimateDraft(event.target.value))
                    setSubmitError(null)
                  }}
                  inputMode="decimal"
                  enterKeyHint="send"
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
          </form>
        ) : seated && view.myEstimate !== null ? (
          <section className="flex flex-col items-center gap-1 rounded-2xl border border-emerald-300/40 bg-felt-deep/70 px-4 py-5 text-center">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
              <Lock aria-hidden className="h-4 w-4 shrink-0" />
              {t('online.sealedTitle')}
            </p>
            <p className="max-w-full break-words font-display text-3xl font-bold tabular-nums text-cream">
              {withUnit(formats.full(view.myEstimate))}
            </p>
            <p className="text-sm text-cream/70">{t('online.sealedHint')}</p>
          </section>
        ) : (
          <p className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-4 text-center text-sm text-cream/80">
            {t('online.spectating')}
          </p>
        )}

        <section>
          <h2 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            {t('game.answered', { count: answeredCount, total: active.length })}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {view.players.map((p) => {
              const away = Boolean(p.leftAt)
              const done = p.hasAnswered && !away
              return (
                <li
                  key={p.id}
                  className={cn(
                    'inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-full border bg-black/20 px-3 text-sm',
                    done ? 'border-emerald-300/40 text-cream' : 'border-gold/20 text-cream/80',
                    away && 'opacity-40'
                  )}
                >
                  <span aria-hidden className="shrink-0 leading-none">
                    <PlayerAvatarGlyph value={iconOf(p)} />
                  </span>
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 truncate" />
                  {done && (
                    <>
                      <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={3} />
                      <span className="sr-only">{` (${t('game.chipDone')})`}</span>
                    </>
                  )}
                  {away && (
                    <>
                      <WifiOff aria-hidden className="h-4 w-4 shrink-0 text-cream/80" />
                      <span className="sr-only">{` (${t('online.awayTag')})`}</span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </>
    )
    if (showForm) {
      actions = (
        <div className="flex gap-2">
          {editing && (
            <Button variant="quiet" size="gameLg" className="shrink-0" disabled={busy} onClick={cancelEditing}>
              {tc('cancel')}
            </Button>
          )}
          <Button
            type="submit"
            form={formId}
            variant="primary"
            size="gameLg"
            className="min-w-0 flex-1"
            disabled={busy || parsed === null || draftError !== null}
          >
            {busy ? (
              <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />
            ) : (
              <Check aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            )}
            {t('game.input.submit')}
          </Button>
        </div>
      )
    } else if (seated && view.myEstimate !== null) {
      actions = (
        <Button ref={editButtonRef} variant="quiet" size="gameLg" className="w-full" disabled={busy} onClick={startEditing}>
          <PencilLine aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          {t('online.edit')}
        </Button>
      )
    }
  } else if (revealed && scale) {
    content = (
      <>
        <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-2 pb-4 pt-5">
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
              <p className="mt-1 text-xs text-cream/70">{t('game.reveal.source', { source: revealed.source })}</p>
            </div>
          ) : null}
        </section>
        {revealDone ? (
          <section>
            <ul className="space-y-2">
              {results.map((row) => {
                const tone = row.tag ? TAG_TONE[row.tag] : null
                return (
                  <li
                    key={row.playerId}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2',
                      tone === 'win' ? 'bg-gold/[0.15] ring-1 ring-inset ring-gold/40' : 'bg-black/20'
                    )}
                  >
                    {avatarOf(row.playerId)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold text-cream">
                        <OnlinePlayerName name={nameOf(row.playerId)} cosmetics={cosmetics.get(row.playerId)} />
                        {youTag(row.playerId)}
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
              {silent.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
                  {avatarOf(p.id)}
                  <p className="min-w-0 flex-1 truncate font-display text-base font-bold text-cream/80">
                    <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                    {youTag(p.id)}
                  </p>
                  <span className="shrink-0 text-sm text-cream/70">{t('online.noAnswer')}</span>
                </li>
              ))}
            </ul>
            {revealNote ? <p className="mt-3 text-center text-sm text-cream/80">{revealNote}</p> : null}
          </section>
        ) : null}
      </>
    )
    if (isLeader) {
      actions = (
        <Button
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          disabled={busy || !continueUnlocked || !revealDone}
          onClick={() => void sendUnlocked({ action: 'continue' })}
        >
          {isLast ? t('game.reveal.toRanking') : t('game.reveal.next')}
          <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
        </Button>
      )
    }
  }

  return (
    <>
      <div className={cn('flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg', onlineActionBarPadding('tall'))}>
        <PhaseHeader
          round={t('game.progress', { current: view.questionNumber, total: view.questionCount })}
          phase={isAnswering ? t('online.phaseAnswer') : t('online.phaseReveal')}
          endsAt={view.phaseEndsAt}
          total={isAnswering ? VDN_ANSWER_MS : VDN_REVEAL_MS}
          right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
          status={
            isAnswering ? null : leader && !isLeader ? t('online.leaderNext', { name: leader.name }) : t('online.autoNext')
          }
        />
        {tutorial.open && <GameTutorialModal gameId="vue-de-nez" onClose={tutorial.close} />}

        <p role="status" aria-live="polite" className="sr-only">
          {liveText}
        </p>

        {leftPlayer?.leftAt ? (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        ) : null}

        {question ? (
          <QuestionCard
            number={view.questionNumber}
            theme={t(`themes.${question.theme}`)}
            text={question.text}
            compact={!isAnswering || showForm}
          />
        ) : null}

        {content}
      </div>

      <OnlineActionBar status={actionError ? <span className="font-semibold text-red-300">{actionError}</span> : null} maxWidthClass="max-w-lg">
        <div ref={actionsRef}>{actions}</div>
      </OnlineActionBar>
    </>
  )
}
