"use client"

import { useEffect, useState, type CSSProperties } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, Trophy } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { cn } from '@/lib/utils'
import { chiffrePiegeZone } from '@/lib/chiffre-piege/display'
import {
  chiffrePiegeAttempts,
  chiffrePiegeNextStarterId,
  chiffrePiegeOdds,
  chiffrePiegeRanking,
  chiffrePiegeStake,
  hasChiffrePiegeJoker,
} from '@/lib/chiffre-piege/engine'
import {
  currentChiffrePiegeActorId,
  type ChiffrePiegeClientView,
  type ChiffrePiegeOnlinePlayer,
} from '@/lib/chiffre-piege/online-state'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { useChiffrePiegeText } from '@/app/[locale]/games/chiffre-piege/components/use-chiffre-piege-text'

/**
 * Le Chiffre Piégé sur grand écran : l'intervalle en très grand, qui joue,
 * l'enjeu, les essais de la manche et le compte de chacun ; puis le BOUM en
 * rouge carreau et le classement. La vue TV est celle des téléphones : le
 * piège n'y est JAMAIS avant d'avoir sauté. Gorgées ou points selon
 * l'ambiance de la télé.
 */

/** Même seuil que les téléphones : avertissement 1 min avant le remplacement d'un inactif. */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000
/**
 * Essais affichés, les plus récents d'abord, sur UNE rangée (les suivants
 * passent à la ligne, masquée) : l'intervalle les résume déjà tous.
 */
const HISTORY_SHOWN = 8

// Décor du BOUM en jetons (rouge carreau, crème) : aucun hex, comme le téléphone.
const BOOM_GLOW: CSSProperties = {
  background:
    'radial-gradient(120% 70% at 50% 36%, rgb(var(--cream-rgb) / 0.2) 0%, rgb(var(--cream-rgb) / 0) 45%), radial-gradient(140% 90% at 50% 110%, rgb(0 0 0 / 0.45) 0%, rgb(0 0 0 / 0) 60%)',
}

/** Taille du nom au tour : un nom long descend d'un cran au lieu d'être tronqué. */
function nameSizeClass(name: string): string {
  if (name.length <= 8) return 'text-6xl'
  if (name.length <= 12) return 'text-5xl'
  return 'text-4xl'
}

