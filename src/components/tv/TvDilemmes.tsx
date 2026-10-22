"use client"

import { Check, Scale } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { DIL_VOTE_MS, type DilClientView, type DilPlayerView } from '@/lib/dilemmes/engine'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { cn } from '@/lib/utils'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/** À partir de là, le libellé d'un « Tu préfères » révélé rétrécit : la place va aux pseudos (16 votants max). */
const CROWDED_SIDE = 7

/**
 * DILEMMES sur grand écran : ce que tous les téléphones montrent — carte,
 * manche, chrono, qui a déjà voté (jamais QUOI avant la révélation, la vue TV
 * n'a que `hasVoted`), puis les camps révélés avec les pseudos, et la consigne
 * à boire hors mode Soft.
 */
export function TvDilemmes({ room, state }: { room: TvRoomDto; state: DilClientView }) {
  const t = useTranslations('games.dilemmes.game')
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'
  const card = state.card
  const reveal = state.phase === 'reveal' ? state.lastReveal ?? [] : []
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: DilPlayerView) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const active = state.players.filter((p) => !p.leftAt)
  const votedCount = active.filter((p) => p.hasVoted).length

  if (state.phase === 'countdown') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-8 py-6 text-center">
        <p className="font-display text-4xl font-bold uppercase tracking-widest text-rose-300">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-rose-200" />}
        </PhaseCountdown>
        <p className="text-3xl font-semibold text-white/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  if (state.phase === 'finished') {
    // Même quorum que les téléphones : les bots et les absents ne votent jamais la revanche.
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-12 py-6 text-center">
        <Scale aria-hidden className="h-24 w-24 text-rose-300" />
        <p className="font-display text-7xl font-bold text-gold">{t('finished.title')}</p>
        <p className="max-w-[64rem] text-3xl font-semibold leading-snug text-white/80">{t('finished.subtitle')}</p>
        {rematch.count > 0 && (
          <p className="rounded-full border border-gold/40 bg-gold/10 px-8 py-2 text-2xl font-bold text-gold">
            {t('finished.rematchWaiting', { count: rematch.count, total: rematch.total })}
          </p>
        )}
      </div>
    )
  }

  const isReveal = state.phase === 'reveal'
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const votersOf = (choice: string) => reveal.filter((r) => r.choice === choice)
  const kindLabel = card ? t(`kinds.${card.kind}`) : ''

  const choiceCard = (choice: 'A' | 'B', label: string) => {
    const voters = votersOf(choice)
    const pct = Math.round((voters.length / (reveal.length || 1)) * 100)
    return (
      <div className="flex min-h-0 min-w-0 flex-col gap-3 rounded-3xl border-2 border-[#D8CCAE] bg-cream px-6 py-4 text-[#24201A] shadow-[0_0.875rem_1.875rem_-0.875rem_rgba(0,0,0,0.8)]">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden
            className={cn(
              'shrink-0 pt-1 text-center font-display text-3xl font-black leading-none',
              choice === 'A' ? 'text-suit-red' : 'text-[#24201A]'
            )}
          >
            A<br />{choice === 'A' ? '♥' : '♠'}
          </span>
          <p
            className={cn(
              'min-w-0 flex-1 font-black leading-tight',
              !isReveal ? 'text-4xl' : card?.kind === 'prefer' && voters.length >= CROWDED_SIDE ? 'text-2xl' : 'text-3xl'
            )}
          >
            {label}
          </p>
          {isReveal && (
            <span
              className={cn(
                'shrink-0 font-display text-5xl font-black leading-none tabular-nums',
                choice === 'A' ? 'text-suit-red' : 'text-chip-blue'
              )}
            >
              {pct} %
            </span>
          )}
        </div>
        {isReveal && voters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {voters.map((r) => (
              <span
                key={r.voterId}
                className="min-w-0 max-w-full truncate rounded-full border border-[#24201A]/20 bg-[#24201A]/5 px-3 py-0.5 text-xl font-bold leading-snug text-[#3A352C]"
              >
                {nameOf(r.voterId)}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const whoCols = active.length <= 4 ? 'grid-cols-2' : active.length <= 9 ? 'grid-cols-3' : 'grid-cols-4'
  const whoTiles = () => {
    const tiles = active.map((p) => ({ p, votes: votersOf(p.id).length }))
    if (isReveal) tiles.sort((a, b) => b.votes - a.votes)
    const top = tiles.reduce((m, x) => Math.max(m, x.votes), 0)
    return (
      <div className={cn('grid gap-3', whoCols)}>
        {tiles.map(({ p, votes }) => {
          const designated = isReveal && top > 0 && votes === top
          return (
            <div
              key={p.id}
              className={cn(
                'relative flex min-w-0 items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-[#24201A] shadow-[0_0.5rem_1.125rem_-0.625rem_rgba(0,0,0,0.7)]',
                designated
                  ? 'border-gold bg-cream ring-4 ring-gold'
                  : !isReveal && p.hasVoted
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-[#D8CCAE] bg-cream',
                isReveal && votes === 0 && 'opacity-75'
              )}
            >
              <span aria-hidden className="shrink-0 text-3xl leading-none">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className="min-w-0 flex-1 truncate text-2xl font-bold">{p.name}</span>
              {/* Pastilles en coin, hors du flux : le pseudo garde toute la largeur de la tuile (4 colonnes à 16). */}
              {isReveal ? (
                votes > 0 && (
                  <span className="absolute -right-2 -top-3 flex h-11 min-w-[2.75rem] items-center justify-center rounded-full border-2 border-cream bg-suit-red px-2 font-display text-3xl font-black leading-none text-white">
                    {votes}
                  </span>
                )
              ) : (
                p.hasVoted && (
                  <span className="absolute -right-2 -top-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-cream bg-emerald-600 text-white">
                    <Check aria-hidden className="h-6 w-6" strokeWidth={3} />
                  </span>
                )
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 px-8 py-5">
      <div className="flex shrink-0 items-center gap-6">
        <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-5 py-1 text-2xl font-black text-white">
          {t('round', { n: state.round + 1, total: state.totalRounds })}
        </span>
        <span className="shrink-0 text-xl font-bold uppercase tracking-widest text-rose-300">{kindLabel}</span>
        {state.phase === 'vote' && state.phaseEndsAt !== null ? (
          <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
            {({ leftMs }) => (
              <TvTimeBar timeLeftMs={leftMs} totalMs={DIL_VOTE_MS} dangerMs={8_000} colorClass="bg-gold" dangerClass="bg-red-400" />
            )}
          </PhaseCountdown>
        ) : (
          <span className="flex-1" />
        )}
        {state.phase === 'vote' ? (
          <span className="flex shrink-0 items-center gap-2 text-2xl font-black tabular-nums text-emerald-200">
            <Check aria-hidden className="h-7 w-7" strokeWidth={3} />
            {votedCount}/{active.length}
          </span>
        ) : (
          <span className="shrink-0 font-display text-3xl font-bold uppercase tracking-widest text-gold">{t('phaseReveal')}</span>
        )}
      </div>

      {leftPlayer?.leftAt && (
        <p className="shrink-0 truncate rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-2 text-center text-xl font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
        {/* Au reveal d'un « Tu préfères », l'invite (déjà dans le bandeau) cède sa place aux pseudos des deux camps. */}
        {card && !(isReveal && card.kind === 'prefer') && (
          <p
            className={cn(
              'line-clamp-3 shrink-0 text-center font-display font-bold leading-tight text-cream',
              isReveal ? 'text-4xl' : 'text-5xl'
            )}
          >
            {card.kind === 'prefer' ? t('preferPrompt') : `${card.kind === 'never' ? t('neverPrompt') : t('whoPrompt')} ${card.text}`}
          </p>
        )}
        {card?.kind === 'prefer' && (
          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-5">
            {choiceCard('A', card.a)}
            <span aria-hidden className="self-center font-display text-3xl font-bold uppercase tracking-[0.3em] text-gold">
              {t('or')}
            </span>
            {choiceCard('B', card.b)}
          </div>
        )}
        {card?.kind === 'never' && (
          <div className="grid min-h-0 grid-cols-2 items-stretch gap-8">
            {choiceCard('A', t('neverDid'))}
            {choiceCard('B', t('neverNever'))}
          </div>
        )}
        {card?.kind === 'who' && whoTiles()}
      </div>

      {state.phase === 'vote' && card?.kind !== 'who' && (
        <div className="flex shrink-0 flex-wrap justify-center gap-2">
          {state.players.map((p) => (
            <span
              key={p.id}
              className={cn(
                'inline-flex min-w-0 max-w-[16rem] items-center gap-2 rounded-full border-2 px-4 py-1 text-xl font-bold',
                p.leftAt
                  ? 'border-white/20 bg-white/5 text-white/60'
                  : p.hasVoted
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                    : 'border-white/20 bg-white/10 text-white/80'
              )}
            >
              <span aria-hidden className="shrink-0 leading-none">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className="min-w-0 truncate">{p.name}</span>
              {p.hasVoted && <Check aria-hidden className="h-6 w-6 shrink-0" strokeWidth={3} />}
            </span>
          ))}
        </div>
      )}
      {state.phase === 'vote' && card?.kind === 'who' && (
        <p className="shrink-0 text-center text-2xl font-semibold text-white/80">{t('votePrompt')}</p>
      )}
      {isReveal && !soft && (
        <p className="shrink-0 text-center font-display text-4xl font-bold text-amber-200">
          {card?.kind === 'who' ? t('whoDrinks') : t('minorityDrinks')}
        </p>
      )}
    </div>
  )
}
