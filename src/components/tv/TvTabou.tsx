"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { TabouClientView } from '@/lib/tabou/engine'
import { TABOU_ROUND_MS } from '@/lib/tabou/engine'
import { cn } from '@/lib/utils'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * TABOU VOCAL sur grand écran : timer, équipe au décrire, score des 2
 * équipes, compteur de manche (trouvés/passés/tabous) — JAMAIS le mot en
 * cours (réservé au décrivant), seul le mot du bilan devient public.
 */
export function TvTabou({ room, state }: { room: TvRoomDto; state: TabouClientView }) {
  const t = useTranslations('games.tabou.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phase])

  const finished = state.phase === 'finished'
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const describer = state.players.find((p) => p.id === state.describerId)
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  if (finished) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">
          🏆 {state.winnerTeam === 'A' ? t('victory.teamAWin') : t('victory.teamBWin')}
        </p>
        <p className="text-2xl text-white/60">{t('score', { a: state.scores.A, b: state.scores.B })}</p>
      </div>
    )
  }

  if (state.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-emerald-300/80">{t('countdown.title')}</p>
        <TvBigCountdown seconds={secondsLeft} colorClass="text-emerald-200" />
      </div>
    )
  }

  if (state.phase === 'roundEnd') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        {state.lastRoundWord && (
          <p className="text-5xl font-black text-white">{t('roundEnd.wordWas', { word: state.lastRoundWord.word })}</p>
        )}
        <div className="flex gap-6 text-2xl font-bold">
          <span className="text-emerald-300">✅ {state.roundStats.found}</span>
          <span className="text-white/50">⏭ {state.roundStats.passed}</span>
          <span className="text-red-300">🚫 {state.roundStats.taboo}</span>
        </div>
        <p className="text-xl font-bold text-emerald-200">{t('score', { a: state.scores.A, b: state.scores.B })}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      <div className="flex items-center gap-4">
        <span className="text-xl font-black text-white/80">{t('score', { a: state.scores.A, b: state.scores.B })}</span>
        <span className="text-lg font-semibold uppercase tracking-widest text-emerald-300">
          {describer ? t('describerIs', { name: describer.name }) : t('phaseDescribing')}
        </span>
        {timeLeftMs !== null && (
          <TvTimeBar timeLeftMs={timeLeftMs} totalMs={TABOU_ROUND_MS} dangerMs={15_000} colorClass="bg-emerald-400" dangerClass="bg-red-400" />
        )}
      </div>

      <div className="flex flex-1 items-center justify-center gap-10">
        {(['A', 'B'] as const).map((team) => (
          <div key={team} className="flex flex-col items-center gap-3">
            <p className={cn('text-2xl font-black', team === 'A' ? 'text-sky-300' : 'text-rose-300')}>
              {team === 'A' ? t('teamA') : t('teamB')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {state.players.filter((p) => p.team === team).map((p) => (
                <span
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-4 py-1.5 text-lg font-bold',
                    'border-white/10 bg-white/5 text-white/70',
                    p.id === state.describerId && 'ring-2 ring-white/60',
                    p.leftAt && 'opacity-40'
                  )}
                >
                  <span aria-hidden>{iconOf(p)}</span>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