export function TvChiffrePiege({ room, state }: { room: TvRoomDto; state: ChiffrePiegeClientView }) {
  const t = useTranslations('games.chiffre-piege')
  const tv = useTranslations('tv')
  const format = useFormatter()
  const reduced = useReducedMotion()
  const { mode } = useAmbianceMode()
  const tx = useChiffrePiegeText(mode)
  const game = state.game

  const actorId = currentChiffrePiegeActorId(state)
  const actor = actorId === null ? undefined : state.players.find((p) => p.id === actorId)

  // Avertissement d'inactivité public des téléphones, recalculé ici sans réseau :
  // même départ (chaque nouvelle version d'état) et mêmes conditions.
  const afkWatchable = Boolean(
    actor && !actor.isBot && !actor.leftAt && state.players.some((p) => !p.isBot && !p.leftAt && p.id !== actor.id)
  )
  const [afkEndsAt, setAfkEndsAt] = useState<number | null>(null)
  useEffect(() => {
    setAfkEndsAt(null)
    if (!afkWatchable) return
    const turnStartedAt = Date.now()
    const timer = setTimeout(() => setAfkEndsAt(turnStartedAt + ONLINE_REPLACE_GRACE_MS), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [room.stateVersion, afkWatchable])

  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? ''
  const iconOf = (p: ChiffrePiegeOnlinePlayer) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const avatarOf = (id: string) => {
    const player = state.players.find((p) => p.id === id)
    return player ? <PlayerAvatarGlyph value={iconOf(player)} /> : null
  }
  const ranking = chiffrePiegeRanking(game)
  const leaders = ranking.filter((row) => row.rank === 1)
  const winnerLine =
    leaders.length === 1 ? t('end.winner', { name: nameOf(leaders[0].playerId) }) : t('end.tie', { count: leaders.length })

  // ── Classement final ─────────────────────────────────────────────────────
  if (state.phase === 'finished') {
    const n = ranking.length
    const cols = n <= 4 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 4
    const rows = Math.ceil(n / cols)
    const counter = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-5 px-10 py-6">
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <p className="flex items-center gap-4 font-display text-6xl font-bold text-gold">
            <Trophy aria-hidden className="h-14 w-14 shrink-0" />
            {t('end.title')}
          </p>
          <p className="text-3xl font-semibold text-white/80">{winnerLine}</p>
        </div>
        <p className="shrink-0 text-base font-bold uppercase tracking-[0.3em] text-gold/90">{tx('tv.tally')}</p>
        <div
          className={cn('grid min-h-0 flex-1 content-center gap-3', cols === 1 ? 'w-[44rem]' : 'w-full')}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 4.5rem))`,
          }}
        >
          {ranking.map((row) => (
            <div
              key={row.playerId}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border px-4',
                row.rank === 1 ? 'border-gold/60 bg-gold/20' : 'border-white/10 bg-white/5'
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-2xl font-bold lining-nums tabular-nums',
                  row.rank === 1 ? 'bg-gold text-felt-deep' : 'bg-white/10 text-white'
                )}
              >
                {row.rank}
              </span>
              <span aria-hidden className="shrink-0 text-3xl leading-none">
                {avatarOf(row.playerId)}
              </span>
              <span className="min-w-0 flex-1 truncate text-2xl font-bold text-white">{nameOf(row.playerId)}</span>
              <span className="shrink-0 font-display text-3xl font-bold lining-nums tabular-nums text-amber-300">
                {format.number(row.penalty)}
              </span>
            </div>
          ))}
        </div>
        {counter.total > 1 && counter.count > 0 && (
          <p className="shrink-0 rounded-full border-2 border-gold/50 bg-gold/10 px-8 py-2 text-2xl font-bold text-gold">
            {tv('rematchPending')} {counter.count}/{counter.total}
          </p>
        )}
      </div>
    )
  }

  // ── BOUM ─────────────────────────────────────────────────────────────────
  if (state.phase === 'boom' && game.lastBoom) {
    const boom = game.lastBoom
    const lastRound = game.roundIndex + 1 >= game.roundsTotal
    const nextStarterId = chiffrePiegeNextStarterId(game)
    const name = nameOf(boom.playerId)
    const chip = 'rounded-full bg-black/25 px-6 py-2'
    return (
      <div className="flex h-full min-h-0 w-full p-6">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-[2.5rem] bg-suit-red px-10 py-6 text-center text-cream">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={BOOM_GLOW} />
          <motion.p
            key={state.phaseKey}
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 14 }}
            className="relative font-display text-[10rem] font-bold leading-none tracking-tight drop-shadow-[0_0.375rem_0_rgba(0,0,0,0.25)]"
          >
            {t('boom.title')}
          </motion.p>
          <p className="relative flex max-w-full items-center justify-center gap-4 text-5xl font-bold">
            <span aria-hidden className="shrink-0 text-6xl leading-none">
              {avatarOf(boom.playerId)}
            </span>
            <span className="min-w-0 truncate leading-tight">{t('boom.who', { name, value: boom.trap })}</span>
          </p>
          <p className="relative max-w-full rounded-3xl bg-black/25 px-10 py-4 font-display text-6xl font-bold leading-tight lining-nums">
            {tx('boom.penalty', { name, count: boom.penalty })}
          </p>
          <ul className="relative flex flex-wrap justify-center gap-4 text-3xl font-semibold">
            <li className={chip}>{t('boom.attempts', { count: boom.attempts })}</li>
            <li className={chip}>{t('boom.round', { round: game.roundIndex + 1, total: game.roundsTotal })}</li>
            {nextStarterId && <li className={chip}>{t('boom.nextStarter', { name: nameOf(nextStarterId) })}</li>}
          </ul>
          {state.phaseEndsAt !== null && (
            <p className="relative text-3xl font-semibold text-cream/90">
              <PhaseCountdown endsAt={state.phaseEndsAt}>
                {({ seconds }) => t(lastRound ? 'online.rankingIn' : 'online.nextRoundIn', { seconds })}
              </PhaseCountdown>
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Manche en cours ──────────────────────────────────────────────────────
  const forced = game.low === game.high
  const zone = chiffrePiegeZone(game)
  // Collée à droite quand elle touche le bout : sa largeur minimale reste dans la barre.
  const zoneStyle: CSSProperties =
    game.high === game.max ? { right: 0, width: `${zone.width}%` } : { left: `${zone.left}%`, width: `${zone.width}%` }
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const recent = game.history.slice(-HISTORY_SHOWN).reverse()
  const twoCols = state.players.length > 8
  const rows = twoCols ? Math.ceil(state.players.length / 2) : state.players.length

  return (
    <div className="flex h-full min-h-0 w-full gap-6 p-6">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
        <div className="flex shrink-0 items-center gap-4 rounded-3xl border border-gold/30 bg-gold/10 py-2 pl-5 pr-3">
          {actor && (
            <span aria-hidden className="shrink-0 text-5xl leading-none">
              <PlayerAvatarGlyph value={iconOf(actor)} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold uppercase tracking-[0.2em] text-white/80">{tv('turnOf')}</p>
            {/* leading-tight APRÈS la taille : tailwind-merge l'effaçait, text-6xl
                (interligne 1) et truncate rognaient les jambages (Peggy, Hugo). */}
            <p className={cn('truncate font-display font-bold text-cream', nameSizeClass(actor?.name ?? ''), 'leading-tight')}>
              {actor?.name ?? ''}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-5 py-1 text-2xl font-bold text-white">
            {t('game.progress', {
              round: game.roundIndex + 1,
              total: game.roundsTotal,
              attempt: chiffrePiegeAttempts(game) + 1,
            })}
          </span>
        </div>

        {/* Pire cas (16 joueurs, dernier nombre, historique plein) tenu dans les
            36 rem de la colonne : la manche ne déborde jamais sur le bandeau ni
            sur les essais ; overflow-hidden en filet. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden text-center">
          <p className="font-display text-2xl font-semibold uppercase tracking-[0.2em] text-gold">
            {forced ? t('game.lastLead') : t('game.rangeLead')}
          </p>
          {/* lining-nums : les chiffres elzéviriens de Playfair lisaient « 1oo ». */}
          {forced ? (
            <p className="font-display text-[8rem] font-bold leading-none lining-nums tabular-nums text-red-300">{format.number(game.low)}</p>
          ) : (
            <p className="flex items-baseline justify-center gap-8 font-display font-bold lining-nums tabular-nums text-cream">
              <span className="text-[7rem] leading-none">{format.number(game.low)}</span>
              <span className="font-sans text-4xl font-semibold italic text-white/70">{t('game.rangeAnd')}</span>
              <span className="text-[7rem] leading-none">{format.number(game.high)}</span>
            </p>
          )}
          <div aria-hidden className="w-full max-w-[56rem]">
            <div className="relative h-6 overflow-hidden rounded-full bg-black/30">
              <span
                className={cn('absolute inset-y-0 min-w-[0.75rem] rounded-full', forced ? 'bg-red-300' : 'bg-gold')}
                style={zoneStyle}
              />
            </div>
            <div className="mt-2 flex justify-between text-xl font-semibold tabular-nums text-white/70">
              <span>{format.number(1)}</span>
              <span>{format.number(game.max)}</span>
            </div>
          </div>
          <div className="grid w-full max-w-[56rem] grid-cols-2 gap-4">
            <div className="rounded-3xl border-2 border-suit-red/60 bg-suit-red/20 px-6 py-2">
              <p className="text-xl font-bold uppercase tracking-[0.15em] text-white/80">{t('game.stake')}</p>
              <p className="font-display text-4xl font-bold leading-tight lining-nums tabular-nums text-cream">
                {tx('game.stakeValue', { count: chiffrePiegeStake(game) })}
              </p>
            </div>
            <div className="rounded-3xl border-2 border-gold/30 bg-felt-deep/70 px-6 py-2">
              <p className="text-xl font-bold uppercase tracking-[0.15em] text-white/80">{t('game.risk')}</p>
              <p className="font-display text-4xl font-bold leading-tight lining-nums tabular-nums text-cream">
                {t('game.riskValue', { count: chiffrePiegeOdds(game) })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-4">
          <p className="shrink-0 pt-1.5 text-lg font-bold uppercase tracking-[0.2em] text-white/70">{t('game.historyTitle')}</p>
          {recent.length === 0 ? (
            <p className="min-w-0 pt-1 text-2xl text-white/70">{t('game.historyEmpty')}</p>
          ) : (
            <ol className="flex max-h-[2.75rem] min-w-0 flex-wrap gap-2 overflow-hidden">
              {recent.map((move, index) => (
                <li
                  key={game.history.length - index}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-gold/30 bg-black/20 py-1 pl-4 pr-3 text-2xl text-white/80"
                >
                  <span className="min-w-0 max-w-[10rem] truncate">{nameOf(move.playerId)}</span>
                  {move.kind === 'guess' ? (
                    <>
                      <span className="font-display font-bold lining-nums tabular-nums text-white">{format.number(move.value)}</span>
                      {move.dir === 'higher' ? (
                        <ArrowUp aria-label={t('game.higher')} className="h-7 w-7 shrink-0 text-gold" />
                      ) : (
                        <ArrowDown aria-label={t('game.lower')} className="h-7 w-7 shrink-0 text-gold" />
                      )}
                    </>
                  ) : (
                    <span className="font-semibold text-gold">{t('game.jokerChip')}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <aside className={cn('flex min-h-0 shrink-0 flex-col gap-3', twoCols ? 'w-[34rem]' : 'w-[26rem]')}>
        {leftPlayer?.leftAt && (
          <div className="shrink-0 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xl font-semibold leading-snug text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}
        {afkEndsAt !== null && actor && (
          <div className="shrink-0 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-xl font-semibold leading-snug text-red-100">
            <PhaseCountdown endsAt={afkEndsAt}>
              {({ seconds }) => t('online.afkWarning', { name: actor.name, seconds })}
            </PhaseCountdown>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="shrink-0 text-base font-bold uppercase tracking-[0.3em] text-gold/90">{tx('tv.tally')}</p>
          <div
            className={cn('grid min-h-0 flex-1 grid-flow-col content-center gap-x-3 gap-y-2', twoCols ? 'grid-cols-2' : 'grid-cols-1')}
            style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 4rem))` }}
          >
            {state.players.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-2xl border px-3',
                  p.id === actorId ? 'border-gold/50 bg-gold/20' : 'border-white/10 bg-white/5'
                )}
              >
                <span aria-hidden className="shrink-0 text-3xl leading-none">
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <span className={cn('min-w-0 flex-1 truncate text-xl font-bold', p.leftAt ? 'text-white/60' : 'text-white')}>
                  {p.name}
                </span>
                {hasChiffrePiegeJoker(game, p.id) && (
                  <span className="shrink-0 rounded-full border border-gold/50 px-2 text-base font-bold uppercase text-gold">
                    {t('game.jokerChip')}
                  </span>
                )}
                <span className="shrink-0 text-2xl font-black tabular-nums text-amber-300">
                  {format.number(game.penalties[p.id] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
