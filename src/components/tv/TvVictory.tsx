"use client"

import { Beer, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { TCClientView, TeamId } from '@/lib/toucher-coule/engine'
import { EndConfetti } from '@/components/online/EndConfetti'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { cn } from '@/lib/utils'
import { TvAvatar } from './tv-shared'

type Standing = {
  id: string
  name: string
  index: number
  team: TeamId
  drinks?: number
  highlight: boolean
}

/** Jusqu'à 4 joueurs (1v1, 2v2) une colonne large ; au-delà (3v3, 4v4) deux colonnes. */
type Density = 'roomy' | 'medium'

const AVATAR_PX: Record<Density, number> = { roomy: 56, medium: 44 }
const NAME_CLASS: Record<Density, string> = { roomy: 'text-3xl', medium: 'text-2xl' }

const TEAM_CLASS: Record<TeamId, string> = {
  A: 'bg-sky-500/20 text-sky-200',
  B: 'bg-rose-500/20 text-rose-200',
}

/**
 * Écran TV de fin de partie du Toucher-Coulé : l'équipe gagnante en grand puis
 * le tableau final, avec ce que la modale de fin montre à tous les téléphones
 * (équipe et gorgées) — rien de personnel (XP, précision « à moi »).
 */
export function TvVictory({
  state,
}: {
  room: TvRoomDto
  gameId: string
  state: TCClientView
}) {
  const t = useTranslations('tv')
  const tTc = useTranslations('games.toucher-coule.game')
  const { mode: ambiance } = useAmbianceMode()
  const soft = ambiance === 'soft'

  const winnerTeam: TeamId | null = state.winner === 'A' || state.winner === 'B' ? state.winner : null
  const winnerLabel = winnerTeam === 'A' ? t('teamA') : winnerTeam === 'B' ? t('teamB') : '—'
  const winnerSub = winnerTeam && !soft ? tTc('defeatDrinks', { team: winnerTeam === 'A' ? 'B' : 'A' }) : null
  const turnCount = typeof state.turnCount === 'number' ? state.turnCount : null
  const standings: Standing[] = state.players
    .map((p, index) => ({ p, index }))
    .sort((a, b) =>
      soft
        ? (a.p.team === winnerTeam ? 0 : 1) - (b.p.team === winnerTeam ? 0 : 1) || a.p.name.localeCompare(b.p.name)
        : b.p.drinks - a.p.drinks
    )
    .map(({ p, index }) => ({
      id: p.id,
      name: p.name,
      index,
      team: p.team,
      drinks: soft ? undefined : p.drinks,
      highlight: p.team === winnerTeam,
    }))

  const density: Density = standings.length <= 4 ? 'roomy' : 'medium'
  const columns = density === 'roomy' ? 1 : 2
  const rows = Math.ceil(standings.length / columns)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-6 px-10 py-5">
      <EndConfetti pieces={160} />

      <div className="relative flex items-center gap-8">
        <div
          className={cn(
            'flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl shadow-xl',
            winnerTeam === 'A'
              ? 'bg-gradient-to-br from-sky-400 to-cyan-500'
              : winnerTeam === 'B'
                ? 'bg-gradient-to-br from-rose-400 to-red-500'
                : 'bg-gradient-to-br from-amber-400 to-orange-500'
          )}
        >
          <Trophy aria-hidden className="h-16 w-16 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold uppercase tracking-[0.3em] text-gold/90">{t('winnerTeam')}</p>
          <p className="truncate font-display text-7xl font-bold leading-[1.1] text-gold">{winnerLabel}</p>
          {winnerSub && <p className="mt-1 truncate text-2xl text-white/80">{winnerSub}</p>}
        </div>
        <div className="flex shrink-0 gap-4">
          {turnCount !== null && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-center">
              <p className="text-4xl font-black tabular-nums text-amber-300">{turnCount}</p>
              <p className="text-lg text-white/80">{tTc('statTurns')}</p>
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-center">
            <p className="text-4xl font-black tabular-nums text-amber-300">{standings.length}</p>
            <p className="text-lg text-white/80">{t('players')}</p>
          </div>
        </div>
      </div>

      <div className={cn('relative flex flex-col', density === 'roomy' && 'mx-auto w-[56rem]')}>
        <p className="mb-3 text-lg font-bold uppercase tracking-[0.25em] text-white/80">{tTc('finalBoard')}</p>
        {/* Le téléphone trie par gorgées sans numéroter : ce n'est pas un podium. */}
        <ol
          className={cn('grid', density === 'roomy' ? 'gap-3' : 'gap-x-4 gap-y-2')}
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, auto)`,
            gridAutoFlow: 'column',
          }}
        >
          {standings.map((s) => (
            <li
              key={s.id}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border',
                density === 'roomy' ? 'px-5 py-3' : 'px-4 py-2',
                s.highlight ? 'border-amber-400/40 bg-amber-500/[0.15]' : 'border-white/10 bg-white/5'
              )}
            >
              <TvAvatar name={s.name} index={s.index} size={AVATAR_PX[density]} />
              <span className={cn('min-w-0 flex-1 truncate font-bold text-white', NAME_CLASS[density])}>{s.name}</span>
              <span className={cn('shrink-0 rounded-full px-3 py-0.5 text-lg font-bold', TEAM_CLASS[s.team])}>
                {s.team === 'A' ? t('teamA') : t('teamB')}
              </span>
              {s.drinks !== undefined && (
                <span className="inline-flex shrink-0 items-center gap-1 text-lg font-bold tabular-nums text-amber-300">
                  <span className="sr-only">{tTc('statDrinks')}</span>
                  <span>{s.drinks}</span>
                  <Beer aria-hidden className="h-6 w-6" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
