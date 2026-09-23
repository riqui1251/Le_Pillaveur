"use client"

import { Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botEmojiFromName } from '@/lib/online/bot-personas'
import type { BluffClientView } from '@/lib/bluff/engine'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * LE GRAND BLUFF sur grand écran : la question en grand, le nombre de
 * bluffs soumis / votes reçus (jamais leur contenu avant le reveal),
 * puis la révélation complète (réponse, auteurs, votes, points).
 */
export function TvBluff({ room, state }: { room: TvRoomDto; state: BluffClientView }) {
  const t = useTranslations('games.bluff.game')
  const finished = state.phase === 'finished'
  const reveal = state.lastReveal
  const totalPhaseMs = state.phase === 'submit' ? 45_000 : 60_000
  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const submittedCount = state.players.filter((p) => p.hasSubmitted).length
  const votedCount = state.players.filter((p) => p.hasVoted).length

  // ── Fin de partie : podium ────────────────────────────────────────────────
  if (finished) {
    const sorted = [...state.players].sort((a, b) => b.score - a.score)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">
          <Trophy aria-hidden className="inline h-[0.85em] w-[0.85em] text-gold" /> {state.winnerId ? t('victory.winnerIs', { name: nameOf(state.winnerId) }) : t('victory.tie')}
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
              <span className="w-8 text-center text-white/70">{i + 1}</span>
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              {p.name}
              <span className="ml-auto tabular-nums text-amber-200">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (state.phase === 'countdown') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-rose-300/80">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-rose-200" />}
        </PhaseCountdown>
        <p className="text-xl text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      {/* Manche + phase + timer */}
      <div className="flex items-center gap-4">
        <span className="text-xl font-black text-white/80">
          {t('round', { n: state.promptIdx + 1, total: state.totalRounds })}
        </span>
        <span className="text-lg font-semibold uppercase tracking-widest text-rose-300">
          {state.phase === 'submit' && t('phaseSubmit')}
          {state.phase === 'vote' && t('phaseVote')}
          {state.phase === 'reveal' && t('phaseReveal')}
        </span>
        {state.phaseEndsAt !== null && (
          <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
            {({ leftMs }) => <TvTimeBar timeLeftMs={leftMs} totalMs={totalPhaseMs} dangerMs={10_000} colorClass="bg-rose-400" dangerClass="bg-red-400" />}
          </PhaseCountdown>
        )}
      </div>

      {/* Question */}
      {state.prompt && (
        <p className="text-center text-4xl font-black text-white">{state.prompt}</p>
      )}

      {/* Centre par phase */}
      {state.phase === 'reveal' && reveal ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-2 overflow-y-auto">
          <p className="text-center text-2xl font-bold text-emerald-200">
            {t('reveal.realAnswer', { answer: reveal.realAnswer })}
          </p>
          {reveal.candidates.map((c) => (
            <div
              key={c.candidateId}
              className={cn(
                'flex items-center gap-4 rounded-2xl border px-5 py-2.5',
                c.isReal ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/10 bg-white/5'
              )}
            >
              <span className="min-w-0 flex-1 truncate text-2xl font-black text-white">« {c.text} »</span>
              {!c.isReal && c.authorId && (
                <span className="shrink-0 text-lg text-white/70">{nameOf(c.authorId)}</span>
              )}
              {c.votes.length > 0 && (
                <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-lg font-bold text-white/70">
                  {c.votes.map((id) => nameOf(id)).join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : state.phase === 'submit' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-4xl font-black text-white">{t('submitPrompt')}</p>
          <p className="text-xl text-white/50">{t('submitted', { count: submittedCount, total: state.players.length })}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-4xl font-black text-white">{t('votePrompt')}</p>
          <p className="text-xl text-white/50">{t('voted', { count: votedCount, total: state.players.length })}</p>
        </div>
      )}

      {/* Joueurs (soumis/voté ✓) */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.players.map((p) => {
          const done = state.phase === 'submit' ? p.hasSubmitted : state.phase === 'vote' ? p.hasVoted : false
          return (
            <span
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-1.5 text-lg font-bold',
                done
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                  : 'border-white/10 bg-white/5 text-white/60'
              )}
            >
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              {p.name}
              {done && ' ✓'}
            </span>
          )
        })}
      </div>
    </div>
  )
}
