"use client"

import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { TCClientView, TeamId } from '@/lib/toucher-coule/engine'
import { cn } from '@/lib/utils'

/** Grille d'une équipe vue par un spectateur neutre : tirs reçus + navires coulés seulement. */
function TeamGrid({ team, view, label }: { team: TeamId; view: TCClientView; label: string }) {
  const n = view.gridSize
  const shots = view.shotsAt?.[team] ?? {}
  const sunkCells = new Set<number>()
  for (const ship of view.ships) {
    if (ship.team === team && ship.sunk) ship.cells.forEach((c) => sunkCells.add(c))
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-lg font-bold text-white/70">{label}</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n * n }).map((_, i) => {
          const shot = shots[i]
          const sunk = sunkCells.has(i)
          return (
            <div
              key={i}
              className={cn(
                'flex aspect-square w-8 items-center justify-center rounded-md border text-base sm:w-10',
                sunk
                  ? 'border-red-500/50 bg-red-600/40'
                  : shot === 'hit'
                    ? 'border-orange-500/40 bg-orange-500/25'
                    : shot === 'miss'
                      ? 'border-white/10 bg-white/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.02]',
              )}
            >
              {sunk ? (
                <span aria-hidden>💥</span>
              ) : shot === 'hit' ? (
                <span aria-hidden>🔥</span>
              ) : shot === 'miss' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Rendu TV du Toucher-Coulé en bataille : les 2 grilles en vue spectateur neutre + tour courant. */
export function TvToucherCoule({ room, state }: { room: TvRoomDto; state: TCClientView }) {
  const t = useTranslations('tv')
  const active = state.players.find((p) => p.id === room.currentTurnUserId) ?? null
  const shipsLeft = (team: TeamId) => state.ships.filter((s) => s.team === team && !s.sunk).length

  if (state.phase === 'placement') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-3xl font-bold text-white/60">{t('waiting')}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5 sm:px-10">
      {active && (
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-300/60">{t('turnOf')}</p>
          <p className="text-4xl font-black">
            {active.name}{' '}
            <span className="text-2xl text-white/40">· {active.team === 'A' ? t('teamA') : t('teamB')}</span>
          </p>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-10">
        <TeamGrid team="A" view={state} label={`${t('teamA')} · ${shipsLeft('A')} ${t('shipsLeft')}`} />
        <TeamGrid team="B" view={state} label={`${t('teamB')} · ${shipsLeft('B')} ${t('shipsLeft')}`} />
      </div>
    </div>
  )
}
