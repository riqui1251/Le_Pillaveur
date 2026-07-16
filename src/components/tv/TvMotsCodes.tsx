"use client"

import { KeyRound, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { MCClientView, MCTeam } from '@/lib/mots-codes/engine'
import { MC_CLUE_MS, MC_GUESS_MS } from '@/lib/mots-codes/engine'
import { cn } from '@/lib/utils'
import { PlayingCardBack } from '@/components/ui/PlayingCard'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * MOTS CODÉS sur grand écran : la grille en géant (révélé uniquement — la TV
 * ne voit JAMAIS la solution), l'indice courant et les mots restants.
 */
export function TvMotsCodes({ room, state }: { room: TvRoomDto; state: MCClientView }) {
  void room
  const t = useTranslations('games.mots-codes.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null || state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt, state.phase])

  const finished = state.phase === 'finished'
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const totalPhaseMs = state.phase === 'clue' ? MC_CLUE_MS : MC_GUESS_MS
  const teamName = (team: MCTeam) => (team === 'gold' ? t('teamGold') : t('teamRed'))

  const tileClass = (tile: { revealed: boolean; kind: string | null }) => {
    if (!tile.revealed) return 'border-[#D8CCAE] bg-cream text-[#24201A]'
    if (tile.kind === 'gold') return 'border-amber-500 bg-gradient-to-b from-amber-400 to-amber-600 text-[#1c1509]'
    if (tile.kind === 'red') return 'border-red-800 bg-suit-red text-cream'
    return 'border-white/20 bg-white/15 text-white/50'
  }

  if (state.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-amber-300/80">{t('countdown.title')}</p>
        <TvBigCountdown seconds={secondsLeft} colorClass="text-amber-200" />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      {/* Bandeau : scores + phase */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-2xl font-black text-amber-300">◆ {t('teamGold')} · {state.remaining.gold}</span>
        {finished ? (
          <span className="flex items-center gap-2 text-3xl font-black text-white">
            <Trophy className="h-8 w-8 text-gold" />
            {state.winnerTeam ? t('victory.teamWins', { team: teamName(state.winnerTeam) }) : t('victory.tie')}
          </span>
        ) : (
          <span className={cn('text-xl font-semibold uppercase tracking-widest', state.activeTeam === 'gold' ? 'text-amber-300' : 'text-red-300')}>
            {state.phase === 'clue'
              ? t('phaseClue', { team: teamName(state.activeTeam) })
              : t('phaseGuess', { team: teamName(state.activeTeam) })}
          </span>
        )}
        <span className="text-2xl font-black text-red-300">{state.remaining.red} · {t('teamRed')} ◆</span>
      </div>

      {!finished && timeLeftMs !== null && (
        <TvTimeBar timeLeftMs={timeLeftMs} totalMs={totalPhaseMs} dangerMs={15_000} colorClass="bg-gold" dangerClass="bg-suit-red" />
      )}

      {/* Indice */}
      {state.phase === 'guess' && state.clue && (
        <div className="mx-auto flex items-baseline gap-4 rounded-2xl border border-gold/50 bg-black/30 px-8 py-3">
          <KeyRound className="h-6 w-6 self-center text-gold" aria-hidden />
          <span className="font-display text-4xl font-bold uppercase tracking-[0.08em] text-cream">{state.clue.word}</span>
          <span className="font-display text-4xl font-black text-gold">· {state.clue.count}</span>
        </div>
      )}
      {finished && state.loseReason === 'assassin' && (
        <p className="text-center text-2xl font-bold text-red-300">{t('victory.assassin')}</p>
      )}

      {/* Grille */}
      <div className="mx-auto grid w-full max-w-4xl flex-1 grid-cols-5 content-center gap-2">
        {state.tiles.map((tile, i) =>
          tile.revealed && tile.kind === 'assassin' ? (
            <div key={i} className="relative aspect-[7/3]">
              <PlayingCardBack className="h-full w-full rounded-xl" />
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                'flex aspect-[7/3] items-center justify-center rounded-xl border-2 px-1 text-center text-xl font-black uppercase leading-tight shadow-[0_8px_18px_-10px_rgba(0,0,0,0.7)]',
                tileClass(finished ? { ...tile, revealed: true } : tile)
              )}
            >
              {tile.word}
            </div>
          )
        )}
      </div>
    </div>
  )
}
