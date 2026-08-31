"use client"

import { Pencil, Skull, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botEmojiFromName } from '@/lib/online/bot-personas'
import type { ImposteurClientView } from '@/lib/imposteur/engine'
import { IMPOSTEUR_CLUE_MS, IMPOSTEUR_VOTE_MS } from '@/lib/imposteur/engine'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * L'IMPOSTEUR sur grand écran : les indices en grand, qui parle, qui a voté —
 * JAMAIS les mots des vivants (la vue TV est neutre). Révélation complète à
 * la fin de partie seulement.
 */
export function TvImposteur({ room, state }: { room: TvRoomDto; state: ImposteurClientView }) {
  const t = useTranslations('games.imposteur.game')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (state.phaseEndsAt === null || state.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [state.phaseEndsAt, state.phase])

  const finished = state.phase === 'finished'
  const reveal = state.lastReveal
  const activeId = state.phase === 'clue' ? state.clueOrder[state.clueTurnIdx] : null
  const currentClues = state.clues.filter((c) => c.round === state.round)
  const timeLeftMs = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - clock)
  const totalPhaseMs = state.phase === 'clue' ? IMPOSTEUR_CLUE_MS : IMPOSTEUR_VOTE_MS
  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // ── Fin de partie : révélation complète ──────────────────────────────────
  if (finished) {
    const civilWon = state.winnerTeam === 'civil'
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">
          <Trophy aria-hidden className="inline h-[0.85em] w-[0.85em] text-gold" /> {civilWon ? t('victory.civilWin') : t('victory.imposteurWin')}
        </p>
        <p className="text-2xl font-semibold uppercase tracking-widest text-white/50">
          {t('victory.fullReveal')}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {state.players.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-5 py-3 text-2xl font-bold',
                p.team === 'imposteur'
                  ? 'border-suit-red/50 bg-suit-red/15 text-red-100'
                  : 'border-white/10 bg-white/5 text-white/80',
                p.eliminated && 'opacity-50'
              )}
            >
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              {p.name}
              {p.eliminated && <Skull aria-hidden className="ml-1 inline h-5 w-5 text-white/50" />}
              <span className="text-white/50">« {p.word} »</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-sm font-black uppercase',
                  p.team === 'imposteur'
                    ? 'bg-suit-red/30 text-red-100'
                    : 'bg-emerald-500/20 text-emerald-100'
                )}
              >
                {p.team === 'imposteur' ? t('victory.teamImposteur') : t('victory.teamCivil')}
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
        <p className="text-3xl font-black uppercase tracking-widest text-gold/80">
          {t('countdown.title')}
        </p>
        <TvBigCountdown seconds={secondsLeft} colorClass="text-gold" />
        <p className="text-xl text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      {/* Manche + phase + timer */}
      <div className="flex items-center gap-4">
        <span className="text-xl font-black text-white/80">{t('round', { n: state.round })}</span>
        <span className="text-lg font-semibold uppercase tracking-widest text-gold">
          {state.phase === 'clue' && t('phaseClue')}
          {state.phase === 'vote' && t('phaseVote')}
          {state.phase === 'reveal' && t('phaseReveal')}
        </span>
        {timeLeftMs !== null && (
          <TvTimeBar timeLeftMs={timeLeftMs} totalMs={totalPhaseMs} dangerMs={10_000} colorClass="bg-gold" dangerClass="bg-red-400" />
        )}
      </div>

      {/* Centre par phase */}
      {state.phase === 'reveal' && reveal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          {reveal.eliminatedId ? (
            <>
              <p className="text-5xl font-black text-white">
                {t('reveal.outTitle', { name: nameOf(reveal.eliminatedId) })}
              </p>
              <p className="text-3xl text-white/70">
                {t('reveal.outWord', { word: reveal.word ?? '—' })}
              </p>
              <p
                className={cn(
                  'rounded-full px-6 py-2 text-3xl font-black uppercase',
                  reveal.team === 'imposteur'
                    ? 'bg-suit-red/25 text-red-100'
                    : 'bg-emerald-500/20 text-emerald-100'
                )}
              >
                {reveal.team === 'imposteur' ? t('reveal.wasImposteur') : t('reveal.wasCivil')}
              </p>
              <p className="text-2xl font-bold text-amber-200">
                {t('reveal.sips', { name: nameOf(reveal.eliminatedId), sips: reveal.sips })}
              </p>
            </>
          ) : (
            <>
              <p className="text-5xl font-black text-white">{t('reveal.tieTitle')}</p>
              <p className="text-2xl text-white/60">{t('reveal.tieMsg')}</p>
            </>
          )}
        </div>
      ) : state.phase === 'vote' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-4xl font-black text-white">{t('votePrompt')}</p>
          <p className="text-xl text-white/50">{t('spectatorVote')}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <p className="text-center text-2xl font-bold text-gold">
            {t('turnOf', { name: nameOf(activeId) })}
          </p>
          <div className="mx-auto w-full max-w-3xl space-y-2">
            {state.clueOrder.map((pid) => {
              const p = state.players.find((q) => q.id === pid)
              if (!p) return null
              const clue = currentClues.find((c) => c.playerId === pid)
              return (
                <div
                  key={pid}
                  className={cn(
                    'flex items-center gap-4 rounded-2xl border px-5 py-2.5',
                    pid === activeId
                      ? 'border-gold/50 bg-gold/10'
                      : 'border-white/10 bg-white/5',
                    p.eliminated && 'opacity-40'
                  )}
                >
                  <span className="text-2xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                  <span className="w-52 shrink-0 truncate text-xl font-bold text-white/80">
                    {p.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-2xl font-black text-white">
                    {clue ? `« ${clue.text} »` : pid === activeId ? <Pencil aria-hidden className="inline h-5 w-5 animate-pulse text-gold/70" /> : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Joueurs (votes ✓ pendant le vote) */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-1.5 text-lg font-bold',
              state.phase === 'vote' && p.hasVoted
                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                : 'border-white/10 bg-white/5 text-white/60',
              p.eliminated && 'opacity-40'
            )}
          >
            <span aria-hidden>{p.eliminated ? <Skull aria-hidden className="inline h-5 w-5" /> : <PlayerAvatarGlyph value={iconOf(p)} />}</span>
            {p.name}
            {state.phase === 'vote' && !p.eliminated && p.hasVoted && ' ✓'}
          </span>
        ))}
      </div>
    </div>
  )
}
