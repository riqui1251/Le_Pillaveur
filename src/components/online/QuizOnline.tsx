"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Beer, Check, Home, RefreshCw, Trophy, Zap } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  QUIZ_QUESTION_MS,
  QUIZ_REVEAL_MS,
  type QuizClientView,
} from '@/lib/quiz/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { MedalDot } from './MedalDot'

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

/** Style Kahoot : couleur + forme par choix (0-3). */
const CHOICE_STYLE = [
  { shape: '▲', bg: 'from-red-600 to-rose-500', ring: 'ring-red-300' },
  { shape: '■', bg: 'from-blue-600 to-sky-500', ring: 'ring-blue-300' },
  { shape: '●', bg: 'from-amber-500 to-yellow-400', ring: 'ring-amber-300' },
  { shape: '◆', bg: 'from-emerald-600 to-green-500', ring: 'ring-emerald-300' },
] as const

export function QuizOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.quiz.game')
  const [busy, setBusy] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'quiz' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('quiz', inGame)
  const cosmetics = useMemberCosmetics(room)

  // Horloge locale (compte à rebours décoratif — l'échéance serveur fait foi).
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phaseEndsAt === null || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 250)
    return () => clearInterval(timer)
  }, [view])

  // ÉCHÉANCE DE PHASE : TOUS les clients envoient le tick « advance »
  // (idempotent, jitter) — un arbitre unique au téléphone verrouillé
  // laissait la partie bloquée jusqu'au refresh.
  useEffect(() => {
    if (!view || !room || view.phase === 'finished' || view.phaseEndsAt === null) return
    const expectedVersion = room.stateVersion
    const delay = Math.max(250, view.phaseEndsAt - Date.now() + 300 + Math.random() * 700)
    const timer = setTimeout(() => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'advance', phaseKey: view.phaseKey, expectedVersion }),
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [view, room])

  // Ticks « arbitre » (bots + remplacement des partis).
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (body: Record<string, unknown>) => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const botsPending =
      view.phase === 'question' &&
      view.players.some((p) => p.isBot && !p.leftAt && !p.hasAnswered)
    if (botsPending) {
      botTimer = setTimeout(() => send({ action: 'bot' }), 2500 + Math.random() * 4500)
    }

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
        )
        if (expired) send({ action: 'replace-left' })
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

  if (!inGame) {
    return <GameOnlineLobby gameId="quiz" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const question = view.currentQuestion
  const result = view.lastResult
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const ranking = [...view.players].sort((a, b) => b.score - a.score)

  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion: room.stateVersion }),
      })
    } finally {
      setBusy(false)
    }
  }

  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const totalPhaseMs = view.phase === 'question' ? QUIZ_QUESTION_MS : QUIZ_REVEAL_MS
  const myResult = result && user ? result.perPlayer[user.id] : null

  // ── Podium final ─────────────────────────────────────────────────────────
  if (finished) {
    const last = ranking[ranking.length - 1]
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-white">
        {windowSize.width > 0 && (
          <ReactConfetti width={windowSize.width} height={windowSize.height} numberOfPieces={180} recycle={false} />
        )}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Trophy className="h-14 w-14 text-amber-400" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('victoryTitle', { name: ranking[0]?.name ?? '—' })}</h2>
          {!isSoft && last && <p className="text-sm text-amber-200">{t('lastDrinks', { name: last.name })}</p>}
        </motion.div>

        <XpGainBanner
          won={
            ranking.length > 0 &&
            ranking.find((p) => p.id === user?.id)?.score === ranking[0].score
          }
          playerIds={view.players.map((p) => p.id)}
          className="w-full max-w-sm"
        />

        <div className="w-full max-w-sm space-y-2">
          {ranking.map((p, idx) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                idx === 0 ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/10 bg-white/5'
              )}
            >
              <span className="flex w-7 items-center justify-center">
                {idx < 3 ? (
                  <MedalDot position={idx + 1} />
                ) : (
                  <span className="text-sm font-black tabular-nums text-white/50">{idx + 1}</span>
                )}
              </span>
              <RankCrest role={cosmetics.get(p.id)?.role} />
              <span className="text-xl" aria-hidden>{iconOf(p)}</span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate font-bold" />
              <span className="text-sm font-black tabular-nums text-cyan-200">{p.score}</span>
              {!isSoft && (
                <span className="flex items-center gap-1 text-xs text-white/50">
                  <Beer className="h-3.5 w-3.5 text-amber-300" /> {p.sips}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Espace pour la barre fixe. */}
        <div aria-hidden className="h-16" />

        {/* Rejouer / Quitter : fixes en zone pouce (emprunt direction C). */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-felt-deep/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-sm items-center gap-3">
            <Button
              onClick={() => void leaveRoom()}
              variant="outline"
              className="h-12 flex-[0.8] rounded-2xl border-white/15 bg-white/5 text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              <Home className="mr-1.5 h-4 w-4" /> {t('backToMenu')}
            </Button>
            <Button
              onClick={() => void voteRematch()}
              disabled={iVotedRematch && humanCount > 1}
              className="h-12 flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-base font-bold text-white shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-500"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {iVotedRematch && humanCount > 1
                ? t('rematchWaiting', { count: rematchVotes.length, total: humanCount })
                : t('replay')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-cyan-300/80">
          {t('countdown.title')}
        </p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-cyan-200"
          >
            {secondsLeft}
          </motion.span>
        </AnimatePresence>
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau : progression + score + timer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('progress', { n: view.qIdx + 1, total: view.questionCount })}
          </span>
          <span className="flex items-center gap-2 text-xs font-bold">
            {me && me.streak >= 3 && (
              <span className="flex items-center gap-0.5 text-orange-300">
                <Zap className="h-3.5 w-3.5" /> {me.streak}🔥
              </span>
            )}
            <span className="tabular-nums text-cyan-200">{me?.score ?? 0} pts</span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300 ease-linear',
                timeLeftMs < 5000 ? 'bg-red-400' : 'bg-cyan-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Question */}
      {question && (
        <div className="rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-blue-600/15 to-transparent px-4 py-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/70">
            {t(`cat.${question.cat}`)}
          </p>
          <p className="mt-1 text-lg font-black leading-snug">{question.q}</p>
        </div>
      )}

      {/* Buzzers */}
      {question && (
        <div className="grid grid-cols-2 gap-2.5">
          {question.choices.map((choice, idx) => {
            const style = CHOICE_STYLE[idx]
            const mine = view.myChoice === idx
            const isCorrect = view.phase === 'reveal' && result?.answer === idx
            const isWrongMine =
              view.phase === 'reveal' && mine && result?.answer !== idx
            const disabled = busy || view.phase !== 'question' || view.myChoice !== null
            return (
              <button
                key={idx}
                onClick={() => void sendAction({ action: 'answer', choice: idx })}
                disabled={disabled}
                className={cn(
                  'game-grid-cell relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br px-3 py-3 text-center font-bold text-white shadow-lg transition-all',
                  style.bg,
                  !disabled && 'active:scale-95',
                  mine && view.phase === 'question' && `ring-4 ${style.ring}`,
                  view.phase === 'reveal' && !isCorrect && 'opacity-35 saturate-50',
                  isCorrect && 'ring-4 ring-white scale-[1.02]',
                  isWrongMine && 'ring-4 ring-red-300'
                )}
              >
                <span className="text-xl leading-none" aria-hidden>{style.shape}</span>
                <span className="text-sm leading-tight">{choice}</span>
                {mine && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/25">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Feedback question / reveal */}
      {view.phase === 'question' && (
        <p className="text-center text-xs font-semibold text-white/50">
          {view.myChoice !== null ? t('answerSent') : t('answerPrompt')}
        </p>
      )}
      <AnimatePresence>
        {view.phase === 'reveal' && result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2.5 rounded-2xl border border-gold/15 bg-felt-deep/80 p-3"
          >
            {myResult && (
              <p
                className={cn(
                  'text-center text-base font-black',
                  myResult.correct ? 'text-emerald-300' : 'text-red-300'
                )}
              >
                {myResult.correct
                  ? t('correct', { points: myResult.points })
                  : t(isSoft ? 'wrongSoft' : 'wrong', { sips: myResult.sips })}
              </p>
            )}
            {/* Mini classement live */}
            <div className="space-y-1">
              {ranking.map((p) => {
                const r = result.perPlayer[p.id]
                return (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span aria-hidden>{iconOf(p)}</span>
                    <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate font-semibold text-white/75" />
                    {r && (
                      <span className={cn('font-bold', r.correct ? 'text-emerald-300' : 'text-red-300/80')}>
                        {r.correct ? `+${r.points}` : r.choice === null ? '💤' : '✗'}
                      </span>
                    )}
                    <span className="w-12 text-right font-black tabular-nums text-cyan-200">{p.score}</span>
                  </div>
                )
              })}
            </div>
            <Button
              onClick={() => void sendAction({ action: 'continue' })}
              disabled={busy}
              variant="outline"
              className="w-full rounded-xl border-white/15 bg-white/5 py-2.5 text-xs font-semibold text-white/70 hover:bg-white/10"
            >
              {t('skipReveal')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Qui a buzzé */}
      {view.phase === 'question' && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {view.players.map((p) => (
            <span
              key={p.id}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                p.hasAnswered
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                  : 'border-white/10 bg-white/5 text-white/40'
              )}
            >
              <span aria-hidden>{iconOf(p)}</span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              {p.hasAnswered && ' ✓'}
            </span>
          ))}
        </div>
      )}
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="quiz" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
