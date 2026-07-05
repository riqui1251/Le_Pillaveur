"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { QuizClientView } from '@/lib/quiz/engine'
import { QUIZ_QUESTION_MS, QUIZ_REVEAL_MS } from '@/lib/quiz/engine'
import { cn } from '@/lib/utils'

/**
 * LE GRAND PILLAVEUR sur grand écran : la question en TRÈS grand, les
 * 4 choix couleur+forme, la barre de temps, qui a buzzé — les téléphones
 * restent les buzzers. La vue reçue est NEUTRE (jamais la bonne réponse
 * pendant la question).
 */

const CHOICE_STYLE = [
  { shape: '▲', bg: 'from-red-600 to-rose-500' },
  { shape: '■', bg: 'from-blue-600 to-sky-500' },
  { shape: '●', bg: 'from-amber-500 to-yellow-400' },
  { shape: '◆', bg: 'from-emerald-600 to-green-500' },
] as const

export function TvQuiz({ room, state }: { room: TvRoomDto; state: QuizClientView }) {
  const t = useTranslations('tv')
  const tQ = useTranslations('games.quiz.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null) return
    const timer = setInterval(() => setClock(Date.now()), 250)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt])

  const question = state.currentQuestion
  const result = state.lastResult
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const totalPhaseMs = state.phase === 'question' ? QUIZ_QUESTION_MS : QUIZ_REVEAL_MS
  const ranking = [...state.players].sort((a, b) => b.score - a.score)
  const iconOf = (id: string, isBot: boolean) =>
    isBot ? '🤖' : room.members.find((m) => m.userId === id)?.preferences?.icon ?? '👤'

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      {/* Progression + timer */}
      <div className="flex items-center gap-4">
        <span className="text-xl font-black text-white/80">
          {tQ('progress', { n: state.qIdx + 1, total: state.questionCount })}
        </span>
        {timeLeftMs !== null && (
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
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

      {/* Question géante */}
      {question && (
        <div className="rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-blue-600/15 to-transparent px-8 py-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300/70">
            {tQ(`cat.${question.cat}`)}
          </p>
          <p className="mt-2 text-4xl font-black leading-tight text-white">{question.q}</p>
        </div>
      )}

      {/* Choix */}
      {question && (
        <div className="grid flex-1 grid-cols-2 gap-3">
          {question.choices.map((choice, idx) => {
            const style = CHOICE_STYLE[idx]
            const isCorrect = state.phase === 'reveal' && result?.answer === idx
            return (
              <div
                key={idx}
                className={cn(
                  'flex items-center gap-4 rounded-3xl bg-gradient-to-br px-6 text-white shadow-xl transition-all',
                  style.bg,
                  state.phase === 'reveal' && !isCorrect && 'opacity-30 saturate-50',
                  isCorrect && 'ring-4 ring-white scale-[1.01]'
                )}
              >
                <span className="text-4xl" aria-hidden>{style.shape}</span>
                <span className="text-2xl font-black leading-tight">{choice}</span>
                {isCorrect && <span className="ml-auto text-4xl">✓</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Joueurs : buzz en direct + scores (reveal = résultats) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {ranking.map((p) => {
          const r = state.phase === 'reveal' ? result?.perPlayer[p.id] : null
          return (
            <span
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-1.5 text-lg font-bold',
                state.phase === 'question' && p.hasAnswered
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                  : r?.correct
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : r && !r.correct
                      ? 'border-red-400/40 bg-red-500/10 text-red-100'
                      : 'border-white/10 bg-white/5 text-white/60'
              )}
            >
              <span aria-hidden>{iconOf(p.id, p.isBot)}</span>
              {p.name}
              {state.phase === 'question' && p.hasAnswered && ' ⚡'}
              {r?.correct && ` +${r.points}`}
              {r && !r.correct && (r.choice === null ? ' 💤' : ' ✗')}
              <span className="text-cyan-200 tabular-nums">· {p.score}</span>
            </span>
          )
        })}
      </div>
      {state.phase === 'question' && (
        <p className="text-center text-sm text-white/40">{t('answerOnPhone')}</p>
      )}
    </div>
  )
}
