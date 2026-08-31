"use client"

import { Crown, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botEmojiFromName } from '@/lib/online/bot-personas'
import type { SFClientView } from '@/lib/sans-filtre/engine'
import { SF_JUDGE_MS, SF_SUBMIT_MS } from '@/lib/sans-filtre/engine'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * SANS FILTRE sur grand écran : la carte noire en géant, la progression des
 * abattages (jamais le contenu des mains), puis les réponses anonymes pendant
 * la lecture du juge et la carte couronnée avec son auteur.
 */
export function TvSansFiltre({ room, state }: { room: TvRoomDto; state: SFClientView }) {
  const t = useTranslations('games.sans-filtre.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null || state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt, state.phase])

  const finished = state.phase === 'finished'
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const totalPhaseMs = state.phase === 'judging' ? SF_JUDGE_MS : SF_SUBMIT_MS
  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const judge = state.players.find((p) => p.isJudge)
  const inRound = state.players.filter((p) => !p.isJudge && !p.leftAt)
  const playedCount = inRound.filter((p) => p.hasPlayed).length

  // ── Fin de partie : podium ────────────────────────────────────────────────
  if (finished) {
    const sorted = [...state.players].sort((a, b) => b.crowns - a.crowns)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">
          <Trophy aria-hidden className="inline h-[0.85em] w-[0.85em] text-gold" />{' '}
          {state.winnerId ? t('victory.winnerIs', { name: nameOf(state.winnerId) }) : t('victory.tie')}
        </p>
        <div className="flex flex-col gap-2">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-4 rounded-2xl border px-6 py-3 text-2xl font-bold',
                p.id === state.winnerId
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                  : 'border-white/10 bg-white/5 text-white/80'
              )}
            >
              <span className="w-8 text-center text-white/40">{i + 1}</span>
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              {p.name}
              <span className="ml-auto inline-flex items-center gap-1.5 tabular-nums text-amber-200">
                <Crown className="h-5 w-5" /> {p.crowns}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (state.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-amber-300/80">{t('countdown.title')}</p>
        <TvBigCountdown seconds={secondsLeft} colorClass="text-amber-200" />
        <p className="text-xl text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      {/* Manche + phase + juge + timer */}
      <div className="flex items-center gap-4">
        <span className="text-xl font-black text-white/80">
          {t('round', { n: state.round + 1, total: state.totalRounds })}
        </span>
        <span className="text-lg font-semibold uppercase tracking-widest text-amber-300">
          {state.phase === 'submit' && t('phaseSubmit')}
          {state.phase === 'judging' && t('phaseJudging')}
          {state.phase === 'reveal' && t('phaseReveal')}
        </span>
        <span className="inline-flex items-center gap-1.5 text-lg text-white/50">
          <Crown className="h-5 w-5 text-amber-300" /> {judge?.name ?? '—'}
        </span>
        {timeLeftMs !== null && (
          <TvTimeBar timeLeftMs={timeLeftMs} totalMs={totalPhaseMs} dangerMs={10_000} colorClass="bg-gold" dangerClass="bg-suit-red" />
        )}
      </div>

      {/* Carte noire */}
      {state.black && (
        <div className="mx-auto w-full max-w-4xl rounded-3xl border-2 border-gold/50 bg-[#1d1a14] px-8 py-6 text-center shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
          <p className="font-display text-4xl font-bold leading-snug text-cream">{state.black}</p>
        </div>
      )}

      {/* Centre par phase */}
      {state.phase === 'reveal' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          {state.crowned ? (
            <>
              <p className="flex items-center gap-2 font-display text-3xl font-bold text-gold">
                <Crown className="h-8 w-8" /> {t('crowned.title')}
              </p>
              <div className="max-w-3xl rounded-2xl border border-[#D8CCAE] bg-cream px-8 py-5 text-center text-3xl font-black text-[#24201A] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.8)]">
                {state.crowned.text}
              </div>
              <p className="text-2xl font-bold text-amber-200">{t('crowned.by', { name: state.crowned.playerName })}</p>
            </>
          ) : (
            <p className="text-3xl font-bold text-white/60">{t('crowned.nobody')}</p>
          )}
        </div>
      ) : state.phase === 'judging' && state.submissions ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-2 overflow-y-auto">
          <p className="text-center text-2xl font-bold text-amber-200">
            {t('judgeReading', { name: judge?.name ?? '—' })}
          </p>
          {state.submissions.map((s) => (
            <div
              key={s.card}
              className="rounded-2xl border border-[#D8CCAE] bg-cream px-6 py-3 text-center text-2xl font-bold text-[#24201A]"
            >
              {s.text}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-4xl font-black text-white">{t('phaseSubmit')}</p>
          <p className="text-xl text-white/50">
            {t('judgeWaits', { count: playedCount, total: inRound.length })}
          </p>
        </div>
      )}

      {/* Joueurs (couronnes + a joué ✓) */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.players.map((p) => {
          const done = state.phase === 'submit' && !p.isJudge && p.hasPlayed
          return (
            <span
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-1.5 text-lg font-bold',
                p.isJudge
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                  : done
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/10 bg-white/5 text-white/60'
              )}
            >
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              {p.name}
              {p.crowns > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Crown className="h-4 w-4" /> {p.crowns}
                </span>
              )}
              {done && ' ✓'}
            </span>
          )
        })}
      </div>
    </div>
  )
}
