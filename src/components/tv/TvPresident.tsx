"use client"

import { Crown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName, type SpeechGenre } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { genreOf, genreOfId } from '@/components/online/bot-speech/bot-speech-feed'
import { rematchCounter } from '@/components/online/end-screen'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import {
  preIsJoker,
  preRankOf,
  preSuitOf,
  PRE_RANKS,
  PRE_SUITS,
  PRE_TURN_MS,
  type PreClientView,
  type PrePlayerView,
  type PreTrickEntry,
} from '@/lib/president/engine'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * PRÉSIDENT sur grand écran. Vue SPECTATEUR : les mains (et les cartes
 * échangées) n'y figurent pas — seulement les comptes, comme sur chaque
 * téléphone pour les mains adverses. Le tapis (dernier combo) au centre, la
 * table en colonne à droite, les plis précédents en bandeau.
 */

const ROLE_BADGES: Record<string, string> = {
  president: '👑',
  vicePresident: '🎖️',
  viceTrou: '🪠',
  trou: '🕳️',
}

/** Plis précédents affichés : un bandeau d'une ligne, le reste est sur les téléphones. */
const HISTORY_SHOWN = 3

function isRed(card: number): boolean {
  if (preIsJoker(card)) return false
  const suit = PRE_SUITS[preSuitOf(card)]
  return suit === '♥' || suit === '♦'
}

function BigCard({ card }: { card: number }) {
  const joker = preIsJoker(card)
  const ink = isRed(card) ? 'text-suit-red' : 'text-[#24201A]'
  return (
    <div
      className={cn(
        'flex h-40 w-28 shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-[#D8CCAE] bg-cream shadow-[0_0.875rem_1.875rem_-0.875rem_rgba(0,0,0,0.8)]',
        joker && 'border-violet-400/70 bg-gradient-to-b from-cream to-violet-100'
      )}
    >
      {joker ? (
        <span className="text-7xl leading-none" aria-label="Joker">
          🃏
        </span>
      ) : (
        <>
          <span className={cn('font-display text-6xl font-black leading-none', ink)}>{PRE_RANKS[preRankOf(card)]}</span>
          <span className={cn('mt-1 text-5xl leading-none', ink)} aria-hidden>
            {PRE_SUITS[preSuitOf(card)]}
          </span>
        </>
      )}
    </div>
  )
}

/** Carte en ligne (historique) : petite plaque crème, lisible à distance. */
function MiniCard({ card }: { card: number }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.25rem] items-center justify-center rounded-md border border-[#D8CCAE] bg-cream px-1.5 py-0.5 text-xl font-black leading-tight',
        isRed(card) ? 'text-suit-red' : 'text-[#24201A]'
      )}
    >
      {preIsJoker(card) ? '🃏' : `${PRE_RANKS[preRankOf(card)]}${PRE_SUITS[preSuitOf(card)]}`}
    </span>
  )
}

