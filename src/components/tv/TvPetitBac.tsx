"use client"

import { Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { PbcClientView } from '@/lib/petit-bac/engine'
import { PBC_WRITE_MS } from '@/lib/petit-bac/engine'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * PETIT BAC sur grand écran : la lettre en géant et la progression des copies
 * pendant l'écriture (jamais les réponses), puis la grille de comptage au
 * reveal et les totaux.
 */
export function TvPetitBac({ room, state }: { room: TvRoomDto; state: PbcClientView }) {
  const t = useTranslations('games.petit-bac.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null || state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt, state.phase])

  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const submittedCount = state.players.filter((p) => p.hasSubmitted && !p.leftAt).length
  const activeCount = state.players.filter((p) => !p.leftAt).length

  if (state.phase === 'countdown' || state.phase === 'finished') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    const podium = [...state.players].sort((a, b) => b.total - a.total)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        {state.phase === 'finished' ? (
          <>
            <Trophy className="h-16 w-16 text-gold" />
            <p className="text-5xl font-black text-white">{t('finished.title')}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {podium.slice(0, 5).map((p, i) => (
                <span
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-2xl font-black',
                    i === 0 ? 'border-gold/60 bg-gold/15 text-gold' : 'border-[#D8CCAE] bg-cream text-[#24201A]'
                  )}
                >
                  <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                  {p.name}
                  <span className="font-display tabular-nums">{p.total}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-3xl font-black uppercase tracking-widest text-sky-300/80">{t('countdown.title')}</p>
            <TvBigCountdown seconds={secondsLeft} colorClass="text-sky-200" />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold text-white/70">
          {t('round', { n: state.round + 1, total: state.totalRounds })}
        </p>
        <span className="rounded-2xl border-2 border-gold/50 bg-gold/10 px-6 py-1.5 font-display text-6xl font-black text-gold">
          {state.letter}
        </span>
      </div>

      {timeLeftMs !== null && state.phase === 'write' && (
        <TvTimeBar timeLeftMs={timeLeftMs} totalMs={PBC_WRITE_MS} dangerMs={15_000} />
      )}

      {(state.phase === 'write' || state.phase === 'flush') && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <div className="flex flex-wrap justify-center gap-4">
            {state.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-2xl border-2 border-[#D8CCAE] bg-cream px-6 py-3 text-2xl font-black text-[#24201A] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.8)]"
              >
                {t(`categories.${cat}`)}
              </span>
            ))}
          </div>
          <p className="text-3xl font-bold text-white/60">
            {state.phase === 'flush' && state.stopperId
              ? t('stopBy', { name: nameOf(state.stopperId) })
              : t('submitted', { count: submittedCount, total: activeCount })}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {state.players.filter((p) => !p.leftAt).map((p) => (
              <span
                key={p.id}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-4 py-1.5 text-xl font-bold',
                  p.hasSubmitted
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/15 bg-white/5 text-white/70'
                )}
              >
                <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {state.phase === 'reveal' && state.revealGrid && (
        <div className="flex-1 overflow-hidden">
          <div className="grid h-full gap-3" style={{ gridTemplateColumns: `repeat(${state.categories.length}, minmax(0, 1fr))` }}>
            {state.categories.map((cat, i) => (
              <div key={cat} className="flex flex-col gap-2 overflow-hidden">
                <p className="text-center text-lg font-black uppercase tracking-wide text-sky-300/80">
                  {t(`categories.${cat}`)}
                </p>
                {state.revealGrid![i].map((cell) => (
                  <div
                    key={cell.playerId}
                    className="flex items-center gap-2 rounded-xl border border-[#D8CCAE] bg-cream px-3 py-1.5"
                  >
                    <span
                      className={cn(
                        'flex-1 truncate text-lg font-bold',
                        cell.rejected ? 'text-[#B7A87F] line-through' : 'text-[#24201A]',
                        !cell.answer.trim() && 'text-[#B7A87F]'
                      )}
                      title={nameOf(cell.playerId)}
                    >
                      {cell.answer.trim() || '—'}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-display text-xl font-black tabular-nums',
                        cell.points === 2 ? 'text-[#8A6A1B]' : cell.points === 1 ? 'text-sky-800' : 'text-[#B7A87F]'
                      )}
                    >
                      {cell.points}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.phase === 'reveal' && (
        <div className="flex flex-wrap justify-center gap-3">
          {[...state.players]
            .sort((a, b) => b.total + (state.roundTotals?.[b.id] ?? 0) - (a.total + (state.roundTotals?.[a.id] ?? 0)))
            .map((p) => (
              <span key={p.id} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xl font-bold text-white/80">
                <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                {p.name}
                <span className="font-display font-black tabular-nums text-cream">
                  {p.total + (state.roundTotals?.[p.id] ?? 0)}
                </span>
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
