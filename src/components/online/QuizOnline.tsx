"use client"

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Beer, Check, ChevronRight, Flame, Loader2, TimerOff, Trophy, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PhaseHeader } from './PhaseHeader'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  QUIZ_QUESTION_MS,
  QUIZ_REVEAL_MS,
  type QuizClientView,
} from '@/lib/quiz/engine'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { useDeadline } from '@/hooks/useDeadline'
import { quizBuzzerState, type QuizBuzzerState } from '@/lib/quiz/buzzer-state'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { MedalDot } from './MedalDot'
import { QuizSpeechFeed } from './quiz/QuizSpeechFeed'

/**
 * LE GRAND PILLAVEUR en ligne — le téléphone devient un BUZZER : 4 gros
 * boutons couleur + forme (accessibles daltoniens), barre de temps, reveal
 * avec histogramme, podium final. La bonne réponse n'arrive au client qu'au
 * reveal (anti-triche serveur).
 */

function parseView(json: string | null | undefined): QuizClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as QuizClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/**
 * Style Kahoot : couleur + forme par choix (0-3). Paliers foncés sous la
 * crème, encre sur l'or : le blanc tombait à 1,85:1 sur l'or et 2,9:1 sur le
 * vert, là où se lit la réponse (≥ 4,5:1 partout désormais).
 */
const CHOICE_STYLE = [
  { shape: '▲', bg: 'from-red-700 to-red-800', ink: 'text-cream' },
  { shape: '■', bg: 'from-blue-700 to-blue-800', ink: 'text-cream' },
  { shape: '●', bg: 'from-amber-400 to-amber-500', ink: 'text-[#24201A]' },
  { shape: '◆', bg: 'from-emerald-700 to-emerald-800', ink: 'text-cream' },
] as const

/**
 * Opacités GÉNÉRÉES par Tailwind 3.3 (l'ancien opacity-35 ne produisait aucun
 * CSS : les mauvaises réponses restaient pleines au reveal). L'état se lit
 * aussi sans la couleur : anneau, pastille « Ton choix » / « Bonne réponse ».
 */
const BUZZER_STATE_CLASS: Record<QuizBuzzerState, string> = {
  open: '',
  sending: 'ring-4 ring-cream',
  chosen: 'ring-4 ring-cream',
  locked: 'opacity-50',
  correct: 'scale-[1.02] ring-4 ring-cream',
  wrongMine: 'opacity-60 ring-4 ring-red-300',
  wrong: 'opacity-30 saturate-50',
}

