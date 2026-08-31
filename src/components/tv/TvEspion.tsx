"use client"

import { Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botEmojiFromName } from '@/lib/online/bot-personas'
import type { EspionClientView } from '@/lib/espion/engine'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * QUI EST L'ESPION ? sur grand écran : timer principal, liste des joueurs
 * (JAMAIS le lieu ni les rôles avant la révélation), bannière d'accusation
 * en direct avec les soutiens qui s'accumulent — la vue TV est neutre.
 */
export function TvEspion({ room, state }: { room: TvRoomDto; state: EspionClientView }) {
  const t = useTranslations('games.espion.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phase])

  const finished = state.phase === 'finished'
  const reveal = state.lastReveal
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // ── Fin de partie ─────────────────────────────────────────────────────────
  if (finished) {
    const crewWon = state.winnerTeam === 'crew'
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">
          <Trophy aria-hidden className="inline h-[0.85em] w-[0.85em] text-gold" /> {crewWon ? t('victory.crewWin') : t('victory.spyWin')}
        </p>
        <p className="text-2xl text-white/60">
          {t('victory.score', { spy: state.roundWins.spy, crew: state.roundWins.crew })}
        </p>
      </div>
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (state.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-cyan-300/80">{t('countdown.title')}</p>
        <TvBigCountdown seconds={secondsLeft} colorClass="text-cyan-200" />
        <p className="text-xl text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Révélation de manche ─────────────────────────────────────────────────
  if (state.phase === 'reveal' && reveal) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-5xl font-black text-white">{nameOf(reveal.spyId)}</p>
        <p className="text-2xl text-white/60">{t('reveal.location', { location: reveal.location })}</p>
        <p className="text-xl font-bold text-cyan-200">
          {t('victory.score', { spy: state.roundWins.spy, crew: state.roundWins.crew })}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      <div className="flex items-center gap-4">
        <span className="text-xl font-black text-white/80">
          {t('score', { spy: state.roundWins.spy, crew: state.roundWins.crew })}
        </span>
        <span className="text-lg font-semibold uppercase tracking-widest text-cyan-300">
          {t('phaseDiscussion')}
        </span>
        {timeLeftMs !== null && (
          <TvTimeBar timeLeftMs={timeLeftMs} totalMs={state.discussionMs} dangerMs={30_000} colorClass="bg-cyan-400" dangerClass="bg-red-400" />
        )}
      </div>

      {state.activeAccusation ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-4xl font-black text-white">
            {t('accusation.title', {
              accuser: nameOf(state.activeAccusation.accuserId),
              target: nameOf(state.activeAccusation.targetId),
            })}
          </p>
          <p className="text-2xl text-white/60">
            {t('accusation.support', {
              count: state.activeAccusation.supporters.length,
              needed: Math.floor(state.players.filter((p) => !p.leftAt).length / 2) + 1,
            })}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-3xl text-white/40">{t('tvDiscussionHint')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-1.5 text-lg font-bold',
              'border-white/10 bg-white/5 text-white/70',
              p.leftAt && 'opacity-40'
            )}
          >
            <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}
