"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Moon, Sun } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import type { LGClientView, LGRole } from '@/lib/loup-garou/engine'
import { cn } from '@/lib/utils'

/**
 * LOUP-GAROU sur grand écran : la place du village (vivants/morts, rôles
 * révélés des morts UNIQUEMENT — la vue TV est neutre), la phase en cours
 * avec son compte à rebours, les annonces publiques (aube, lynchages).
 */

const ROLE_META: Record<LGRole, { icon: string; color: string }> = {
  loup: { icon: '🐺', color: 'text-red-300' },
  voyante: { icon: '🔮', color: 'text-violet-300' },
  sorciere: { icon: '🧪', color: 'text-emerald-300' },
  chasseur: { icon: '🏹', color: 'text-amber-300' },
  villageois: { icon: '🧑‍🌾', color: 'text-sky-300' },
}

const PHASE_TOTAL_MS: Record<string, number> = {
  'reveal-role': 10_000,
  'night-seer': 30_000,
  'night-wolves': 45_000,
  'night-witch': 30_000,
  dawn: 10_000,
  'hunter-shot': 20_000,
  'day-vote': 60_000,
  'day-revote': 45_000,
}

const NIGHT_PHASES = new Set(['reveal-role', 'night-seer', 'night-wolves', 'night-witch'])

export function TvLoupGarou({ room, state }: { room: TvRoomDto; state: LGClientView }) {
  const t = useTranslations('games.loup-garou.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null || state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt, state.phase])

  const finished = state.phase === 'finished'
  const isNight = NIGHT_PHASES.has(state.phase)
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const totalPhaseMs =
    state.phase === 'day-debate' ? state.debateMs : PHASE_TOTAL_MS[state.phase] ?? 60_000
  const alive = state.players.filter((p) => p.alive)
  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const roleName = (role: LGRole) => t(`roles.${role}.name`)

  // ── Fin de partie : révélation complète ──────────────────────────────────
  if (finished) {
    const villageWon = state.winnerTeam === 'village'
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">
          🏆 {villageWon ? t('victory.village') : t('victory.loups')}
        </p>
        <p className="text-2xl text-white/60">
          {villageWon ? t('victory.villageDrinks') : t('victory.loupsDrinks')}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {state.players.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-5 py-3 text-2xl font-bold',
                p.role === 'loup'
                  ? 'border-red-400/50 bg-red-500/15 text-red-100'
                  : 'border-white/10 bg-white/5 text-white/80',
                !p.alive && 'opacity-50'
              )}
            >
              <span aria-hidden>{iconOf(p)}</span>
              {p.name}
              {!p.alive && ' 💀'}
              {p.role && (
                <span className={cn('text-xl', ROLE_META[p.role].color)}>
                  {ROLE_META[p.role].icon} {roleName(p.role)}
                </span>
              )}
              <span className="text-lg text-amber-200/80">🍺{p.sips}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col gap-4 p-6',
        isNight && 'bg-gradient-to-b from-indigo-950/50 to-transparent'
      )}
    >
      {/* Nuit/Jour + phase + timer */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-3 text-2xl font-black text-white/85">
          {isNight ? (
            <Moon className="h-8 w-8 text-indigo-300" />
          ) : (
            <Sun className="h-8 w-8 text-amber-300" />
          )}
          {t('round', { n: Math.max(1, state.round) })}
        </span>
        <span className="text-xl font-semibold uppercase tracking-widest text-indigo-300">
          {t(`phases.${state.phase}`)}
        </span>
        {timeLeftMs !== null && (
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300 ease-linear',
                timeLeftMs < 10_000 ? 'bg-red-400' : 'bg-indigo-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Annonce centrale */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {isNight && (
          <>
            <Moon className="h-16 w-16 animate-pulse text-indigo-300" />
            <p className="text-4xl font-black text-indigo-100">{t('sleep')}</p>
            <p className="text-xl text-white/40">{t(`phases.${state.phase}`)}</p>
          </>
        )}
        {state.phase === 'dawn' && (
          <>
            <Sun className="h-16 w-16 text-amber-300" />
            {state.lastNightDeaths.length === 0 ? (
              <p className="text-4xl font-black text-emerald-200">{t('dawnNobody')}</p>
            ) : (
              state.lastNightDeaths.map((d) => (
                <p key={d.playerId} className="text-3xl font-black text-red-200">
                  {t('dawnDeath', { name: nameOf(d.playerId), role: roleName(d.role) })}
                </p>
              ))
            )}
          </>
        )}
        {state.phase === 'hunter-shot' && (
          <p className="text-4xl font-black text-amber-200">
            {t('hunterWaiting', { name: nameOf(state.pendingHunterId) })}
          </p>
        )}
        {state.phase === 'day-debate' && (
          <>
            <p className="text-4xl font-black text-white">{t('debatePrompt')}</p>
            <p className="text-xl text-white/50">
              {t('skipToVote', { n: state.debateSkips.length, total: alive.length })}
            </p>
          </>
        )}
        {(state.phase === 'day-vote' || state.phase === 'day-revote') && (
          <p className="text-4xl font-black text-white">
            {state.phase === 'day-revote' ? t('revotePrompt') : t('votePrompt')}
          </p>
        )}
        {/* Bannière du dernier lynchage (persiste pendant la nuit) */}
        {state.lastVoteResult && state.phase !== 'day-vote' && state.phase !== 'day-revote' && (
          <p className="text-xl font-semibold text-white/60">
            {state.lastVoteResult.eliminatedId
              ? t('voteBanner', {
                  name: nameOf(state.lastVoteResult.eliminatedId),
                  role: state.lastVoteResult.role ? roleName(state.lastVoteResult.role) : '—',
                })
              : t('voteTieBanner')}
          </p>
        )}
      </div>

      {/* La place du village */}
      <div className="space-y-2">
        <p className="text-center text-lg font-semibold uppercase tracking-widest text-white/40">
          {t('village', { alive: alive.length, total: state.players.length })}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {state.players.map((p) => {
            const voted =
              (state.phase === 'day-vote' || state.phase === 'day-revote') &&
              p.alive &&
              state.hasVoted[p.id]
            return (
              <span
                key={p.id}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-4 py-2 text-xl font-bold',
                  voted
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/10 bg-white/5 text-white/75',
                  !p.alive && 'opacity-45'
                )}
              >
                <span aria-hidden>{p.alive ? iconOf(p) : '💀'}</span>
                {p.name}
                {p.role && (
                  <span className="text-lg" title={roleName(p.role)}>
                    {ROLE_META[p.role].icon}
                  </span>
                )}
                {voted && ' ✓'}
                {p.sips > 0 && <span className="text-base text-amber-200/80">🍺{p.sips}</span>}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
