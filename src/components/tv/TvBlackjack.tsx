"use client"

import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { BlackjackSyncedState } from '@/lib/online-game-state'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { BjTable } from '@/app/[locale]/games/blackjack/components/blackjack-table'
import { useBjUnits } from '@/app/[locale]/games/blackjack/components/blackjack-ui'
import { bjNetPoints } from '@/app/[locale]/games/blackjack/components/blackjack-tally'

const netLabel = (net: number) => (net > 0 ? `+${net}` : net < 0 ? `−${-net}` : '0')

/**
 * Black Jack sur grand écran : le croupier en haut, la table en dessous. La
 * vue spectateur cache la carte fermée du croupier comme celle des joueurs.
 */
export function TvBlackjack({ room, state }: { room: TvRoomDto; state: BlackjackSyncedState }) {
  const t = useTranslations('games.blackjack')
  const tv = useTranslations('tv')
  const { soft } = useBjUnits()

  const iconOf = (userId: string) => {
    const player = state.players.find((p) => p.id === userId)
    if (player?.isBot) return botAvatarFromName(player.name)
    return room.members.find((m) => m.userId === userId)?.preferences?.icon ?? '👤'
  }

  if (state.phase === 'finished') {
    const ranking = [...state.players].sort((a, b) =>
      soft
        ? bjNetPoints(state.totals[b.id]) - bjNetPoints(state.totals[a.id])
        : (state.totals[b.id]?.drunk ?? 0) - (state.totals[a.id]?.drunk ?? 0)
    )
    const counter = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-6 px-10 py-6">
        <p className="text-6xl font-black text-gold">{t('finishedTitle')}</p>
        <p className="text-2xl font-semibold text-white/80">{t('roundsPlayed', { count: state.round })}</p>
        <div className="grid w-[48rem] gap-3">
          {ranking.map((p) => {
            const tally = state.totals[p.id]
            return (
              <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
                <span className="text-3xl" aria-hidden>
                  <PlayerAvatarGlyph value={iconOf(p.id)} />
                </span>
                <span className="min-w-0 flex-1 truncate text-2xl font-bold text-white">{p.name}</span>
                <span className="text-xl text-white/70">
                  {soft
                    ? t('soft.tallyLine', { wins: tally?.wins ?? 0, hands: tally?.hands ?? 0 })
                    : t('tallyLine', { wins: tally?.wins ?? 0, hands: tally?.hands ?? 0, given: tally?.given ?? 0 })}
                </span>
                <span className="text-3xl font-black tabular-nums text-amber-300">
                  {soft
                    ? t('soft.net', { value: netLabel(bjNetPoints(tally)) })
                    : t('drunk', { count: tally?.drunk ?? 0 })}
                </span>
              </div>
            )
          })}
        </div>
        {counter.total > 1 && counter.count > 0 && (
          <p className="text-2xl font-bold text-gold">
            {tv('rematchPending')} {t('online.rematchWaiting', { count: counter.count, total: counter.total })}
          </p>
        )}
      </div>
    )
  }

  const turnOwner = state.phase === 'playing' && state.turn ? state.players[state.turn.player] : undefined
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 px-6 pb-4 pt-2">
      <header className="flex shrink-0 items-center justify-between gap-6">
        <p className="text-2xl font-bold uppercase tracking-[0.25em] text-gold">
          {t(`phase.${state.phase}`)} · <span className="text-white/80">{t('round', { count: state.round })}</span>
        </p>
        <p className="truncate text-2xl font-semibold text-white/90">
          {turnOwner ? t('turnOf', { name: turnOwner.name }) : state.phase === 'betting' ? t('online.waitingBets') : ''}
        </p>
      </header>
      {leftPlayer?.leftAt && (
        <div className="shrink-0 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xl font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}
      {/* La table garde ses proportions et tient dans la hauteur restante. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="h-full max-w-full" style={{ aspectRatio: '1000 / 560' }}>
          <BjTable
            variant="tv"
            dealer={state.dealer}
            dealerBlackjack={state.dealerBlackjack}
            showResults={state.phase === 'results'}
            seats={state.players.map((p, i) => ({
              id: p.id,
              name: p.name,
              avatar: <PlayerAvatarGlyph value={iconOf(p.id)} />,
              stake: p.stake,
              hands: p.hands,
              results: p.results,
              activeHand: state.phase === 'playing' && state.turn?.player === i ? state.turn.hand : null,
              away: Boolean(p.leftAt),
            }))}
          />
        </div>
      </div>
    </div>
  )
}
