"use client"

import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { EngineState } from '@/lib/petit-buveur/engine'
import { cn } from '@/lib/utils'
import { TvAvatar } from './tv-shared'

const BOARD_SIZE = 30
const COLS = 10

/** Rendu TV du Petit Buveur en partie : plateau 30 cases + pions + tour courant + scores. */
export function TvPetitBuveur({ room, state }: { room: TvRoomDto; state: EngineState }) {
  const t = useTranslations('tv')
  const players = state.players
  const activeId = room.currentTurnUserId ?? players[state.currentPlayer]?.id ?? null
  const active = players.find((p) => p.id === activeId) ?? players[state.currentPlayer] ?? null
  const activeIndex = active ? players.findIndex((p) => p.id === active.id) : -1

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5 sm:px-10">
      {active && (
        <div className="flex items-center justify-center gap-4">
          <TvAvatar name={active.name} index={activeIndex} size={64} active />
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-300/60">{t('turnOf')}</p>
            <p className="text-4xl font-black sm:text-5xl">{active.name}</p>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="grid w-full max-w-5xl gap-2"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, i) => {
            const here = players
              .map((p, idx) => ({ p, idx }))
              .filter(({ p }) => p.position === i)
            const isFinish = i === BOARD_SIZE - 1
            const isStart = i === 0
            return (
              <div
                key={i}
                className={cn(
                  'relative flex aspect-square items-center justify-center rounded-xl border',
                  isFinish
                    ? 'border-amber-400/40 bg-amber-500/10'
                    : isStart
                      ? 'border-emerald-400/30 bg-emerald-500/10'
                      : 'border-white/10 bg-white/[0.03]',
                )}
              >
                <span className="absolute left-1 top-1 text-[10px] font-semibold text-white/30">{i + 1}</span>
                {isFinish && <span className="absolute text-2xl opacity-25" aria-hidden>🏆</span>}
                <div className="flex flex-wrap items-center justify-center gap-0.5">
                  {here.map(({ p, idx }) => (
                    <TvAvatar key={p.id} name={p.name} index={idx} size={22} active={p.id === activeId} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {players.map((p, idx) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5',
              p.id === activeId ? 'border-violet-400/60 bg-violet-500/15' : 'border-white/10 bg-white/[0.03]',
            )}
          >
            <TvAvatar name={p.name} index={idx} size={28} />
            <span className="text-base font-bold">{p.name}</span>
            <span className="text-sm text-white/45">{t('position')} {p.position + 1}</span>
            <span className="text-sm font-bold text-red-300">{p.drinks} 🍺</span>
          </div>
        ))}
      </div>
    </div>
  )
}
