"use client"

import { useEffect, useState } from 'react'
import Confetti from 'react-confetti'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { EngineState } from '@/lib/petit-buveur/engine'
import type { TCClientView } from '@/lib/toucher-coule/engine'
import { TvAvatar } from './tv-shared'

function useWindowSize() {
  const [size, setSize] = useState({ width: 1280, height: 720 })
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

type Standing = { name: string; sub: string; index: number }

/** Écran TV de fin de partie : vainqueur en grand + classement + confettis. */
export function TvVictory({
  room,
  gameId,
  state,
}: {
  room: TvRoomDto
  gameId: string
  state: EngineState | TCClientView
}) {
  const t = useTranslations('tv')
  const { width, height } = useWindowSize()
  void room

  let winnerLabel = '—'
  let standings: Standing[] = []

  if (gameId === 'petit-buveur') {
    const s = state as EngineState
    winnerLabel = s.players.find((p) => p.id === s.winner)?.name ?? '—'
    standings = s.players
      .map((p, index) => ({ p, index }))
      .sort((a, b) => b.p.position - a.p.position)
      .map(({ p, index }) => ({
        name: p.name,
        sub: `${t('position')} ${p.position + 1} · ${p.drinks} 🍺`,
        index,
      }))
  } else {
    const s = state as TCClientView
    winnerLabel = s.winner === 'A' ? t('teamA') : s.winner === 'B' ? t('teamB') : '—'
    standings = s.players.map((p, index) => ({
      name: p.name,
      sub: `${p.team === 'A' ? t('teamA') : t('teamB')} · ${p.shotsHit} 🎯`,
      index,
    }))
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-8 py-10">
      <Confetti width={width} height={height} numberOfPieces={220} recycle={false} gravity={0.25} />
      <div className="text-center">
        <p className="text-4xl" aria-hidden>🏆</p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.3em] text-amber-300/70">
          {gameId === 'toucher-coule' ? t('winnerTeam') : t('winner')}
        </p>
        <p className="mt-2 text-6xl font-black text-amber-200 sm:text-7xl">{winnerLabel}</p>
      </div>
      <div className="w-full max-w-lg">
        <p className="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-white/40">{t('standings')}</p>
        <div className="space-y-2">
          {standings.map((s, rank) => (
            <div
              key={`${s.name}-${rank}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5"
            >
              <span className="w-6 text-center text-lg font-black text-white/40">{rank + 1}</span>
              <TvAvatar name={s.name} index={s.index} size={38} />
              <span className="flex-1 truncate text-xl font-bold">{s.name}</span>
              <span className="text-sm text-white/50">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
