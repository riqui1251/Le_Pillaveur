"use client"

import { useTranslations } from 'next-intl'
import type { PmuCastState, PmuCastFrame } from '@/lib/cast-types'
import { cn } from '@/lib/utils'

/**
 * Rendu TV du cast Course PMU : la piste avec les 4 chevaux qui avancent en
 * direct (positions via `frame` pendant la course), + le vainqueur à la fin.
 */
export function TvPmu({ state, frame }: { state: PmuCastState; frame: PmuCastFrame | null }) {
  const t = useTranslations('tv')
  const finished = state.phase === 'finished'
  const racing = state.phase === 'racing'
  const finish = state.finish || 100

  const posOf = (key: string, fallback: number) => {
    const live = racing && frame?.positions ? frame.positions[key] : undefined
    return Math.min(live ?? fallback, finish)
  }

  const winner = state.horses.find((h) => h.key === state.winnerKey) ?? null
  const ranked = [...state.horses].sort((a, b) => posOf(b.key, b.position) - posOf(a.key, a.position))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-6 py-5 sm:px-12">
      <div className="text-center">
        {finished && winner ? (
          <>
            <p className="text-4xl" aria-hidden>🏆</p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.3em] text-amber-300/70">{t('winner')}</p>
            <p className="mt-1 text-5xl font-black sm:text-6xl" style={{ color: winner.colorFrom }}>
              {winner.emoji} {winner.name}
            </p>
            {winner.players.length > 0 && <p className="mt-2 text-xl text-white/60">{winner.players.join(', ')}</p>}
          </>
        ) : (
          <p className="text-3xl font-black text-white/80">🏇 {t('racing')}</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
        {state.horses.map((h) => {
          const pct = (posOf(h.key, h.position) / finish) * 100
          const isWinner = finished && h.key === state.winnerKey
          return (
            <div key={h.key} className="flex items-center gap-4">
              <div className="w-44 shrink-0 text-right">
                <p className="text-lg font-bold" style={{ color: h.colorFrom }}>
                  {h.emoji} {h.name}
                </p>
                {h.players.length > 0 && <p className="truncate text-sm text-white/45">{h.players.join(', ')}</p>}
              </div>
              <div
                className={cn(
                  'relative h-14 flex-1 overflow-hidden rounded-2xl border bg-white/[0.04]',
                  isWinner ? 'border-amber-400/60' : 'border-white/10',
                )}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-2xl"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${h.colorFrom}40, ${h.colorTo}70)`,
                    transition: 'width 90ms linear',
                  }}
                />
                <div
                  className="absolute top-0 flex h-full items-center"
                  style={{ left: `${Math.max(pct - 3, 0)}%`, transition: 'left 90ms linear' }}
                >
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-2xl shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${h.colorFrom}, ${h.colorTo})` }}
                  >
                    🐎
                  </div>
                </div>
                <div
                  className="absolute inset-y-0 right-0 w-1.5 opacity-50"
                  style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff, #fff 6px, transparent 6px, transparent 12px)' }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-lg font-bold tabular-nums text-white/50">
                {Math.round(pct)}%
              </span>
            </div>
          )
        })}
      </div>

      {finished && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {ranked.map((h, i) => (
            <div key={h.key} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <span className="text-sm font-black text-white/40">{i + 1}</span>
              <span className="text-base font-bold" style={{ color: h.colorFrom }}>
                {h.emoji} {h.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
