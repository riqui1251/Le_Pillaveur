"use client"

import { Scale } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { DilClientView } from '@/lib/dilemmes/engine'
import { DIL_VOTE_MS } from '@/lib/dilemmes/engine'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * DILEMMES sur grand écran : la carte en géant, la progression des votes
 * (jamais leur contenu avant la révélation), puis les camps révélés.
 */
export function TvDilemmes({ room, state }: { room: TvRoomDto; state: DilClientView }) {
  const t = useTranslations('games.dilemmes.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null || state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt, state.phase])

  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const card = state.card
  const reveal = state.lastReveal
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const votedCount = state.players.filter((p) => p.hasVoted && !p.leftAt).length
  const activeCount = state.players.filter((p) => !p.leftAt).length

  if (state.phase === 'countdown' || state.phase === 'finished') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        {state.phase === 'finished' ? (
          <>
            <Scale className="h-16 w-16 text-rose-300" />
            <p className="text-5xl font-black text-white">{t('finished.title')}</p>
          </>
        ) : (
          <>
            <p className="text-3xl font-black uppercase tracking-widest text-rose-300/80">{t('countdown.title')}</p>
            <TvBigCountdown seconds={secondsLeft} colorClass="text-rose-200" />
          </>
        )}
      </div>
    )
  }

  const revealVoters = (choice: string) => (reveal ?? []).filter((r) => r.choice === choice)

  const bigChoice = (choice: 'A' | 'B', label: string) => {
    const voters = state.phase === 'reveal' ? revealVoters(choice) : []
    const total = (reveal ?? []).length || 1
    return (
      <div className="relative rounded-2xl border-2 border-[#D8CCAE] bg-cream px-8 py-5 text-center text-2xl font-black text-[#24201A] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.8)]">
        {label}
        {state.phase === 'reveal' && (
          <div className="mt-2 flex items-center justify-center gap-3">
            <span className={cn('font-display text-3xl font-black', choice === 'A' ? 'text-suit-red' : 'text-chip-blue')}>
              {Math.round((voters.length / total) * 100)} %
            </span>
            <span className="flex flex-wrap justify-center gap-1 text-xl">
              {voters.map((r) => (
                <span key={r.voterId} title={nameOf(r.voterId)} aria-hidden>
                  <PlayerAvatarGlyph value={iconOf({ id: r.voterId, isBot: state.players.find((p) => p.id === r.voterId)?.isBot ?? false })} />
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      <div className="flex items-center gap-4">
        <span className="text-xl font-black text-white/80">{t('round', { n: state.round + 1, total: state.totalRounds })}</span>
        <span className="text-lg font-semibold uppercase tracking-widest text-rose-300">
          {state.phase === 'vote' ? t('votePrompt') : t('phaseReveal')}
        </span>
        {timeLeftMs !== null && state.phase === 'vote' && (
          <TvTimeBar timeLeftMs={timeLeftMs} totalMs={DIL_VOTE_MS} dangerMs={8_000} colorClass="bg-gold" dangerClass="bg-suit-red" />
        )}
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4">
        {card?.kind === 'prefer' && (
          <>
            <p className="text-center font-display text-3xl font-bold text-cream">{t('preferPrompt')}</p>
            {bigChoice('A', card.a)}
            <p aria-hidden className="text-center font-display text-lg font-bold uppercase tracking-[0.3em] text-gold">— {t('or')} —</p>
            {bigChoice('B', card.b)}
          </>
        )}
        {card?.kind === 'never' && (
          <>
            <p className="text-center font-display text-3xl font-bold leading-snug text-cream">
              {t('neverPrompt')} {card.text}
            </p>
            {bigChoice('A', t('neverDid'))}
            {bigChoice('B', t('neverNever'))}
          </>
        )}
        {card?.kind === 'who' && (
          <>
            <p className="text-center font-display text-3xl font-bold leading-snug text-cream">
              {t('whoPrompt')} {card.text}
            </p>
            {state.phase === 'reveal' && (
              <div className="flex flex-wrap justify-center gap-3">
                {state.players
                  .map((p) => ({ p, votes: revealVoters(p.id).length }))
                  .filter((x) => x.votes > 0)
                  .sort((a, b) => b.votes - a.votes)
                  .map(({ p, votes }) => (
                    <span key={p.id} className="flex items-center gap-2 rounded-2xl border border-[#D8CCAE] bg-cream px-5 py-2.5 text-2xl font-black text-[#24201A]">
                      <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                      {p.name}
                      <span className="font-display text-suit-red">{votes}</span>
                    </span>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-center text-xl text-white/50">
        {state.phase === 'vote'
          ? t('voted', { count: votedCount, total: activeCount })
          : card?.kind === 'who'
            ? t('whoDrinks')
            : t('minorityDrinks')}
      </p>
    </div>
  )
}
