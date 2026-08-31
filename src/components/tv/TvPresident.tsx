"use client"

import { Crown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botEmojiFromName } from '@/lib/online/bot-personas'
import type { PreClientView } from '@/lib/president/engine'
import { preRankOf, preSuitOf, PRE_RANKS, PRE_SUITS, PRE_TURN_MS } from '@/lib/president/engine'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * PRÉSIDENT sur grand écran : le tapis au centre (dernier combo posé), les
 * joueurs en arc avec leurs comptes de cartes — jamais les mains.
 */
export function TvPresident({ room, state }: { room: TvRoomDto; state: PreClientView }) {
  const t = useTranslations('games.president.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null || state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt, state.phase])

  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const nameOf = (id: string | null) => state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const bigCard = (card: number) => {
    const red = PRE_SUITS[preSuitOf(card)] === '♥' || PRE_SUITS[preSuitOf(card)] === '♦'
    return (
      <div
        key={card}
        className="flex h-32 w-22 flex-col items-center justify-center rounded-xl border-2 border-[#D8CCAE] bg-cream shadow-[0_14px_30px_-14px_rgba(0,0,0,0.8)]"
        style={{ width: '5.5rem' }}
      >
        <span className={cn('font-display text-4xl font-black', red ? 'text-suit-red' : 'text-[#24201A]')}>
          {PRE_RANKS[preRankOf(card)]}
        </span>
        <span className={cn('text-3xl', red ? 'text-suit-red' : 'text-[#24201A]')} aria-hidden>
          {PRE_SUITS[preSuitOf(card)]}
        </span>
      </div>
    )
  }

  if (state.phase === 'countdown' || state.phase === 'finished' || state.phase === 'interlude') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    const ranking = state.lastRanking ?? []
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        {state.phase === 'countdown' ? (
          <>
            <p className="text-3xl font-black uppercase tracking-widest text-emerald-300/80">{t('countdown.title')}</p>
            <TvBigCountdown seconds={secondsLeft} colorClass="text-emerald-200" />
          </>
        ) : (
          <>
            <Crown className="h-16 w-16 text-gold" />
            <p className="text-5xl font-black text-white">
              {state.phase === 'finished' ? t('finished.title') : t('mancheEnd', { n: state.manche + 1 })}
            </p>
            <div className="flex flex-col gap-2">
              {ranking.map((id, i) => {
                const p = state.players.find((x) => x.id === id)
                if (!p) return null
                const isTrou = i === ranking.length - 1
                return (
                  <div
                    key={id}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border-2 px-6 py-2 text-2xl font-black',
                      i === 0
                        ? 'border-gold/60 bg-gold/15 text-gold'
                        : isTrou
                          ? 'border-suit-red/50 bg-suit-red/15 text-white'
                          : 'border-[#D8CCAE] bg-cream text-[#24201A]'
                    )}
                  >
                    <span className="font-display">{i + 1}</span>
                    <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                    {p.name}
                    <span className="text-lg font-bold uppercase opacity-70">
                      {i === 0 ? t('roles.president') : isTrou ? t('roles.trou') : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold text-white/70">
          {t('manche', { n: state.manche + 1, total: state.totalManches })}
        </p>
        <p className="text-2xl font-black text-gold">
          {t('turnOf', { name: nameOf(state.currentTurnId) })}
        </p>
      </div>

      {timeLeftMs !== null && <TvTimeBar timeLeftMs={timeLeftMs} totalMs={PRE_TURN_MS} dangerMs={8_000} />}

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        {state.lastPlay ? (
          <>
            <div className="flex gap-3">{state.lastPlay.cards.map(bigCard)}</div>
            <p className="text-2xl font-bold text-white/60">
              {t('lastPlayBy', { name: nameOf(state.lastPlay.playerId) })}
            </p>
          </>
        ) : (
          <p className="text-3xl font-bold text-white/50">{t('freeTrick')}</p>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {state.players.map((p) => {
          const outIdx = state.outOrder.indexOf(p.id)
          return (
            <span
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-xl font-bold',
                state.currentTurnId === p.id
                  ? 'border-gold/60 bg-gold/15 text-gold'
                  : outIdx !== -1
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/15 bg-white/5 text-white/80'
              )}
            >
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              {p.name}
              {p.role === 'president' && <span aria-hidden>👑</span>}
              {p.role === 'trou' && <span aria-hidden>🕳️</span>}
              <span className="tabular-nums text-white/50">
                {outIdx !== -1 ? `#${outIdx + 1}` : `🂠 ${p.handCount}`}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
