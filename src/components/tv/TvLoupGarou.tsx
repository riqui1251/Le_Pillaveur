"use client"

import { useEffect, useState, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { Beer, Bird, FlaskConical, Hourglass, Medal, Moon, Shield, Skull, Sparkles, Sun, Target, Trophy, Wheat } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import { botEmojiFromName } from '@/lib/online/bot-personas'
import type { LGClientView, LGRole } from '@/lib/loup-garou/engine'
import { WolfIcon } from '@/components/icons/GameIcons'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { cn } from '@/lib/utils'

/**
 * LOUP-GAROU sur grand écran : la table vue du dessus — les joueurs sont des
 * cartes crème disposées en arc, les morts des cartes retournées côté feutre.
 * Rôles révélés des morts UNIQUEMENT (la vue TV est neutre), annonces
 * publiques en Playfair géant (aube, lynchages).
 */

const ROLE_META: Record<LGRole, { Icon: ComponentType<{ className?: string }>; color: string; ink: string }> = {
  loup: { Icon: WolfIcon, color: 'text-red-300', ink: 'text-suit-red' },
  voyante: { Icon: Sparkles, color: 'text-purple-300', ink: 'text-purple-800' },
  sorciere: { Icon: FlaskConical, color: 'text-emerald-300', ink: 'text-emerald-800' },
  chasseur: { Icon: Target, color: 'text-amber-300', ink: 'text-amber-700' },
  salvateur: { Icon: Shield, color: 'text-cyan-300', ink: 'text-cyan-800' },
  corbeau: { Icon: Bird, color: 'text-slate-300', ink: 'text-slate-600' },
  ancien: { Icon: Hourglass, color: 'text-orange-300', ink: 'text-orange-800' },
  villageois: { Icon: Wheat, color: 'text-sky-300', ink: 'text-sky-800' },
}

const PHASE_TOTAL_MS: Record<string, number> = {
  'reveal-role': 10_000,
  'mayor-election': 30_000,
  'night-guard': 25_000,
  'night-seer': 30_000,
  'night-raven': 25_000,
  'night-wolves': 45_000,
  'night-witch': 30_000,
  dawn: 10_000,
  'hunter-shot': 20_000,
  'day-vote': 60_000,
  'day-revote': 45_000,
}

const NIGHT_PHASES = new Set([
  'reveal-role',
  'night-guard',
  'night-seer',
  'night-raven',
  'night-wolves',
  'night-witch',
])

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
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const roleName = (role: LGRole) => t(`roles.${role}.name`)

  // ── Fin de partie : révélation complète ──────────────────────────────────
  if (finished) {
    const villageWon = state.winnerTeam === 'village'
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="flex items-center gap-4 font-display text-5xl font-bold text-gold">
          <Trophy aria-hidden className="h-12 w-12" />
          {villageWon ? t('victory.village') : t('victory.loups')}
        </p>
        <p className="text-2xl text-white/60">
          {villageWon ? t('victory.villageDrinks') : t('victory.loupsDrinks')}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {state.players.map((p) => {
            const RoleIcon = p.role ? ROLE_META[p.role].Icon : null
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-5 py-3 text-2xl font-bold shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]',
                  p.role === 'loup'
                    ? 'border-suit-red bg-cream text-suit-red'
                    : 'border-[#D8CCAE] bg-cream text-[#24201A]',
                  !p.alive && 'opacity-60'
                )}
              >
                <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                {p.name}
                {!p.alive && <Skull aria-hidden className="h-6 w-6 text-[#6B6455]" />}
                {state.mayorId === p.id && (
                  <Medal className="h-6 w-6 text-amber-700" aria-label={t('mayorBadge')} />
                )}
                {p.role && RoleIcon && (
                  <span className={cn('flex items-center gap-1.5 text-xl', ROLE_META[p.role].ink)}>
                    <RoleIcon aria-hidden className="h-6 w-6" /> {roleName(p.role)}
                  </span>
                )}
                <span className="flex items-center gap-1 text-lg text-amber-700">
                  <Beer aria-hidden className="h-5 w-5" />
                  {p.sips}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col gap-4 p-6',
        isNight && 'bg-gradient-to-b from-chip-blue/30 to-transparent'
      )}
    >
      {/* Nuit/Jour + phase + filet d'or */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-3 text-2xl font-black text-cream/90">
          {isNight ? (
            <Moon className="h-8 w-8 text-sky-300" />
          ) : (
            <Sun className="h-8 w-8 text-gold" />
          )}
          {t('round', { n: Math.max(1, state.round) })}
        </span>
        <span className="font-display text-xl font-semibold uppercase tracking-widest text-gold">
          {t(`phases.${state.phase}`)}
        </span>
        {timeLeftMs !== null && (
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300 ease-linear',
                timeLeftMs < 10_000 ? 'bg-suit-red' : 'bg-gold'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Annonce centrale — Playfair géant */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {isNight && (
          <>
            <Moon className="h-16 w-16 animate-pulse text-sky-300" />
            <p className="font-display text-4xl font-bold text-cream">{t('sleep')}</p>
            <p className="text-xl text-white/40">{t(`phases.${state.phase}`)}</p>
          </>
        )}
        {state.phase === 'dawn' && (
          <>
            <Sun className="h-16 w-16 text-gold" />
            {state.lastNightDeaths.length === 0 ? (
              <p className="font-display text-4xl font-bold text-emerald-200">{t('dawnNobody')}</p>
            ) : (
              state.lastNightDeaths.map((d) => (
                <p key={d.playerId} className="font-display text-3xl font-bold text-red-200">
                  {t('dawnDeath', { name: nameOf(d.playerId), role: roleName(d.role) })}
                </p>
              ))
            )}
            {state.ravenTargetId && (
              <p className="text-2xl font-bold text-slate-200">
                {t('ravenMarkBanner', { name: nameOf(state.ravenTargetId) })}
              </p>
            )}
          </>
        )}
        {state.phase === 'hunter-shot' && (
          <p className="font-display text-4xl font-bold text-gold">
            {t('hunterWaiting', { name: nameOf(state.pendingHunterId) })}
          </p>
        )}
        {state.phase === 'day-debate' && (
          <>
            <p className="font-display text-4xl font-bold text-cream">{t('debatePrompt')}</p>
            <p className="text-xl text-white/50">
              {t('skipToVote', { n: state.debateSkips.length, total: alive.length })}
            </p>
          </>
        )}
        {(state.phase === 'day-vote' || state.phase === 'day-revote') && (
          <p className="font-display text-4xl font-bold text-cream">
            {state.phase === 'day-revote' ? t('revotePrompt') : t('votePrompt')}
          </p>
        )}
        {state.phase === 'mayor-election' && (
          <>
            <p className="font-display text-4xl font-bold text-gold">{t('mayorPrompt')}</p>
            <p className="text-xl text-white/50">
              {t('skipWaiting', {
                n: alive.filter((p) => state.hasVotedMayor[p.id]).length,
                total: alive.length,
              })}
            </p>
          </>
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
        {/* Bannière du maire (persiste une fois élu) */}
        {state.mayorId && state.phase !== 'mayor-election' && (
          <p className="text-lg font-semibold text-amber-200/80">
            {t('mayorBanner', { name: nameOf(state.mayorId) })}
          </p>
        )}
      </div>

      {/* La table : cartes crème sur deux rangées propres (une seule si ≤ 5),
          morts retournés côté feutre. */}
      <div className="space-y-3">
        <p className="text-center text-lg font-semibold uppercase tracking-widest text-gold/60">
          {t('village', { alive: alive.length, total: state.players.length })}
        </p>
        {(() => {
          const n = state.players.length
          const rows =
            n <= 5
              ? [state.players]
              : [state.players.slice(0, Math.ceil(n / 2)), state.players.slice(Math.ceil(n / 2))]
          return (
            <div className="flex flex-col items-center gap-3 pb-2">
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} className="flex flex-wrap justify-center gap-3">
                  {row.map((p) => {
                    const voted =
                      (state.phase === 'day-vote' || state.phase === 'day-revote') &&
                      p.alive &&
                      state.hasVoted[p.id]
                    const RoleIcon = p.role ? ROLE_META[p.role].Icon : null
                    return p.alive ? (
                      <span
                        key={p.id}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xl font-bold text-[#24201A]',
                          'border-[#D8CCAE] bg-cream shadow-[0_10px_24px_-12px_rgba(0,0,0,0.7)]',
                          voted && 'ring-4 ring-emerald-400/70'
                        )}
                      >
                        <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                        {p.name}
                        {state.mayorId === p.id && (
                          <Medal className="h-5 w-5 text-amber-700" aria-label={t('mayorBadge')} />
                        )}
                        {p.role && RoleIcon && (
                          <RoleIcon
                            aria-label={roleName(p.role)}
                            className={cn('h-5 w-5', ROLE_META[p.role].ink)}
                          />
                        )}
                        {voted && <span className="text-emerald-700">✓</span>}
                        {p.sips > 0 && (
                          <span className="flex items-center gap-1 text-base font-semibold text-amber-700">
                            <Beer aria-hidden className="h-4 w-4" />
                            {p.sips}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span
                        key={p.id}
                        className="flex items-center gap-2 rounded-xl border border-gold/30 bg-felt-deep px-4 py-2.5 text-xl font-bold text-cream/60 opacity-80"
                      >
                        <Skull aria-hidden className="h-5 w-5 text-cream/50" />
                        {p.name}
                        {state.mayorId === p.id && (
                          <Medal className="h-5 w-5 text-gold/70" aria-label={t('mayorBadge')} />
                        )}
                        {p.role && RoleIcon && (
                          <RoleIcon
                            aria-label={roleName(p.role)}
                            className={cn('h-5 w-5', ROLE_META[p.role].color)}
                          />
                        )}
                        {p.sips > 0 && (
                          <span className="flex items-center gap-1 text-base font-semibold text-amber-200/80">
                            <Beer aria-hidden className="h-4 w-4" />
                            {p.sips}
                          </span>
                        )}
                      </span>
                    )
                  })}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
