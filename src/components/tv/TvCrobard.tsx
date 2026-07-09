"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { CrobardClientView } from '@/lib/crobard/engine'
import { CROBARD_CHOOSING_MS, CROBARD_DRAWING_MS } from '@/lib/crobard/engine'
import { PartyCanvas } from '@/components/online/PartyCanvas'
import { cn } from '@/lib/utils'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * CROBARD sur grand écran : le canvas en grand (lecture seule), timer,
 * liste « a trouvé » qui s'allonge, score — JAMAIS le mot ni les choix,
 * le clou du spectacle est de voir le dessin se former en direct.
 */
export function TvCrobard({ room, state }: { room: TvRoomDto; state: CrobardClientView }) {
  const t = useTranslations('games.crobard.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phase])

  const finished = state.phase === 'finished'
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const totalPhaseMs = state.phase === 'choosing' ? CROBARD_CHOOSING_MS : CROBARD_DRAWING_MS
  const ranking = [...state.players].sort((a, b) => b.score - a.score)
  const nameOf = (id: string | null | undefined) => state.players.find((p) => p.id === id)?.name ?? '—'
  const drawer = state.players.find((p) => p.id === state.drawerId)

  if (finished) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">🏆 {t('victory.title', { name: nameOf(state.winnerId) })}</p>
        <div className="flex w-full max-w-md flex-col gap-2">
          {ranking.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-xl">
              <span className="font-bold text-white/80">{i + 1}. {p.name}</span>
              <span className="font-black text-fuchsia-300">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (state.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-fuchsia-300/80">{t('countdown.title')}</p>
        <TvBigCountdown seconds={secondsLeft} colorClass="text-fuchsia-200" />
      </div>
    )
  }

  if (state.phase === 'roundEnd') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        {state.lastRoundWord && (
          <p className="text-5xl font-black text-white">{t('roundEnd.wordWas', { word: state.lastRoundWord })}</p>
        )}
        <div className="flex gap-4">
          {ranking.slice(0, 5).map((p, i) => (
            <div key={p.id} className="rounded-xl bg-white/5 px-4 py-2 text-center">
              <p className="text-lg font-bold text-white/70">{i + 1}. {p.name}</p>
              <p className="text-2xl font-black text-fuchsia-300">{p.score}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (state.phase === 'choosing') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-2xl font-black uppercase tracking-widest text-fuchsia-300/80">
          {t('round', { round: state.round, total: state.totalRounds })}
        </p>
        <p className="text-4xl font-black text-white">{t('choosing.waitingFor', { name: nameOf(state.drawerId) })}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full gap-6 p-6">
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="text-xl font-black text-white/80">
            {t('round', { round: state.round, total: state.totalRounds })}
          </span>
          <span className="text-lg font-semibold text-fuchsia-300">{drawer?.name}</span>
          {timeLeftMs !== null && (
            <TvTimeBar timeLeftMs={timeLeftMs} totalMs={totalPhaseMs} dangerMs={15_000} colorClass="bg-fuchsia-400" dangerClass="bg-red-400" />
          )}
        </div>
        <PartyCanvas strokes={state.strokes} readOnly className="flex-1" />
      </div>

      <div className="flex w-72 flex-col gap-2">
        <p className="text-lg font-bold text-white/70">
          {t('foundCount', {
            found: state.correctGuessers.length,
            total: state.players.filter((p) => p.id !== state.drawerId).length,
          })}
        </p>
        {ranking.map((p) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center justify-between rounded-lg px-3 py-1.5',
              state.correctGuessers.includes(p.id) ? 'bg-emerald-500/10 text-emerald-200' : 'bg-white/5 text-white/70'
            )}
          >
            <span className="truncate font-semibold">{p.name}</span>
            <span className="font-black">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
