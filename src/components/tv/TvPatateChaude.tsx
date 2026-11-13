"use client"

import { useRef, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { useReducedMotion } from 'framer-motion'
import { Bomb, Moon, Trophy, WifiOff } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { cn } from '@/lib/utils'
import {
  PC_EXPLOSION_POINTS,
  PC_EXPLOSION_SIPS,
  PC_PENALTY_POINTS,
  PC_PENALTY_SIPS,
  PC_UNLIMITED_ROUNDS,
  isLastRound,
  pcTally,
  ranking,
  type PcChallenge,
  type PcRankingEntry,
} from '@/lib/patate-chaude/engine'
import {
  isPcSetAside,
  isPcTableTooSmall,
  pcEndStandings,
  type PcClientView,
  type PcEndRow,
  type PcOnlinePlayer,
} from '@/lib/patate-chaude/online-shared'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { BombArt, BoomBurst } from '@/app/[locale]/games/patate-chaude/components/bomb'
import { useFuseTicker } from '@/app/[locale]/games/patate-chaude/components/fuse-ticker'
import { TvBigCountdown } from './tv-shared'

/**
 * PATATE CHAUDE sur grand écran : le défi, la bombe qui bat au rythme du tic-tac, le porteur en
 * très grand, les mots déjà dits ; puis le BOUM en rouge carreau. La vue spectateur ne porte
 * jamais la mèche : la bombe bat sur l'allumage public et la borne haute de la plage, comme sur
 * les téléphones, et le BOUM arrive quand le serveur l'a tranché. Gorgées ou points selon
 * l'ambiance de la TV.
 */

/**
 * Pendant la mèche, la colonne centrale empile la carte du défi, la bombe et son porteur, puis
 * les pastilles de la table : elle doit tenir dans les 36 rem de la scène. Au-delà de six joueurs
 * (« table chargée »), les pastilles prennent trois ou quatre rangées : la bombe, les marges, la
 * lettre, la syllabe et le nom du porteur descendent d'un cran. Un thème se dimensionne sur sa
 * longueur : en text-6xl, un thème de 37 caractères prenait trois lignes et, dès huit joueurs,
 * la colonne débordait (pastilles coupées en bas, carte sur l'en-tête).
 */
const CROWDED_TABLE = 6

/**
 * Mots montrés dans la colonne « Déjà dit » : une ligne de text-2xl par mot (2,5 rem avec son
 * cadre, 0,25 rem d'écart), soit 21,75 rem pour huit — sous les 36 rem de la scène, une fois ôtés
 * le titre, les marges et une consigne de quatre lignes.
 */
const TV_WORDS_SHOWN = 8

function challengeValueClass(challenge: PcChallenge, crowded: boolean): string {
  if (challenge.kind === 'letter') return crowded ? 'text-[7rem] leading-none' : 'text-[9rem] leading-none'
  if (challenge.kind === 'syllable') {
    return crowded ? 'text-[6.5rem] leading-none tracking-wide' : 'text-[8rem] leading-none tracking-wide'
  }
  const length = Array.from(challenge.value).length
  if (length <= (crowded ? 16 : 22)) return 'text-6xl leading-tight'
  if (length <= (crowded ? 32 : 36)) return 'text-5xl leading-tight'
  return 'text-4xl leading-tight'
}

/** Un nom long descend d'un cran au lieu d'être tronqué (sauf table chargée : une ligne, d'un cran plus bas). */
function nameSizeClass(name: string, crowded: boolean): string {
  if (name.length <= 8) return crowded ? 'text-6xl' : 'text-7xl'
  if (name.length <= 14) return crowded ? 'text-5xl' : 'text-6xl'
  return crowded ? 'text-4xl' : 'text-5xl'
}

export function TvPatateChaude({ room, state }: { room: TvRoomDto; state: PcClientView }) {
  const t = useTranslations('games.patate-chaude')
  const tc = useTranslations('common')
  const tv = useTranslations('tv')
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'
  const bombRef = useRef<HTMLDivElement>(null)
  const game = state.game
  const burning = state.phase === 'burning'
  const crowded = state.players.length > CROWDED_TABLE

  useFuseTicker({
    active: burning,
    roundStartedAt: burning ? game.roundStartedAt : null,
    maxFuseMs: state.maxFuseMs,
    onTick: () => {
      const el = bombRef.current
      if (reduceMotion || !el || typeof el.animate !== 'function') return
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], {
        duration: 160,
        easing: 'ease-out',
      })
    },
  })

  const playerOf = (id: string | null | undefined) => state.players.find((p) => p.id === id)
  const nameOf = (id: string | null | undefined) => playerOf(id)?.name ?? ''
  const iconOf = (p: PcOnlinePlayer) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const asideOf = (p: PcOnlinePlayer) => isPcSetAside(state, p.id)
  // À la fin, rangs et victoire entre les joueurs encore à la table : un parti ne gagne jamais.
  const rows = state.phase === 'finished' ? pcEndStandings(state) : ranking(game)
  const unlimited = game.settings.rounds === PC_UNLIMITED_ROUNDS
  const roundLabel = unlimited
    ? t('game.round', { current: game.roundIndex + 1 })
    : t('game.roundOf', { current: game.roundIndex + 1, total: game.settings.rounds })

  const standings = (showRank: boolean) => (
    <TvStandings
      title={showRank ? t('end.ranking') : t('game.standings')}
      rows={rows}
      players={state.players}
      iconOf={iconOf}
      asideOf={asideOf}
      showRank={showRank}
      tally={(row) =>
        soft ? t('soft.points', { count: pcTally(row, 'soft') }) : tc('sipsCount', { count: pcTally(row, 'alcool') })
      }
      explosionsLabel={(count) => t('game.explosions', { count })}
      leftLabel={t('online.leftTag')}
      asideLabel={t('online.asideTag')}
      formatNumber={(n) => format.number(n)}
    />
  )

  let center: ReactNode
  let side: ReactNode = standings(false)

  if (state.phase === 'finished') {
    const winners = rows.filter((row) => row.won).map((row) => nameOf(row.playerId))
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    center = (
      <>
        <Trophy aria-hidden className="h-28 w-28 text-gold" />
        <p className="font-display text-6xl font-black leading-tight text-gold">{t('end.title')}</p>
        {winners.length > 0 && (
          <p className="max-w-[40rem] break-words text-3xl font-bold text-white/90">
            {t('end.winners', { count: winners.length, names: winners.join(', ') })}
          </p>
        )}
        {rematch.total > 1 && rematch.count > 0 && (
          <p className="rounded-full border-2 border-gold/50 bg-gold/10 px-8 py-3 text-2xl font-bold text-gold">
            {tv('rematchPending')} <span className="tabular-nums">{rematch.count}/{rematch.total}</span>
          </p>
        )}
      </>
    )
    side = standings(true)
  } else if (state.phase === 'ready' && isPcTableTooSmall(state)) {
    // Un départ a laissé moins de deux joueurs : la partie s'arrête à l'échéance (immédiate).
    center = (
      <>
        <p className="text-2xl font-bold uppercase tracking-[0.3em] text-gold/90">{roundLabel}</p>
        <BombArt lit={false} className="h-[11rem] w-[11rem]" />
        <p className="max-w-[40rem] font-display text-5xl font-black leading-tight text-cream">{t('online.notEnough')}</p>
      </>
    )
  } else if (state.phase === 'ready') {
    const holder = playerOf(game.holder)
    center = (
      <>
        <p className="text-2xl font-bold uppercase tracking-[0.3em] text-gold/90">{roundLabel}</p>
        <p className="font-display text-5xl font-black text-cream">{t('online.phase.ready')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-cream" />}
        </PhaseCountdown>
        {holder && (
          <p className="flex max-w-full items-center gap-4 font-display text-4xl font-bold text-white">
            <span aria-hidden className="shrink-0 leading-none">
              <PlayerAvatarGlyph value={iconOf(holder)} />
            </span>
            <span className="min-w-0 break-words">
              {game.roundIndex === 0
                ? t('online.startsWith', { name: holder.name })
                : t('online.startsAgain', { name: holder.name })}
            </span>
          </p>
        )}
      </>
    )
    if (game.roundIndex === 0) side = <TvTableOrder players={state.players} iconOf={iconOf} title={t('online.tableOrder')} />
  } else if (burning) {
    const holder = playerOf(game.holder)
    const next = playerOf(state.nextHolderId)
    const challenge = game.challenge
    center = (
      <>
        {challenge && (
          <PlayingCard
            corners={false}
            className={cn('w-full max-w-[42rem] px-8 text-center', crowded ? 'py-4' : 'py-5')}
          >
            <p className="text-2xl font-bold uppercase tracking-[0.2em] text-[#24201A]/70">
              {t(`game.kinds.${challenge.kind}`)}
            </p>
            <p className={cn('mt-2 break-words font-display font-extrabold', challengeValueClass(challenge, crowded))}>
              {challenge.value}
            </p>
          </PlayingCard>
        )}
        <div className="flex w-full max-w-full items-center justify-center gap-8">
          <BombArt
            ref={bombRef}
            lit
            className={cn('shrink-0', crowded ? 'h-[8rem] w-[8rem]' : 'h-[11rem] w-[11rem]')}
          />
          <div className="flex min-w-0 flex-col items-start gap-1 text-left">
            <p className="text-2xl font-semibold text-white/80">{t('game.holderLead')}</p>
            {holder && (
              <p
                className={cn(
                  'flex min-w-0 max-w-full items-center gap-4 font-display font-black leading-tight text-white',
                  nameSizeClass(holder.name, crowded)
                )}
              >
                <span aria-hidden className="shrink-0 leading-none">
                  <PlayerAvatarGlyph value={iconOf(holder)} />
                </span>
                <span className={cn('min-w-0', crowded ? 'truncate' : 'break-words')}>{holder.name}</span>
              </p>
            )}
            <p className="text-2xl text-white/80">
              {t('game.passes', { count: game.passes })}
              {next && next.id !== game.holder ? ` · ${t('online.nextIs', { name: next.name })}` : ''}
            </p>
          </div>
        </div>
        {/* La table dans l'ordre de passe, explosions comprises : les scores restent visibles pendant
            la mèche. Dès cinq joueurs, les noms sont coupés plus court : trois pastilles par rangée. */}
        <ul className="flex max-w-full flex-wrap justify-center gap-2">
          {state.players.map((p) => (
            <li
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-full border-2 px-3 py-1 text-xl font-bold',
                p.id === game.holder ? 'border-gold bg-gold/[0.15] text-white' : 'border-white/20 text-white/80',
                (p.leftAt || asideOf(p)) && 'opacity-60'
              )}
            >
              <span aria-hidden className="shrink-0 leading-none">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className={cn('min-w-0 truncate', state.players.length > 4 ? 'max-w-[8rem]' : 'max-w-[11rem]')}>
                {p.name}
              </span>
              {asideOf(p) && (
                <>
                  <Moon aria-hidden className="h-5 w-5 shrink-0 text-white/70" />
                  <span className="sr-only">{t('online.asideTag')}</span>
                </>
              )}
              <Bomb aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              <span className="tabular-nums">{format.number(game.explosions[p.id] ?? 0)}</span>
              <span className="sr-only">{t('game.explosions', { count: game.explosions[p.id] ?? 0 })}</span>
            </li>
          ))}
        </ul>
      </>
    )
    side = <TvWords state={state} iconOf={iconOf} soft={soft} />
  } else {
    const boom = game.lastBoom
    const loser = boom ? playerOf(boom.playerId) : undefined
    const lastRound = isLastRound(game)
    center = (
      <div className="relative flex w-full max-w-[44rem] flex-col items-center gap-4 overflow-hidden rounded-[2rem] bg-suit-red px-10 py-8 text-center text-cream shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
        <BoomBurst />
        <p className="relative font-display text-[8rem] font-extrabold leading-none tracking-tight [text-shadow:0_6px_0_rgb(0_0_0/0.25)]">
          {t('boom.title')}
        </p>
        {loser && (
          <p className="relative flex max-w-full items-center gap-3 text-4xl font-bold">
            <span aria-hidden className="shrink-0 leading-none">
              <PlayerAvatarGlyph value={iconOf(loser)} />
            </span>
            <span className="min-w-0 break-words">{t('boom.holder', { name: loser.name })}</span>
          </p>
        )}
        {boom && (
          <p className="relative rounded-3xl bg-black/25 px-6 py-3 font-display text-4xl font-bold leading-tight">
            {soft
              ? t('soft.verdict', { name: nameOf(boom.playerId), count: PC_EXPLOSION_POINTS })
              : t('boom.verdict', { name: nameOf(boom.playerId), count: PC_EXPLOSION_SIPS })}
          </p>
        )}
        {boom && (
          <div className="relative flex flex-wrap justify-center gap-3 text-2xl">
            <span className="rounded-full bg-black/20 px-5 py-2">
              {t('boom.fuse')}{' '}
              <b className="tabular-nums">{t('boom.fuseValue', { seconds: Math.round(boom.fuseMs / 1000) })}</b>
            </span>
            <span className="rounded-full bg-black/20 px-5 py-2">
              {t('boom.passes')} <b className="tabular-nums">{format.number(boom.passes)}</b>
            </span>
          </div>
        )}
        <p className="relative text-2xl font-semibold text-cream/90">
          <PhaseCountdown endsAt={state.phaseEndsAt}>
            {({ seconds }) =>
              lastRound
                ? t('online.rankingIn', { seconds: Math.max(1, seconds) })
                : t('online.nextRoundIn', { seconds: Math.max(1, seconds) })
            }
          </PhaseCountdown>
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full items-stretch gap-8 px-8 py-6">
      {/* my-auto plutôt que justify-center : centré tant qu'il tient, calé en haut sinon — un reste
          de dépassement est coupé en bas, jamais par-dessus l'en-tête de la TV. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className={cn('my-auto flex w-full flex-col items-center text-center', burning && crowded ? 'gap-4' : 'gap-6')}>
          {center}
        </div>
      </div>
      <aside className="flex min-h-0 w-[27rem] shrink-0 flex-col justify-center">{side}</aside>
    </div>
  )
}

function TvWords({
  state,
  iconOf,
  soft,
}: {
  state: PcClientView
  iconOf: (p: PcOnlinePlayer) => string
  soft: boolean
}) {
  const t = useTranslations('games.patate-chaude')
  const game = state.game
  const openIndex = game.openWord
  const last = game.words.length > 0 ? game.words[game.words.length - 1] : undefined
  const struck = last?.struck ? last : undefined
  const author = (id: string) => state.players.find((p) => p.id === id)
  // Un mot par ligne avec le nom de son auteur, le plus récent en haut (le mot contestable
  // d'abord) : huit lignes tiennent au-dessus de la consigne ; un reste coupé serait le plus ancien.
  const shown = game.words
    .map((said, index) => ({ said, index }))
    .slice(-TV_WORDS_SHOWN)
    .reverse()
  return (
    <div className="flex max-h-full min-h-0 flex-col gap-4 overflow-hidden rounded-3xl border-2 border-gold/20 bg-black/20 p-5">
      <p className="text-2xl font-black uppercase tracking-[0.2em] text-gold">{t('online.said')}</p>
      {game.words.length === 0 ? (
        <p className="text-2xl text-white/70">
          {t('online.saidEmpty', { name: author(game.holder)?.name ?? '' })}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-1 overflow-hidden">
          {shown.map(({ said, index }) => {
            const who = author(said.player)
            const open = index === openIndex && !said.struck
            return (
              <li
                key={`${index}-${said.word}`}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-2xl border-2 px-4 py-0.5',
                  said.struck
                    ? 'border-red-300/40 text-red-300'
                    : open
                      ? 'border-gold bg-gold/10 text-white'
                      : 'border-white/20 text-white/90'
                )}
              >
                <span className={cn('min-w-0 flex-1 break-words text-2xl font-bold', said.struck && 'line-through')}>
                  {said.word}
                </span>
                {/* Le nom en clair : tous les comptes démarrent avec la même icône. */}
                {who && (
                  <span className="flex shrink-0 items-center gap-2 text-xl font-semibold opacity-75">
                    <span aria-hidden className="shrink-0 leading-none">
                      <PlayerAvatarGlyph value={iconOf(who)} />
                    </span>
                    <span className="max-w-[8rem] truncate">{who.name}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {struck ? (
        <p className="rounded-2xl bg-suit-red px-4 py-3 text-xl font-semibold leading-snug text-cream">
          {t(soft ? 'soft.struck' : 'online.struck', {
            word: struck.word,
            name: author(struck.player)?.name ?? '',
            count: soft ? PC_PENALTY_POINTS : PC_PENALTY_SIPS,
          })}
        </p>
      ) : (
        state.contestThreshold !== null && (
          <p className="text-xl leading-snug text-white/80">
            {game.contests.length > 0
              ? t('online.contestCount', { count: game.contests.length, total: state.contestThreshold })
              : t('online.contestHint', { total: state.contestThreshold })}
          </p>
        )
      )}
    </div>
  )
}

function TvTableOrder({
  players,
  iconOf,
  title,
}: {
  players: PcOnlinePlayer[]
  iconOf: (p: PcOnlinePlayer) => string
  title: string
}) {
  return (
    <div className="flex max-h-full min-h-0 flex-col gap-3 overflow-hidden rounded-3xl border-2 border-gold/20 bg-black/20 p-5">
      <p className="text-2xl font-black uppercase tracking-[0.2em] text-gold">{title}</p>
      <ol className="flex min-h-0 flex-col gap-1.5">
        {players.map((p, i) => (
          <li key={p.id} className={cn('flex min-w-0 items-center gap-3 text-2xl font-bold text-white', p.leftAt && 'opacity-60')}>
            <span className="w-8 shrink-0 text-right tabular-nums text-gold/90">{i + 1}</span>
            <span aria-hidden className="shrink-0 leading-none">
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            <span className="min-w-0 truncate">{p.name}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function TvStandings({
  title,
  rows,
  players,
  iconOf,
  asideOf,
  showRank,
  tally,
  explosionsLabel,
  leftLabel,
  asideLabel,
  formatNumber,
}: {
  title: string
  /** En fin de partie, les lignes de pcEndStandings : un parti (`left`) n'a ni rang ni or. */
  rows: readonly (PcRankingEntry | PcEndRow)[]
  players: PcOnlinePlayer[]
  iconOf: (p: PcOnlinePlayer) => string
  /** Mis de côté pour inactivité (sauté par la bombe, toujours à la table). */
  asideOf: (p: PcOnlinePlayer) => boolean
  showRank: boolean
  tally: (row: PcRankingEntry) => string
  explosionsLabel: (count: number) => string
  leftLabel: string
  asideLabel: string
  formatNumber: (n: number) => string
}) {
  // Jusqu'à douze joueurs : rangées serrées au-delà de huit.
  const roomy = rows.length <= 8
  return (
    <div className="flex max-h-full min-h-0 flex-col gap-3 overflow-hidden rounded-3xl border-2 border-gold/20 bg-black/20 p-5">
      <p className="text-2xl font-black uppercase tracking-[0.2em] text-gold">{title}</p>
      <ol className={cn('flex min-h-0 flex-col', roomy ? 'gap-2' : 'gap-1')}>
        {rows.map((row) => {
          const player = players.find((p) => p.id === row.playerId)
          if (!player) return null
          const aside = asideOf(player)
          return (
            <li
              key={row.playerId}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl px-3 font-bold text-white',
                roomy ? 'py-1.5 text-2xl' : 'py-1 text-xl',
                showRank && row.won && 'bg-gold/[0.15] ring-2 ring-gold/60',
                (player.leftAt || aside) && 'opacity-60'
              )}
            >
              {showRank && (
                <span className="w-8 shrink-0 text-right tabular-nums text-gold">
                  {'left' in row && row.left ? '' : formatNumber(row.rank)}
                </span>
              )}
              <span aria-hidden className="shrink-0 leading-none">
                <PlayerAvatarGlyph value={iconOf(player)} />
              </span>
              <span className="min-w-0 flex-1 truncate">{player.name}</span>
              {player.leftAt && (
                <>
                  <WifiOff aria-hidden className="h-6 w-6 shrink-0 text-white/70" />
                  <span className="sr-only">{leftLabel}</span>
                </>
              )}
              {aside && (
                <>
                  <Moon aria-hidden className="h-6 w-6 shrink-0 text-white/70" />
                  <span className="sr-only">{asideLabel}</span>
                </>
              )}
              <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-white/90">
                <Bomb aria-hidden className="h-6 w-6 text-gold" />
                <span aria-hidden>{formatNumber(row.explosions)}</span>
                <span className="sr-only">{explosionsLabel(row.explosions)}</span>
              </span>
              <span className="w-[7.5rem] shrink-0 text-right tabular-nums text-gold">{tally(row)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
