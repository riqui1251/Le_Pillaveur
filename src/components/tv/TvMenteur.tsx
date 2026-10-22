"use client"

import { Beer, Dices, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { MenteurClientView } from '@/lib/menteur/engine'
import { menteurRevealReactions } from '@/lib/menteur/reveal-reactions'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { CssDie } from '@/components/games/CssDie'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { TV_FEED_SIZE, genreOf, genreOfId, playerIcon, speechFeedItems } from '@/components/online/bot-speech/bot-speech-feed'
import { BID_LADDER_TV, BidLadder, type LadderBid } from '@/components/online/menteur/BidLadder'
import { MenteurSpeechFeed } from '@/components/online/menteur/MenteurSpeechFeed'
import { cn } from '@/lib/utils'

/**
 * LE MENTEUR sur grand écran, dessiné pour la toile 80 × 39 rem : l'enchère
 * en cours en géant, l'échelle de la manche, les paroles des bots à côté, les
 * gobelets en bandeau (comptes de dés seulement : la vue spectateur n'ouvre
 * aucun gobelet hors révélation). À la révélation, les dés levés à gauche,
 * le perdant et les réactions à droite. Les téléphones restent les mains.
 */

/** Côté des dés en rem : chaque taille nommée de CssDie garde des points en px. */
const BID_DIE_REM = 5
const LADDER_DIE_REM = 2.25
const VERDICT_DIE_REM = 2.5
const REVEAL_DIE_REM = 2

/**
 * Le fil ne défile pas sur la TV : s'il dépasse sa colonne, il est calé en
 * bas et rogné en haut, les dernières bulles restent lisibles. Rogner le fil
 * plutôt que l'en-tête des paroles (les variantes de phrase suivent la
 * position de la bulle : le couper en amont changerait les phrases).
 */
const FEED_CLIP = 'flex min-h-0 shrink flex-col justify-end overflow-hidden'

/**
 * Largeurs estimées (rem) des puces de l'échelle TV : avatar, quantité, « × »,
 * dé, marges ; la marque « sans un seul » en ajoute (la plus longue langue).
 */
const CHIP_BASE_REM = 8.6
const CHIP_DIGIT_REM = 0.9
const CHIP_BLUFF_REM = 9.5
const CHIP_GAP_REM = 0.75
const ELLIPSIS_REM = 1.5
/** Hauteur d'une ligne de puces (dé de 2,25 rem, py-1.5, bordure). */
const CHIP_ROW_REM = 3.1

/**
 * Révélation, toile 80 × 39 rem : l'échelle court sous les deux colonnes, sur
 * toute la largeur (deux fois plus de puces par ligne que dans une colonne).
 */
const CANVAS_H_REM = 39
const REVEAL_LADDER_REM = 76
const REVEAL_SIDE_REM = 34
/** Largeur moyenne d'un caractère (rem) en text-4xl / text-3xl / text-2xl gras. */
const CHAR_4XL_REM = 1.25
const CHAR_3XL_REM = 1.05
const CHAR_2XL_REM = 0.85

/**
 * Combien des DERNIÈRES enchères tiennent sur `rows` lignes de `widthRem` :
 * la toile ne défile pas, une échelle plus longue serait coupée en bas. Rend
 * undefined quand toute la chaîne tient (aucun « … »).
 */
export function tvLadderLimit(bids: readonly LadderBid[], widthRem: number, rows: number): number | undefined {
  const chip = (b: LadderBid) => CHIP_BASE_REM + CHIP_DIGIT_REM * String(b.qty).length + (b.bluff ? CHIP_BLUFF_REM : 0)
  const rowsFor = (widths: number[]) => {
    let used = 1
    let line = 0
    for (const w of widths) {
      const next = line === 0 ? w : line + CHIP_GAP_REM + w
      if (next > widthRem && line > 0) {
        used += 1
        line = w
      } else {
        line = next
      }
    }
    return used
  }
  for (let n = bids.length; n >= 1; n -= 1) {
    const widths = bids.slice(bids.length - n).map(chip)
    if (n < bids.length) widths.unshift(ELLIPSIS_REM)
    if (rowsFor(widths) <= rows) return n === bids.length ? undefined : n
  }
  return 1
}

/** Les marques « sans un seul » des enchères que la limite fait tomber de l'échelle. */
export function hiddenBluffCount(bids: readonly LadderBid[], limit: number | undefined): number {
  if (limit === undefined) return 0
  return bids.slice(0, Math.max(0, bids.length - limit)).filter((b) => b.bluff).length
}

/**
 * Lignes d'échelle qui tiennent sous la révélation : tout le reste (en-tête,
 * bandeau, verdict, colonne la plus haute) est estimé en rem de la toile.
 */
export function tvRevealLadderRows(p: {
  diceRows: number
  banner: boolean
  verdictRem: number
  outcomeChars: number
  eliminatedChars: number
}): number {
  const lines = (rem: number, width: number) => Math.max(1, Math.ceil(rem / width))
  const verdict = 2 + 2.75 * lines(p.verdictRem, REVEAL_LADDER_REM)
  const dice = p.diceRows * 2 + Math.max(0, p.diceRows - 1) * 0.5
  const side =
    2.5 * lines(p.outcomeChars * CHAR_4XL_REM, REVEAL_SIDE_REM) +
    (p.eliminatedChars > 0 ? 1 + 2 * lines(p.eliminatedChars * CHAR_2XL_REM, REVEAL_SIDE_REM) : 0)
  // Marges, en-tête, bandeau, verdict, colonnes, titre de l'échelle et les écarts gap-4.
  const fixed = 2.5 + 2 + 1 + (p.banner ? 3.85 : 0) + verdict + 1 + Math.max(dice, side) + 1 + 2.25
  return Math.max(1, Math.floor((CANVAS_H_REM - fixed + CHIP_GAP_REM) / (CHIP_ROW_REM + CHIP_GAP_REM)))
}

export function TvMenteur({ room, state }: { room: TvRoomDto; state: MenteurClientView }) {
  const t = useTranslations('games.menteur.game')
  const tTv = useTranslations('tv')
  const { mode: ambiance } = useAmbianceMode()
  const soft = ambiance === 'soft'
  const totalDice = state.players.reduce((s, p) => s + p.diceCount, 0)
  const activeId = state.phase === 'bidding' ? state.players[state.turnIdx]?.id ?? null : null
  const activePlayer = state.players.find((p) => p.id === activeId)
  const reveal = state.lastReveal
  const bids = state.bids ?? []
  const duels = state.duels ?? []
  const lastDuel = state.phase === 'reveal' ? duels[duels.length - 1] : undefined
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const nameOf = (id: string | null | undefined) => state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) => playerIcon(p, room.members)
  const revealing = state.phase === 'reveal' && Boolean(reveal)
  // Mêmes bulles que le fil (paroles de la manche + réaction à la révélation) :
  // sans aucune, la colonne du fil laisse toute la largeur à l'enchère.
  const feedCount = speechFeedItems(
    [...(state.speech ?? []), ...menteurRevealReactions(state)],
    state.round,
    null,
    TV_FEED_SIZE
  ).length
  const speechFeed = <MenteurSpeechFeed view={state} iconOf={iconOf} variant="tv" />

  // ── Podium final ─────────────────────────────────────────────────────────
  if (state.phase === 'finished') {
    const ranking = [...state.players].sort((a, b) => {
      if (a.id === state.winnerId) return -1
      if (b.id === state.winnerId) return 1
      return a.lostCount - b.lostCount
    })
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8 py-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="flex items-center gap-4 text-6xl font-black text-gold">
            <Trophy aria-hidden className="h-14 w-14 shrink-0" />
            {t('victoryTitle', { name: nameOf(state.winnerId) })}
          </p>
          {!soft && <p className="text-2xl text-white/80">{t('victoryDrinks')}</p>}
        </div>
        <ol className="flex w-[52rem] max-w-full flex-col gap-3">
          {ranking.map((p, idx) => (
            <li
              key={p.id}
              className={cn(
                'flex items-center gap-4 rounded-2xl border px-6 py-2',
                p.id === state.winnerId ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-white/5'
              )}
            >
              <span className="w-10 shrink-0 text-center text-3xl font-black text-white/80">{idx + 1}</span>
              <span aria-hidden className="shrink-0 text-4xl leading-none">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className="min-w-0 flex-1 truncate text-3xl font-bold text-cream">{p.name}</span>
              {!soft && (
                <span className="flex shrink-0 items-center gap-2 text-2xl font-bold text-amber-200">
                  <Beer aria-hidden className="h-7 w-7 text-amber-300" /> {p.sipsTotal}
                </span>
              )}
            </li>
          ))}
        </ol>
        {rematch.total > 1 && rematch.count > 0 && (
          <p className="shrink-0 rounded-full border-2 border-gold/50 bg-gold/10 px-8 py-2 text-2xl font-bold text-gold">
            {tTv('rematchPending')} <span className="tabular-nums">{rematch.count}/{rematch.total}</span>
          </p>
        )}
      </div>
    )
  }

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-6 text-2xl font-bold text-white/80">
      <span className="shrink-0">{t('round', { n: state.round })}</span>
      {state.palifico ? (
        <span className="min-w-0 truncate rounded-full border border-chip-blue/50 bg-chip-blue/20 px-5 py-1 text-xl font-semibold text-sky-100">
          {state.currentBid ? t('palificoBadge', { face: state.currentBid.face }) : t('palificoBadgeOpen')}
        </span>
      ) : (
        <span className="min-w-0 truncate text-xl font-semibold text-white/75">{t('pillaveurHint')}</span>
      )}
      <span className="flex shrink-0 items-center gap-2">
        <Dices aria-hidden className="h-7 w-7" />
        {t('diceOnTable', { n: totalDice })}
      </span>
    </div>
  )

  const leftBanner = leftPlayer?.leftAt ? (
    <p className="shrink-0 truncate rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-1.5 text-center text-xl font-semibold text-amber-100">
      <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
        {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
      </PhaseCountdown>
    </p>
  ) : null

  // ── Révélation : les gobelets sont levés ─────────────────────────────────
  if (revealing && reveal) {
    const matches = (d: number) => d === reveal.bid.face || (!state.palifico && reveal.bid.face !== 1 && d === 1)
    const chain = lastDuel && lastDuel.round === state.round ? lastDuel.bids : []
    const verdict = reveal.bidHeld
      ? t('reveal.bidHeld', { count: reveal.matchCount, qty: reveal.bid.qty })
      : t('reveal.bidFailed', { count: reveal.matchCount, qty: reveal.bid.qty })
    const by = `· ${t('bidBy', { name: nameOf(reveal.bid.by) })}`
    const outcome =
      reveal.mode === 'calza' && reveal.loserId
        ? { lost: true, text: t(soft ? 'reveal.calzaLostSoft' : 'reveal.calzaLost', { name: nameOf(reveal.loserId), sips: reveal.sips }) }
        : reveal.mode === 'calza' && reveal.gainedId
          ? { lost: false, text: t('reveal.calzaWon', { name: nameOf(reveal.gainedId) }) }
          : reveal.mode === 'calza'
            ? { lost: false, text: t('reveal.calzaWonCapped', { name: nameOf(reveal.challengerId) }) }
            : { lost: true, text: t(soft ? 'reveal.loserSoft' : 'reveal.loser', { name: nameOf(reveal.loserId), sips: reveal.sips }) }
    const eliminated = reveal.eliminatedId
      ? t(soft ? 'reveal.eliminatedMsgSoft' : 'reveal.eliminatedMsg', {
          name: nameOf(reveal.eliminatedId),
          genre: genreOfId(state.players, reveal.eliminatedId),
        })
      : null
    const ladderRows = tvRevealLadderRows({
      diceRows: reveal.allDice.length,
      banner: Boolean(leftBanner),
      verdictRem: verdict.length * CHAR_4XL_REM + VERDICT_DIE_REM + 1 + by.length * CHAR_3XL_REM,
      outcomeChars: outcome.text.length,
      eliminatedChars: eliminated?.length ?? 0,
    })
    const ladderLimit = tvLadderLimit(chain, REVEAL_LADDER_REM, ladderRows)
    // Une échelle rognée ne doit pas effacer les bluffs démasqués que chaque téléphone montre.
    const hiddenBluffs = hiddenBluffCount(chain, ladderLimit)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 py-5">
        {header}
        {leftBanner}
        <div className="shrink-0 text-center">
          <p className="text-xl font-bold uppercase tracking-widest text-gold">{t('reveal.title')}</p>
          <p className="mt-1 text-4xl font-black text-cream">
            {verdict}{' '}
            <span className="inline-block align-middle">
              <CssDie face={reveal.bid.face} rem={VERDICT_DIE_REM} />
            </span>{' '}
            <span className="text-3xl font-bold text-white/80">{by}</span>
          </p>
        </div>

        <div className="flex min-h-0 flex-1 gap-8">
          <ul className="flex w-[40rem] shrink-0 flex-col justify-center gap-2">
            {reveal.allDice.map(({ playerId, dice }) => {
              const p = state.players.find((x) => x.id === playerId)
              return (
                <li key={playerId} className="flex items-center gap-3">
                  <span aria-hidden className="w-9 shrink-0 text-center text-3xl leading-none">
                    {p && <PlayerAvatarGlyph value={iconOf(p)} />}
                  </span>
                  <span
                    className={cn(
                      'w-[13rem] shrink-0 truncate text-2xl font-bold',
                      playerId === reveal.loserId ? 'text-red-300' : 'text-cream'
                    )}
                  >
                    {nameOf(playerId)}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    {dice.map((d, i) => (
                      <span key={i} className={cn('flex', !matches(d) && 'opacity-30')}>
                        <CssDie face={d} rem={REVEAL_DIE_REM} />
                      </span>
                    ))}
                  </span>
                  {!soft && p && p.sipsTotal > 0 && (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xl font-bold text-amber-200">
                      <Beer aria-hidden className="h-6 w-6 text-amber-300" /> {p.sipsTotal}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
            <p className={cn('text-4xl font-black', outcome.lost ? 'text-red-300' : 'text-emerald-200')}>{outcome.text}</p>
            {eliminated && <p className="text-2xl font-bold text-amber-200">{eliminated}</p>}
            {/* La réaction du bot se lit avec le résultat, comme sur les téléphones. */}
            <div className={FEED_CLIP}>{speechFeed}</div>
          </div>
        </div>

        {chain.length > 0 && (
          <div className="shrink-0 space-y-2">
            <p className="text-center text-lg font-semibold uppercase tracking-wide text-white/70">
              {t('bidsTitle')}
              {hiddenBluffs > 0 && <span className="text-red-300"> · {t('hiddenBluffs', { count: hiddenBluffs })}</span>}
            </p>
            <BidLadder
              bids={chain}
              players={state.players}
              iconOf={iconOf}
              variant="tv"
              dieRem={LADDER_DIE_REM}
              limit={ladderLimit}
            />
          </div>
        )}
      </div>
    )
  }

  // ── Enchères ─────────────────────────────────────────────────────────────
  const withFeed = feedCount > 0
  const players = state.players
  const stripCols = players.length >= 5 ? 3 : players.length
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 py-5">
      {header}
      {leftBanner}

      <div className="flex min-h-0 flex-1 items-center gap-8">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 text-center">
          {state.currentBid ? (
            <>
              <p className="max-w-full truncate text-2xl font-semibold uppercase tracking-widest text-white/70">
                {t('currentBid')} · {t('bidBy', { name: nameOf(state.currentBid.by) })}
              </p>
              <p className="flex items-center gap-6 text-7xl font-black tabular-nums text-cream">
                {state.currentBid.qty} <span className="text-white/70">×</span>
                <CssDie face={state.currentBid.face} rem={BID_DIE_REM} />
              </p>
              {bids.length > 1 && (
                <BidLadder
                  bids={bids}
                  players={players}
                  iconOf={iconOf}
                  variant="tv"
                  dieRem={LADDER_DIE_REM}
                  limit={Math.min(BID_LADDER_TV, tvLadderLimit(bids, withFeed ? 40 : 72, 2) ?? bids.length)}
                />
              )}
            </>
          ) : (
            <p className="text-5xl font-black text-white/80">{t('noBid')}</p>
          )}
          {activePlayer && (
            <p className="flex max-w-full items-center gap-4 text-4xl font-black text-orange-200">
              <span aria-hidden className="shrink-0 leading-none">
                <PlayerAvatarGlyph value={iconOf(activePlayer)} />
              </span>
              <span className="min-w-0 truncate">{t('turnOf', { name: activePlayer.name })}</span>
            </p>
          )}
        </div>

        {/* Le fil reste monté sans bulle (région aria-live née avant la 1re parole). */}
        <div className={withFeed ? 'flex w-[30rem] shrink-0 flex-col justify-center self-stretch' : 'hidden'}>
          <div className={FEED_CLIP}>{speechFeed}</div>
        </div>
      </div>

      <ul
        className="grid shrink-0 gap-3"
        style={{ gridTemplateColumns: `repeat(${stripCols}, minmax(0, 1fr))` }}
      >
        {players.map((p) => {
          const dead = p.diceCount === 0
          const active = p.id === activeId
          return (
            <li
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-2',
                active
                  ? 'border-orange-400/70 bg-orange-500/20'
                  : dead
                    ? 'border-white/10 bg-black/20'
                    : 'border-white/10 bg-white/5'
              )}
            >
              <span aria-hidden className={cn('shrink-0 text-3xl leading-none', dead && 'grayscale')}>
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-2xl font-bold',
                  active ? 'text-orange-100' : dead ? 'text-white/60' : 'text-cream'
                )}
              >
                {p.name}
              </span>
              {dead ? (
                <span className="shrink-0 text-xl font-bold text-red-300">{t('eliminated', { genre: genreOf(p) })}</span>
              ) : (
                <span className="flex shrink-0 items-center gap-3 text-2xl font-bold">
                  <span className="flex items-center gap-1.5 text-white/80">
                    <Dices aria-hidden className="h-6 w-6" /> {p.diceCount}
                  </span>
                  {!soft && p.sipsTotal > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-200">
                      <Beer aria-hidden className="h-6 w-6 text-amber-300" /> {p.sipsTotal}
                    </span>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
