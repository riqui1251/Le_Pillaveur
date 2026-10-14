"use client"

import { Beer, Sparkles, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { EngineState } from '@/lib/petit-buveur/engine'
import type { TCClientView } from '@/lib/toucher-coule/engine'
import { EndConfetti } from '@/components/online/EndConfetti'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { TvAvatar } from './tv-shared'

type Standing = { name: string; sub: string; index: number; drinks?: number }

/** Écran TV de fin de partie : vainqueur en grand + classement + confettis. */
export function TvVictory({
  room,
  gameId,
  state,
}: {
  room: TvRoomDto
  gameId: string
  state: (EngineState & { ambiance?: 'alcool' | 'soft' }) | TCClientView
}) {
  const t = useTranslations('tv')
  const tPb = useTranslations('games.petit-buveur')
  const { mode: deviceAmbiance } = useAmbianceMode()
  void room

  let winnerLabel = '—'
  let standings: Standing[] = []
  let soft = false

  if (gameId === 'petit-buveur') {
    const s = state as EngineState & { ambiance?: 'alcool' | 'soft' }
    // La partie locale diffusée transmet SON ambiance ; à défaut, celle de l'écran.
    soft = (s.ambiance ?? deviceAmbiance) === 'soft'
    winnerLabel = s.players.find((p) => p.id === s.winner)?.name ?? '—'
    standings = s.players
      .map((p, index) => ({ p, index }))
      .sort((a, b) => b.p.position - a.p.position)
      .map(({ p, index }) => ({
        name: p.name,
        sub: `${t('position')} ${p.position + 1}`,
        index,
        drinks: p.drinks,
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

  const DrinkIcon = soft ? Sparkles : Beer

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-8 py-10">
      <EndConfetti pieces={220} />
      <div className="flex flex-col items-center text-center">
        <Trophy aria-hidden className="h-12 w-12 text-gold" />
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.3em] text-gold/70">
          {gameId === 'toucher-coule' ? t('winnerTeam') : t('winner')}
        </p>
        <p className="mt-2 font-display text-6xl font-bold text-gold sm:text-7xl">{winnerLabel}</p>
      </div>
      <div className="w-full max-w-lg">
        <p className="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-white/75">{t('standings')}</p>
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
              {s.drinks !== undefined && (
                <span className="inline-flex items-center gap-1 text-sm text-white/50">
                  <span aria-hidden>· {s.drinks}</span>
                  <DrinkIcon aria-hidden className="h-4 w-4" />
                  <span className="sr-only">
                    {tPb(soft ? 'soft.game.drinksShort' : 'game.drinksShort', { count: s.drinks })}
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
