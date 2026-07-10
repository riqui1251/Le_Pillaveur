"use client"

import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { MenteurClientView } from '@/lib/menteur/engine'
import { CssDie } from '@/components/games/CssDie'
import { cn } from '@/lib/utils'

/**
 * LE MENTEUR sur grand écran : l'enchère en cours en GÉANT, les gobelets
 * anonymes (comptes de dés seulement — la vue TV est neutre), et la
 * révélation quand les gobelets se lèvent. Les téléphones restent les mains.
 */
export function TvMenteur({ room, state }: { room: TvRoomDto; state: MenteurClientView }) {
  const t = useTranslations('games.menteur.game')
  const totalDice = state.players.reduce((s, p) => s + p.diceCount, 0)
  const activeId = state.phase === 'bidding' ? state.players[state.turnIdx]?.id : null
  const reveal = state.lastReveal
  const finished = state.phase === 'finished'
  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // ── Podium final ─────────────────────────────────────────────────────────
  if (finished) {
    const ranking = [...state.players].sort((a, b) => {
      if (a.id === state.winnerId) return -1
      if (b.id === state.winnerId) return 1
      return a.lostCount - b.lostCount
    })
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">
          🏆 {t('victoryTitle', { name: nameOf(state.winnerId) })}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {ranking.map((p, idx) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-5 py-3 text-2xl font-bold',
                p.id === state.winnerId
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                  : 'border-white/10 bg-white/5 text-white/70'
              )}
            >
              <span>{idx + 1}.</span>
              <span aria-hidden>{iconOf(p)}</span>
              {p.name}
              <span className="text-amber-200">🍺 {p.lostCount}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-5 p-6">
      {/* Manche + total */}
      <div className="flex items-center justify-between text-xl font-bold text-white/70">
        <span>{t('round', { n: state.round })}</span>
        <span>{t('diceOnTable', { n: totalDice })}</span>
      </div>

      {state.palifico && (
        <p className="text-center text-lg font-bold text-amber-200">
          {state.currentBid ? t('palificoBadge', { face: state.currentBid.face }) : t('palificoBadgeOpen')}
        </p>
      )}

      {/* Enchère en cours (GÉANTE) ou révélation */}
      {state.phase === 'reveal' && reveal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-3xl font-black text-white">
            {reveal.bidHeld
              ? t('reveal.bidHeld', { count: reveal.matchCount, qty: reveal.bid.qty })
              : t('reveal.bidFailed', { count: reveal.matchCount, qty: reveal.bid.qty })}
          </p>
          <div className="space-y-3">
            {reveal.allDice.map(({ playerId, dice }) => (
              <div key={playerId} className="flex items-center gap-4">
                <span className="w-48 truncate text-right text-2xl font-bold text-white/80">
                  {nameOf(playerId)}
                </span>
                <div className="flex gap-2">
                  {dice.map((d, i) => (
                    <span
                      key={i}
                      className={cn(
                        d === reveal.bid.face || (!state.palifico && reveal.bid.face !== 1 && d === 1)
                          ? ''
                          : 'opacity-30'
                      )}
                    >
                      <CssDie face={d} size="lg" />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {reveal.mode === 'calza' && reveal.loserId ? (
            <p className="text-3xl font-black text-red-200">
              {t('reveal.calzaLost', { name: nameOf(reveal.loserId), sips: reveal.sips })}
            </p>
          ) : reveal.mode === 'calza' && reveal.gainedId ? (
            <p className="text-3xl font-black text-emerald-200">
              {t('reveal.calzaWon', { name: nameOf(reveal.gainedId) })}
            </p>
          ) : reveal.mode === 'calza' ? (
            <p className="text-3xl font-black text-emerald-200">
              {t('reveal.calzaWonCapped', { name: nameOf(reveal.challengerId) })}
            </p>
          ) : (
            <p className="text-3xl font-black text-red-200">
              {t('reveal.loser', { name: nameOf(reveal.loserId), sips: reveal.sips })}
            </p>
          )}
          {reveal.eliminatedId && (
            <p className="text-2xl font-bold text-amber-200">
              {t('reveal.eliminatedMsg', { name: nameOf(reveal.eliminatedId) })}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {state.currentBid ? (
            <>
              <p className="text-2xl font-semibold uppercase tracking-widest text-white/50">
                {t('currentBid')} · {t('bidBy', { name: nameOf(state.currentBid.by) })}
              </p>
              <p className="flex items-center gap-5 text-8xl font-black text-white">
                {state.currentBid.qty} × <CssDie face={state.currentBid.face} size="xl" />
              </p>
            </>
          ) : (
            <p className="text-4xl font-black text-white/70">{t('noBid')}</p>
          )}
          <p className="text-2xl font-bold text-orange-200">
            {t('turnOf', { name: nameOf(activeId) })}
          </p>
        </div>
      )}

      {/* Joueurs : gobelets anonymes */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.players.map((p) => {
          const dead = p.diceCount === 0
          return (
            <span
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-xl font-bold',
                p.id === activeId
                  ? 'border-orange-400/60 bg-orange-500/15 text-orange-100'
                  : 'border-white/10 bg-white/5 text-white/70',
                dead && 'opacity-40'
              )}
            >
              <span aria-hidden>{iconOf(p)}</span>
              {p.name}
              <span className="text-white/50">{dead ? '💀' : `🎲 ${p.diceCount}`}</span>
              {p.lostCount > 0 && <span className="text-amber-200/80">🍺{p.lostCount}</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