export function QuizOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.quiz.game')
  const tc = useTranslations('common')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()
  // Buzzer touché, en attente du serveur : roue sur la case, les autres
  // s'éteignent. Lié à la phase : il s'efface de lui-même à la suivante.
  const [pending, setPending] = useState<{ phaseKey: string; choice: number } | null>(null)

  const inGame = room?.gameId === 'quiz' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('quiz', inGame)
  const cosmetics = useMemberCosmetics(room)
  // Le moteur refuse le saut du reveal avant le temps de lecture (READING_TIME) :
  // le bouton reste éteint jusque-là au lieu d'afficher un refus.
  const skipUnlocked = useDeadline(view?.continueAt ?? null)

  // ÉCHÉANCE DE PHASE : tick « advance » arbitré par rang (cf. useAdvanceTick)
  // — le rang 0 tire à l'échéance, le suivant prend le relais 4 s plus tard si
  // son téléphone est verrouillé, et la version qui bouge coupe les autres.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (bots + remplacement des partis), avec secours par rang.
  const botsPending = Boolean(
    view?.phase === 'question' && view.players.some((p) => p.isBot && !p.leftAt && !p.hasAnswered)
  )
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: botsPending
      ? { body: { action: 'bot' }, delayMs: 2500 + Math.random() * 4500 }
      : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="quiz" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div aria-hidden className="h-8 w-8 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 motion-safe:animate-spin" />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const question = view.currentQuestion
  const result = view.lastResult
  const ranking = [...view.players].sort((a, b) => b.score - a.score)

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })

  const totalPhaseMs = view.phase === 'question' ? QUIZ_QUESTION_MS : QUIZ_REVEAL_MS
  const myResult = result && user ? result.perPlayer[user.id] : null

  // ── Podium final ─────────────────────────────────────────────────────────
  if (finished) {
    const last = ranking[ranking.length - 1]
    const won =
      ranking.length > 0 &&
      ranking.find((p) => p.id === user?.id)?.score === ranking[0].score
    return (
      <OnlineEndScreen
        confetti
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
            <h2 className="font-display text-3xl font-bold text-gold">{t('victoryTitle', { name: ranking[0]?.name ?? '—' })}</h2>
            {!isSoft && last && <p className="text-base text-amber-200">{t('lastDrinks', { name: last.name })}</p>}
          </motion.div>
        }
        ranking={
          <ol className="w-full max-w-sm space-y-2">
            {ranking.map((p, idx) => (
              <li
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  idx === 0 ? 'border-gold/40 bg-gold/10' : 'border-gold/20 bg-felt-deep/70'
                )}
              >
                <span className="flex w-7 items-center justify-center">
                  {idx < 3 ? (
                    <MedalDot position={idx + 1} />
                  ) : (
                    <span className="text-sm font-black tabular-nums text-cream/70">{idx + 1}</span>
                  )}
                </span>
                <RankCrest role={cosmetics.get(p.id)?.role} />
                <span className="text-xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate font-bold text-cream" />
                <span className="text-base font-black tabular-nums text-cyan-200">{p.score}</span>
                {!isSoft && (
                  <span className="flex items-center gap-1 text-sm tabular-nums text-cream/70">
                    <Beer aria-hidden className="h-4 w-4 text-amber-300" />
                    <span aria-hidden>{p.sips}</span>
                    <span className="sr-only">{tc('sipsCount', { count: p.sips })}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        }
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-cream">
        <p className="font-display text-2xl font-bold text-gold">
          {t('countdown.title')}
        </p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="text-8xl font-black tabular-nums text-cyan-200" />
        <p className="text-sm font-semibold text-cream/70">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const isQuestion = view.phase === 'question'
  const isReveal = view.phase === 'reveal'
  const answered = view.myChoice !== null
  const pendingChoice = pending && pending.phaseKey === view.phaseKey && !answered ? pending.choice : null
  const locked = busy || !isQuestion || answered || pendingChoice !== null
  const present = view.players.filter((p) => !p.leftAt)
  const answeredCount = present.filter((p) => p.hasAnswered).length
  const isLastQuestion = view.qIdx + 1 >= view.questionCount
  const hasSpeech = (view.speech ?? []).some((sp) => sp.round === view.qIdx)

  const answer = async (idx: number) => {
    if (locked) return
    const phaseKey = view.phaseKey
    // Deux touchers dans la même image : la première case gagne, comme
    // l'envoi (le hook ne laisse partir qu'une requête à la fois).
    setPending((cur) => (cur && cur.phaseKey === phaseKey ? cur : { phaseKey, choice: idx }))
    const res = await sendAction({ action: 'answer', choice: idx })
    // null : toucher écarté par ce verrou. Refus : la case se rouvre. Succès :
    // la roue tient jusqu'à ce que la vue rapporte le choix.
    if (res && !res.ok) setPending((cur) => (cur?.choice === idx ? null : cur))
  }

  // Ligne d'état collée aux buzzers : consigne, réponse envoyée, puis MON
  // résultat au reveal. Région live : le lecteur d'écran entend le verdict.
  let statusLine: ReactNode = null
  if (actionError) {
    statusLine = <span className="font-semibold text-red-300">{actionError}</span>
  } else if (isQuestion) {
    statusLine = answered ? (
      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
        <Check aria-hidden className="h-4 w-4 shrink-0" />
        {t('answerSent')}
      </span>
    ) : (
      <span className="text-cream/80">{t('answerPrompt')}</span>
    )
  } else if (isReveal && myResult) {
    statusLine = myResult.correct ? (
      <span className="inline-flex items-center gap-1.5 text-base font-bold text-emerald-300">
        <Check aria-hidden className="h-5 w-5 shrink-0" />
        {t('correct', { points: myResult.points })}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-base font-bold text-red-300">
        <X aria-hidden className="h-5 w-5 shrink-0" />
        {t(isSoft ? 'wrongSoft' : 'wrong', { sips: myResult.sips })}
      </span>
    )
  }

  return (
    <>
    {/* Hauteur de la scène, buzzers ancrés en bas (zone du pouce) : le
        milieu (qui a répondu, classement du reveal) prend la place libre et
        défile seul, la question et les buzzers ne bougent pas d'une phase à
        l'autre (sauf écran trop court, où c'est le reveal qui défile). Sur
        grand écran, tout reprend le fil du haut. */}
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:mx-auto sm:w-full sm:max-w-lg">
      <PhaseHeader
        className="shrink-0"
        round={
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <span>{t('progress', { n: view.qIdx + 1, total: view.questionCount })}</span>
            <span className="flex items-center gap-2">
              {me && me.streak >= 3 && (
                <span className="inline-flex items-center gap-0.5 font-bold text-orange-300">
                  <Flame aria-hidden className="h-4 w-4" />
                  <span aria-hidden className="tabular-nums">{me.streak}</span>
                  <span className="sr-only">{t('streak', { count: me.streak })}</span>
                </span>
              )}
              <span className="font-bold tabular-nums text-cyan-200">{t('scorePoints', { count: me?.score ?? 0 })}</span>
            </span>
          </div>
        }
        phase={isReveal ? t('phase.reveal') : question ? t(`cat.${question.cat}`) : t('progress', { n: view.qIdx + 1, total: view.questionCount })}
        endsAt={view.phaseEndsAt}
        total={totalPhaseMs}
        // Le reveal dure 6 s : un seuil de 5 s le passerait au rouge presque
        // tout du long, alors que rien n'y presse.
        dangerMs={isQuestion ? 5000 : 0}
        timerColorClassName="bg-cyan-400"
        right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
      />

      {/* Question : carte crème, encre pure */}
      {question && (
        <div className="shrink-0 rounded-2xl bg-cream px-4 py-4 text-center text-[#24201A] shadow-[0_12px_28px_-18px_rgba(0,0,0,0.9)]">
          <p className="text-lg font-black leading-snug">{question.q}</p>
        </div>
      )}

      {/* Pendant la question, aucun plancher : sur un écran court (iPhone SE
          sous Safari, ≈ 490 px de scène), les buzzers passent avant les puces,
          et le compte des réponses reste lisible dans la ligne d'état. Au
          reveal, 4 rem : le classement garde ses premières lignes (il défile)
          au lieu de s'écraser à zéro. */}
      <div
        className={cn(
          'flex-1 overflow-y-auto sm:flex-none sm:overflow-visible',
          isReveal ? 'min-h-[4rem]' : 'min-h-0'
        )}
      >
        {/* Paroles des bots en tête de la zone qui défile : ni la question ni
            les buzzers ne bougent quand un bot fanfaronne. Monté vide dès la
            question (région live prête avant la première bulle). */}
        <div className={hasSpeech ? 'mb-2' : undefined}>
          <QuizSpeechFeed
            speech={view.speech}
            qIdx={view.qIdx}
            players={view.players}
            iconOf={iconOf}
            meId={user.id}
            variant="phone"
            soft={isSoft}
          />
        </div>

        {/* Qui a buzzé */}
        {isQuestion && (
          <div>
            <ul className="flex flex-wrap justify-center gap-1.5">
              {present.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold',
                    p.hasAnswered
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-cream/20 bg-black/20 text-cream/70'
                  )}
                >
                  <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                  {p.hasAnswered && (
                    <>
                      <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-300" />
                      <span className="sr-only">{t('hasAnswered')}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Classement du reveal */}
        {isReveal && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('liveRanking')}</p>
            <ol className="space-y-1.5">
              {ranking.map((p) => {
                const r = result.perPlayer[p.id]
                return (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                    <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate font-semibold text-cream" />
                    {r && (
                      r.correct ? (
                        <span className="font-bold tabular-nums text-emerald-300">+{r.points}</span>
                      ) : r.choice === null ? (
                        <span className="flex items-center text-cream/60">
                          <TimerOff aria-hidden className="h-4 w-4" />
                          <span className="sr-only">{t('noAnswer')}</span>
                        </span>
                      ) : (
                        <span className="flex items-center text-red-300">
                          <X aria-hidden className="h-4 w-4" />
                          <span className="sr-only">{t('missed')}</span>
                        </span>
                      )
                    )}
                    <span className="w-14 text-right font-black tabular-nums text-cyan-200">{p.score}</span>
                  </li>
                )
              })}
            </ol>
          </motion.div>
        )}
      </div>

      {/* Buzzers, sous le pouce */}
      {question && (
        <div className="shrink-0 space-y-2">
          <div className="flex min-h-[3rem] items-center gap-2">
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="min-w-0 flex-1 text-sm leading-snug"
            >
              {statusLine}
            </p>
            {/* Hors de la région live : le compte bouge à chaque réponse. */}
            {isQuestion && (
              <span className="shrink-0 whitespace-nowrap rounded-full border border-cream/20 bg-black/20 px-3 py-1.5 text-sm font-semibold tabular-nums text-cream/80">
                {t('answersCount', { count: answeredCount, total: present.length })}
              </span>
            )}
            {isReveal && (
              <Button
                variant="quiet"
                size="game"
                className="shrink-0 gap-1 px-3"
                onClick={() => void sendAction({ action: 'continue' })}
                disabled={busy || !skipUnlocked}
              >
                {isLastQuestion ? t('skipToPodium') : t('skipReveal')}
                <ChevronRight aria-hidden className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {question.choices.map((choice, idx) => {
              const style = CHOICE_STYLE[idx]
              const state = quizBuzzerState(idx, {
                phase: view.phase,
                myChoice: view.myChoice,
                pendingChoice,
                answer: result?.answer ?? null,
                revealChoice: myResult?.choice ?? null,
              })
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => void answer(idx)}
                  disabled={locked}
                  className={cn(
                    'relative flex min-h-[5.5rem] items-center justify-center rounded-2xl border border-cream/20 bg-gradient-to-br px-3 pb-4 pt-8 text-center shadow-lg outline-none transition-[transform,opacity,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream',
                    style.bg,
                    style.ink,
                    !locked && 'active:scale-95',
                    BUZZER_STATE_CLASS[state]
                  )}
                >
                  <span aria-hidden className="absolute left-2.5 top-2 text-xl leading-none">{style.shape}</span>
                  {state === 'sending' ? (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cream text-[#24201A]">
                      <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
                      <span className="sr-only">{tc('sending')}</span>
                    </span>
                  ) : state === 'correct' ? (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 whitespace-nowrap rounded-full bg-cream px-2 py-0.5 text-xs font-bold text-[#24201A]">
                      <Check aria-hidden className="h-3.5 w-3.5 text-emerald-700" />
                      {t('rightAnswer')}
                    </span>
                  ) : state === 'chosen' || state === 'wrongMine' ? (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 whitespace-nowrap rounded-full bg-cream px-2 py-0.5 text-xs font-bold text-[#24201A]">
                      {state === 'wrongMine' ? (
                        <X aria-hidden className="h-3.5 w-3.5 text-suit-red" />
                      ) : (
                        <Check aria-hidden className="h-3.5 w-3.5" />
                      )}
                      {t('yourChoice')}
                    </span>
                  ) : null}
                  <span className="text-base font-bold leading-tight">{choice}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="quiz" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