export function TvPresident({ room, state }: { room: TvRoomDto; state: PreClientView }) {
  const t = useTranslations('games.president.game')
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'
  const nameOf = (id: string | null) => state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const roleLabel = (role: string, genre: SpeechGenre) =>
    role === 'president'
      ? t('roles.president', { genre })
      : role === 'trou'
        ? t('roles.trou')
        : role === 'vicePresident'
          ? t('roles.vicePresident', { genre })
          : t('roles.viceTrou')

  if (state.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 py-6">
        <p className="text-4xl font-black uppercase tracking-widest text-emerald-300/90">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-emerald-200" />}
        </PhaseCountdown>
        <p className="text-3xl font-bold text-white/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  if (state.phase === 'interlude' || state.phase === 'finished') {
    return <Ranking room={room} state={state} soft={soft} iconOf={iconOf} roleLabel={roleLabel} nameOf={nameOf} />
  }

  const lastPlay = state.lastPlay
  // « Ou rien » : la dernière pose a égalé la précédente → rang verrouillé.
  const lockedRank =
    lastPlay && state.trickRun && state.trickRun.count > lastPlay.cards.length ? state.trickRun.rank : null
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const history = state.trickHistory ?? []
  const shownHistory = history.slice(-HISTORY_SHOWN).reverse()
  const many = state.players.length > 5

  return (
    <div className="flex min-h-0 flex-1 gap-6 px-8 py-5">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-baseline justify-between gap-6">
          <p className="shrink-0 text-2xl font-bold text-white/80">
            {t('manche', { n: state.manche + 1, total: state.totalManches })}
          </p>
          <p className="min-w-0 truncate text-4xl font-black text-gold">{t('turnOf', { name: nameOf(state.currentTurnId) })}</p>
        </div>

        {state.phaseEndsAt !== null && (
          <div className="flex">
            <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
              {({ leftMs }) => <TvTimeBar timeLeftMs={leftMs} totalMs={PRE_TURN_MS} dangerMs={8_000} />}
            </PhaseCountdown>
          </div>
        )}

        {leftPlayer?.leftAt && (
          <div className="truncate rounded-2xl border-2 border-amber-400/40 bg-amber-500/10 px-5 py-2 text-center text-xl font-bold text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-3xl border-2 border-white/10 bg-black/20 px-6 py-4">
          {lastPlay ? (
            <>
              <div className="flex gap-4">
                {lastPlay.cards.map((card) => (
                  <BigCard key={card} card={card} />
                ))}
              </div>
              <p className="max-w-full truncate text-3xl font-bold text-white/80">
                {t('lastPlayBy', { name: nameOf(lastPlay.playerId) })}
              </p>
              {lockedRank !== null && (
                <p className="rounded-full border-2 border-amber-400/60 bg-amber-500/[0.15] px-6 py-1 text-3xl font-black text-amber-200">
                  {t('ouRien', { rank: PRE_RANKS[lockedRank] })}
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-5xl font-black text-white/80">{t('freeTrick')}</p>
          )}
        </div>

        {shownHistory.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-base font-bold uppercase tracking-widest text-white/70">
              {t('history.title', { count: history.length })}
            </p>
            <div className="flex min-w-0 gap-3 overflow-hidden">
              {shownHistory.map((entry, i) => (
                <TrickChip key={history.length - i} entry={entry} players={state.players} iconOf={iconOf} />
              ))}
            </div>
          </div>
        )}
      </div>

      <ul className="flex w-[26rem] shrink-0 flex-col justify-center gap-2">
        {state.players.map((p) => {
          const outIdx = state.outOrder.indexOf(p.id)
          const active = state.currentTurnId === p.id
          return (
            <li
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border-2 px-4',
                many ? 'py-2.5' : 'py-3.5',
                active
                  ? 'border-gold/70 bg-gold/[0.15] text-gold'
                  : outIdx !== -1
                    ? 'border-emerald-400/50 bg-emerald-500/[0.15] text-emerald-100'
                    : 'border-white/20 bg-white/5 text-white',
                p.leftAt && 'opacity-75'
              )}
            >
              <span className="shrink-0 text-3xl leading-none" aria-hidden>
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className={cn('min-w-0 flex-1 truncate font-bold', many ? 'text-xl' : 'text-2xl')}>{p.name}</span>
              {p.role && (
                <span className="shrink-0 text-3xl leading-none" aria-label={roleLabel(p.role, genreOf(p))}>
                  {ROLE_BADGES[p.role]}
                </span>
              )}
              <span
                className={cn(
                  'shrink-0 text-2xl font-black tabular-nums',
                  outIdx !== -1 ? 'text-emerald-200' : active ? 'text-gold' : 'text-white/80'
                )}
              >
                {outIdx !== -1 ? `#${outIdx + 1}` : `🂠 ${p.handCount}`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Un pli terminé, résumé : qui l'a remporté, et avec quoi. */
function TrickChip({
  entry,
  players,
  iconOf,
}: {
  entry: PreTrickEntry
  players: PrePlayerView[]
  iconOf: (p: PrePlayerView) => string
}) {
  const winningPlay =
    [...entry.plays].reverse().find((pl) => pl.playerId === entry.winnerId) ?? entry.plays[entry.plays.length - 1]
  const winner = players.find((p) => p.id === (entry.winnerId ?? winningPlay?.playerId))
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2 rounded-2xl border-2 border-white/10 bg-white/5 px-3 py-1.5">
      {winner && (
        <span className="text-3xl leading-none" aria-label={winner.name}>
          <PlayerAvatarGlyph value={iconOf(winner)} />
        </span>
      )}
      {winningPlay?.cards.map((card) => (
        <MiniCard key={card} card={card} />
      ))}
    </div>
  )
}

/** Fin de manche (classement + échange automatique à venir) et fin de partie. */
function Ranking({
  room,
  state,
  soft,
  iconOf,
  roleLabel,
  nameOf,
}: {
  room: TvRoomDto
  state: PreClientView
  soft: boolean
  iconOf: (p: PrePlayerView) => string
  roleLabel: (role: string, genre: SpeechGenre) => string
  nameOf: (id: string | null) => string
}) {
  const t = useTranslations('games.president.game')
  const finished = state.phase === 'finished'
  const ranking = (state.lastRanking ?? []).filter((id) => state.players.some((p) => p.id === id))
  const len = ranking.length
  const roleAt = (i: number): string | null => {
    if (i === 0) return 'president'
    if (i === len - 1) return 'trou'
    if (len >= 4 && i === 1) return 'vicePresident'
    if (len >= 4 && i === len - 2) return 'viceTrou'
    return null
  }
  const twoCols = len > 5
  const rows = Math.ceil(len / 2)
  const rematch = finished ? rematchCounter(room.members, state.rematchVotes ?? [], null) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-10 py-5">
      <div className="flex min-w-0 max-w-full items-center gap-4">
        <Crown className="h-14 w-14 shrink-0 text-gold" aria-hidden />
        <p className="truncate font-display text-6xl font-black text-gold">
          {finished ? t('finished.title') : t('mancheEnd', { n: state.manche + 1 })}
        </p>
      </div>
      {finished && ranking[0] && (
        <p className="max-w-full truncate text-3xl font-bold text-white/90">
          {t('finished.subtitle', { name: nameOf(ranking[0]), genre: genreOfId(state.players, ranking[0]) })}
        </p>
      )}

      <div
        className={cn('grid w-full gap-x-6 gap-y-3', twoCols ? 'grid-flow-col grid-cols-2' : 'max-w-[48rem] grid-cols-1')}
        style={twoCols ? { gridTemplateRows: `repeat(${rows}, minmax(0, auto))` } : undefined}
      >
        {ranking.map((id, i) => {
          const p = state.players.find((x) => x.id === id)!
          const role = roleAt(i)
          const tone =
            i === 0
              ? 'border-gold/60 bg-gold/[0.15] text-gold'
              : i === len - 1
                ? 'border-red-300/50 bg-suit-red/20 text-white'
                : 'border-white/20 bg-white/5 text-white'
          return (
            <div key={id} className={cn('flex min-w-0 items-center gap-4 rounded-2xl border-2 px-5 py-2', tone)}>
              <span className="w-10 shrink-0 text-center font-display text-3xl font-black tabular-nums">{i + 1}</span>
              <span className="shrink-0 text-3xl leading-none" aria-hidden>
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className="min-w-0 flex-1 truncate text-2xl font-black">{p.name}</span>
              {role &&
                (twoCols ? (
                  // Sur 2 colonnes, le libellé mangerait le nom : l'emoji seul garde la ligne lisible.
                  <span className="shrink-0 text-3xl leading-none" aria-label={roleLabel(role, genreOf(p))}>
                    {ROLE_BADGES[role]}
                  </span>
                ) : (
                  <span className="shrink-0 text-lg font-bold uppercase tracking-wide opacity-90">
                    <span aria-hidden>{ROLE_BADGES[role]} </span>
                    {roleLabel(role, genreOf(p))}
                  </span>
                ))}
            </div>
          )
        })}
      </div>

      {!finished && <p className="max-w-[64rem] text-center text-xl font-semibold text-white/80">{t('exchangeInfo')}</p>}

      <div className="flex items-center gap-8">
        {!soft && <p className="text-3xl font-black text-amber-200">{t('trouDrinks')}</p>}
        {!finished && state.phaseEndsAt !== null && (
          <p className="text-3xl font-bold text-white/80">
            {t('nextManche')}
            <PhaseCountdown endsAt={state.phaseEndsAt}>{({ seconds }) => ` (${seconds}s)`}</PhaseCountdown>
          </p>
        )}
        {rematch && rematch.total > 1 && rematch.count > 0 && (
          <p className="text-2xl font-bold text-white/80">
            {t('finished.rematchWaiting', { count: rematch.count, total: rematch.total })}
          </p>
        )}
      </div>
    </div>
  )
}
