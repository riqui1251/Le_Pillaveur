"use client"

import { useLocale, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Trophy, WifiOff } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { cn } from '@/lib/utils'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import {
  VDN_POINTS,
  VDN_SIPS,
  assignLanes,
  scaleFor,
  scalePosition,
  type VdnScale,
  type VdnTag,
} from '@/lib/vue-de-nez/engine'
import {
  VDN_ANSWER_MS,
  VDN_REVEAL_MS,
  vdnRankingBeforeReveal,
  type VdnClientView,
  type VdnOnlinePlayerView,
} from '@/lib/vue-de-nez/online-view'
import {
  TAG_TONE,
  VDN_ALL_SHOWN,
  useNumberFormats,
  useOnlineRevealBeat,
} from '@/app/[locale]/games/vue-de-nez/components/vdn-ui'
import { TvTimeBar } from './tv-shared'

/**
 * À VUE DE NEZ sur grand écran : la question en très grand et qui a déjà
 * répondu (jamais QUOI : la vue TV n'a que `hasAnswered`), puis la règle
 * graduée de la révélation, la réponse, sa source et les verdicts — gorgées
 * ou points selon l'ambiance de la TV. Toile 80 × 45 rem, dont ≈ 38,5 sous
 * l'en-tête (QR compris), jusqu'à 16 joueurs : la colonne des joueurs prend
 * toute cette hauteur, la barre du haut ne vit que dans la colonne de gauche.
 */

// Règle de la TV : en rem (l'écran TV met le rem à l'échelle de la télé).
/** Une rangée de marqueurs : étiquette text-xl (1,75 rem) sur jeton h-9 (2,25 rem). */
const LANE_REM = 4
const STEM_REM = 1
/** Sous l'axe : bornes de la règle et drapeau de la réponse. */
const BELOW_REM = 5
/** Écart minimal (fraction de la règle) entre deux marqueurs d'une même rangée. */
const MIN_GAP = 0.08
/** Trois rangées tiennent sous l'énoncé ; deux quand le bandeau d'un absent prend une ligne. */
const MAX_LANES = 3
const MAX_LANES_WITH_BANNER = 2
const EDGE_LABEL_ROOM = 0.1

const TONE_TEXT = { win: 'text-gold', lose: 'text-red-300', none: 'text-white/90' } as const
const TONE_RING = { win: 'ring-4 ring-gold', lose: 'ring-4 ring-red-300', none: 'ring-2 ring-white/40' } as const

/** Énoncés de 40 à 200 caractères sur ~45 rem de large. */
function questionSize(length: number): string {
  if (length <= 50) return 'text-6xl'
  if (length <= 90) return 'text-5xl'
  if (length <= 140) return 'text-4xl'
  return 'text-3xl'
}

/**
 * Hauteur laissée à la liste de la colonne de droite : ≈ 38,6 rem sous
 * l'en-tête, moins py-4, le titre, et la note d'une révélation sur deux
 * lignes. Le rendu côté serveur ne mesure rien : `rowRem`/`gapRem` doublent
 * les classes `h-*`/`gap-*` pour le test de budget.
 */
export const VDN_TV_LIST_BUDGET_REM = 30

export function vdnTvRowTier(count: number) {
  if (count <= 6) return { rowRem: 3.5, gapRem: 0.5, list: 'gap-2', row: 'h-14 gap-3 rounded-2xl px-4 text-2xl' }
  if (count <= 10) return { rowRem: 2.5, gapRem: 0.25, list: 'gap-1', row: 'h-10 gap-2 rounded-xl px-3 text-xl' }
  return { rowRem: 1.75, gapRem: 0.125, list: 'gap-0.5', row: 'h-7 gap-2 rounded-lg px-3 text-xl leading-none' }
}

/**
 * Fin de partie (≈ 39,6 rem sous l'en-tête sans QR) : une colonne et le
 * trophée jusqu'à 6 joueurs, deux colonnes sans trophée au-delà ; lignes de
 * `rowRem` espacées de `gapRem`, comme vdnTvRowTier.
 */
export const VDN_TV_END_BUDGET_REM = 37.5

export function vdnTvEndLayout(count: number) {
  const twoColumns = count > 6
  return {
    twoColumns,
    trophy: !twoColumns,
    rows: twoColumns ? Math.ceil(count / 2) : count,
    rowRem: 2.75,
    gapRem: 0.375,
    /** Trophée + écart, titre sur une ligne, sous-titre, pastille de revanche, et les écarts de la colonne. */
    chromeRem: (twoColumns ? 0 : 3.5 + 0.75) + 3.75 + 0.75 + 2 + 0.75 + 0.75 + 3.25,
  }
}

type TvMarker = { id: string; value: number; label: string; glyph: string; tone: 'win' | 'lose' | null }

function TvRuler({
  scale,
  markers,
  shownCount,
  answer,
  startLabel,
  endLabel,
  maxLanes,
  reduceMotion,
}: {
  scale: VdnScale
  markers: TvMarker[]
  shownCount: number
  answer: { value: number; label: string } | null
  startLabel: string
  endLabel: string
  maxLanes: number
  reduceMotion: boolean
}) {
  const positions = markers.map((m) => scalePosition(scale, m.value))
  const lanes = assignLanes(positions, MIN_GAP, maxLanes)
  const laneCount = lanes.reduce((max, lane) => Math.max(max, lane + 1), 1)
  const axisTop = laneCount * LANE_REM + STEM_REM
  const height = axisTop + BELOW_REM
  const answerX = answer ? scalePosition(scale, answer.value) : 0
  // Près d'un bord, l'étiquette de la réponse se décale vers l'intérieur ; la hampe reste juste.
  const answerShift = answerX < 0.12 ? 12 : answerX > 0.88 ? 88 : 50
  return (
    <div aria-hidden className="relative mx-16 shrink-0" style={{ height: `${height}rem` }}>
      <div className="absolute inset-x-0 h-1 rounded-full bg-white/40" style={{ top: `${axisTop - 0.125}rem` }} />
      {scale.ticks.map((tick) => (
        <span
          key={tick}
          className="absolute h-4 w-0.5 -translate-x-1/2 bg-white/50"
          style={{ left: `${scalePosition(scale, tick) * 100}%`, top: `${axisTop - 0.5}rem` }}
        />
      ))}
      {(!answer || answerX >= EDGE_LABEL_ROOM) && (
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-2xl tabular-nums text-white/70"
          style={{ left: 0, top: `${axisTop + 0.5}rem` }}
        >
          {startLabel}
        </span>
      )}
      {(!answer || answerX <= 1 - EDGE_LABEL_ROOM) && (
        <span
          className="absolute translate-x-1/2 whitespace-nowrap text-2xl tabular-nums text-white/70"
          style={{ right: 0, top: `${axisTop + 0.5}rem` }}
        >
          {endLabel}
        </span>
      )}
      {markers.map((marker, i) => {
        if (i >= shownCount) return null
        const tone = answer ? (marker.tone ?? 'none') : 'none'
        return (
          <div
            key={marker.id}
            className="absolute -translate-x-1/2"
            style={{ left: `${positions[i] * 100}%`, bottom: `${height - axisTop}rem` }}
          >
            <motion.div
              className="flex flex-col items-center"
              initial={reduceMotion ? false : { opacity: 0, y: -24, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              <span className={cn('whitespace-nowrap text-xl font-black tabular-nums', TONE_TEXT[tone])}>{marker.label}</span>
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full bg-felt-deep text-xl leading-none',
                  TONE_RING[tone]
                )}
              >
                <PlayerAvatarGlyph value={marker.glyph} />
              </span>
              <span className="w-0.5 bg-white/60" style={{ height: `${STEM_REM - 0.25 + lanes[i] * LANE_REM}rem` }} />
            </motion.div>
          </div>
        )
      })}
      {answer && (
        <div className="absolute" style={{ left: `${answerX * 100}%`, top: `${axisTop}rem` }}>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          >
            <span className="absolute left-0 top-0 h-8 w-1 -translate-x-1/2 bg-gold" />
            <span
              className="absolute top-8 whitespace-nowrap rounded-xl bg-gold px-4 py-0.5 font-display text-3xl font-black tabular-nums text-[#24201A] shadow-[0_0.5rem_1rem_-0.5rem_rgba(0,0,0,0.7)]"
              style={{ transform: `translateX(-${answerShift}%)` }}
            >
              {answer.label}
            </span>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export function TvVueDeNez({ room, state }: { room: TvRoomDto; state: VdnClientView }) {
  const t = useTranslations('games.vue-de-nez')
  const tTv = useTranslations('tv')
  const formats = useNumberFormats(useLocale())
  const reduceMotion = useReducedMotion() ?? false
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'
  const beat = useOnlineRevealBeat({
    phaseKey: state.phaseKey,
    phase: state.phase,
    count: state.reveal?.results.length ?? 0,
    reduceMotion,
  })

  const playerOf = (id: string) => state.players.find((p) => p.id === id)
  const nameOf = (id: string) => playerOf(id)?.name ?? '—'
  const iconOf = (p: VdnOnlinePlayerView) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const glyphOf = (id: string) => {
    const p = playerOf(id)
    return p ? iconOf(p) : '👤'
  }
  const verdictFor = (tag: VdnTag) =>
    soft
      ? t(`soft.verdict.${tag}`, { count: Math.abs(VDN_POINTS[tag]) })
      : t(`verdict.${tag}`, { count: VDN_SIPS[tag] })

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (state.phase === 'finished') {
    const winners = state.ranking.filter((row) => row.won)
    const title =
      winners.length === 1
        ? t('end.winner', { name: nameOf(winners[0].playerId) })
        : winners.length > 1
          ? t('end.tie', { names: winners.map((row) => nameOf(row.playerId)).join(', ') })
          : t('end.noWinner')
    // Même quorum que les téléphones : les bots et les absents ne votent jamais la revanche.
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    const layout = vdnTvEndLayout(state.ranking.length)
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 px-12 py-4 text-center">
        {layout.trophy && <Trophy aria-hidden className="h-14 w-14 shrink-0 text-gold" />}
        <p className="line-clamp-1 w-full shrink-0 font-display text-5xl font-bold leading-tight text-gold">{title}</p>
        <p className="shrink-0 text-2xl text-white/80">{t('end.subtitle', { count: state.questionCount })}</p>
        <ol
          className={cn(
            'grid min-h-0 w-full max-w-[64rem] gap-x-4 gap-y-1.5 overflow-hidden',
            layout.twoColumns ? 'grid-flow-col grid-cols-2' : 'grid-cols-1'
          )}
          style={layout.twoColumns ? { gridTemplateRows: `repeat(${layout.rows}, minmax(0, auto))` } : undefined}
        >
          {state.ranking.map((row) => (
            <li
              key={row.playerId}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border-2 px-4 py-1 text-left text-2xl',
                row.won ? 'border-gold bg-gold/[0.15]' : 'border-white/10 bg-black/20'
              )}
            >
              <span className="w-10 shrink-0 text-center font-display font-black tabular-nums text-gold">{row.rank}</span>
              <span aria-hidden className="shrink-0 leading-none">
                <PlayerAvatarGlyph value={glyphOf(row.playerId)} />
              </span>
              <span className="min-w-0 flex-1 truncate font-bold text-white">{nameOf(row.playerId)}</span>
              <span className="shrink-0 font-display font-black tabular-nums text-gold">
                {t('end.points', { count: row.score, score: formats.full(row.score) })}
              </span>
            </li>
          ))}
        </ol>
        {rematch.total > 1 && rematch.count > 0 && (
          <p className="shrink-0 rounded-full border-2 border-gold/50 bg-gold/10 px-8 py-2 text-2xl font-bold text-gold">
            {tTv('rematchPending')} {rematch.count}/{rematch.total}
          </p>
        )}
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const question = state.question
  const isAnswering = state.phase === 'answering'
  const active = state.players.filter((p) => !p.leftAt)
  const answeredCount = active.filter((p) => p.hasAnswered).length
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const revealed = state.phase === 'reveal' ? state.reveal : null
  const results = revealed?.results ?? []
  const revealDone = beat === VDN_ALL_SHOWN
  const tier = vdnTvRowTier(state.players.length)

  const topBar = (
    <div className="flex shrink-0 items-center gap-5">
      <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-5 py-1 text-2xl font-black tabular-nums text-white">
        {t('game.progress', { current: state.questionNumber, total: state.questionCount })}
      </span>
      {state.phaseEndsAt !== null ? (
        <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
          {({ leftMs, seconds }) => (
            <>
              <TvTimeBar
                timeLeftMs={leftMs}
                totalMs={isAnswering ? VDN_ANSWER_MS : VDN_REVEAL_MS}
                dangerMs={isAnswering ? 10_000 : 5_000}
                colorClass="bg-gold"
                dangerClass="bg-red-400"
              />
              {isAnswering && (
                <span
                  className={cn(
                    'w-16 shrink-0 text-right text-4xl font-black tabular-nums',
                    leftMs < 10_000 ? 'text-red-300' : 'text-white'
                  )}
                >
                  {seconds}
                </span>
              )}
            </>
          )}
        </PhaseCountdown>
      ) : (
        <span className="flex-1" />
      )}
      {!isAnswering && (
        <span className="shrink-0 font-display text-3xl font-bold uppercase tracking-widest text-gold">{t('online.phaseReveal')}</span>
      )}
    </div>
  )

  const leftBanner = leftPlayer?.leftAt ? (
    <p className="shrink-0 truncate rounded-2xl border-2 border-amber-300/50 bg-amber-500/10 px-6 py-1 text-center text-xl font-semibold text-amber-100">
      <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
        {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
      </PhaseCountdown>
    </p>
  ) : null

  // Colonne de droite, sur toute la hauteur : le classement pendant la
  // question et la pose de la règle, les estimations une fois la réponse
  // tombée. `overflow-hidden` : au pire une ligne se coupe dans la colonne,
  // jamais sous l'écran.
  const listClass = cn('flex min-h-0 flex-col overflow-hidden', tier.list)
  // Pendant la pose, la vue porte déjà les points de la question : la colonne
  // garde le classement d'avant tant que la réponse n'est pas tombée.
  const standingRows = revealed && !revealDone ? vdnRankingBeforeReveal(state) : state.ranking
  const standings = (
    <aside className="flex min-h-0 w-96 shrink-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="text-xl font-semibold uppercase tracking-[0.25em] text-gold/90">{tTv('standings')}</p>
        {isAnswering && (
          <span className="flex shrink-0 items-center gap-1.5 text-2xl font-black tabular-nums text-emerald-200">
            <Check aria-hidden className="h-7 w-7" strokeWidth={3} />
            {answeredCount}/{active.length}
          </span>
        )}
      </div>
      <ol className={listClass}>
        {standingRows.map((row) => {
          const p = playerOf(row.playerId)
          const away = Boolean(p?.leftAt)
          return (
            <li
              key={row.playerId}
              className={cn('flex shrink-0 items-center border-2 border-white/10 bg-black/20', tier.row, away && 'opacity-50')}
            >
              <span className="w-8 shrink-0 text-center font-black tabular-nums text-gold">{row.rank}</span>
              <span aria-hidden className="shrink-0 leading-none">
                <PlayerAvatarGlyph value={glyphOf(row.playerId)} />
              </span>
              <span className="min-w-0 flex-1 truncate font-bold text-white">{nameOf(row.playerId)}</span>
              <span className="shrink-0 font-black tabular-nums text-gold">{formats.full(row.score)}</span>
              {away ? (
                <WifiOff aria-hidden className="h-6 w-6 shrink-0 text-white/70" />
              ) : isAnswering && p?.hasAnswered ? (
                <Check aria-hidden className="h-6 w-6 shrink-0 text-emerald-300" strokeWidth={3} />
              ) : (
                <span className="w-6 shrink-0" />
              )}
            </li>
          )
        })}
      </ol>
    </aside>
  )

  if (isAnswering || !revealed) {
    return (
      <div className="flex h-full min-h-0 w-full gap-6 px-8 py-4">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          {topBar}
          {leftBanner}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
            {question && (
              <div className="rounded-3xl border-2 border-[#D8CCAE] bg-cream px-10 py-7 text-[#24201A] shadow-[0_0.875rem_1.875rem_-0.875rem_rgba(0,0,0,0.8)]">
                <p className="mb-3 text-xl font-bold uppercase tracking-widest text-rose-800">{t(`themes.${question.theme}`)}</p>
                <p className={cn('font-display font-bold', questionSize(question.text.length), 'leading-tight')}>{question.text}</p>
                {question.unit && <p className="mt-4 text-3xl font-semibold text-[#6B6455]">{t('tv.unit', { unit: question.unit })}</p>}
              </div>
            )}
            <p className="text-center text-3xl font-bold text-white/80">{tTv('answerOnPhone')}</p>
          </div>
        </section>
        {standings}
      </div>
    )
  }

  const markers: TvMarker[] = state.players.flatMap((p) => {
    const row = results.find((r) => r.playerId === p.id)
    return row
      ? [{ id: p.id, value: row.estimate, label: formats.short(row.estimate), glyph: iconOf(p), tone: row.tag ? TAG_TONE[row.tag] : null }]
      : []
  })
  const scale = scaleFor(revealed.answer, results.map((r) => r.estimate))
  const silent = state.players.filter((p) => !results.some((r) => r.playerId === p.id))
  const allEqual = results.length > 1 && results.every((r) => r.tag === null)
  const note =
    results.length === 0
      ? t('online.nobodyAnswered')
      : results.length === 1
        ? t('online.singleAnswer')
        : allEqual
          ? t(soft ? 'soft.verdict.allEqual' : 'verdict.allEqual')
          : null

  return (
    <div className="flex h-full min-h-0 w-full gap-6 px-8 py-4">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        {topBar}
        {leftBanner}
        {question && <p className="line-clamp-2 shrink-0 font-display text-2xl font-bold leading-tight text-cream">{question.text}</p>}
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <TvRuler
            scale={scale}
            markers={markers}
            shownCount={beat}
            answer={revealDone ? { value: revealed.answer, label: formats.short(revealed.answer) } : null}
            startLabel={formats.short(scale.min)}
            endLabel={formats.short(scale.max)}
            maxLanes={leftBanner ? MAX_LANES_WITH_BANNER : MAX_LANES}
            reduceMotion={reduceMotion}
          />
          {scale.kind === 'log' && <p className="mr-16 shrink-0 text-right text-xl text-white/70">{t('game.reveal.logScale')}</p>}
        </div>
        <div className="flex h-28 shrink-0 items-center justify-center gap-8 rounded-3xl border-2 border-gold/50 bg-gold/10 px-8">
          {revealDone && (
            <>
              <div className="shrink-0 text-center">
                <p className="text-xl font-semibold uppercase tracking-[0.25em] text-gold/90">{t('game.reveal.answer')}</p>
                <p className="font-display text-5xl font-black leading-tight tabular-nums text-gold">
                  {formats.full(revealed.answer)}
                  {question?.unit ? <span className="ml-3 font-sans text-3xl font-bold text-cream">{question.unit}</span> : null}
                </p>
              </div>
              <p className="line-clamp-3 min-w-0 text-2xl leading-snug text-white/80">
                {t('game.reveal.source', { source: revealed.source })}
              </p>
            </>
          )}
        </div>
      </section>
      {revealDone ? (
        <aside className="flex min-h-0 w-96 shrink-0 flex-col gap-2">
          <p className="shrink-0 text-xl font-semibold uppercase tracking-[0.25em] text-gold/90">{t('tv.estimates')}</p>
          <ol className={listClass}>
            {results.map((row) => {
              const tone = row.tag ? TAG_TONE[row.tag] : null
              return (
                <li
                  key={row.playerId}
                  className={cn(
                    'flex shrink-0 items-center border-2',
                    tier.row,
                    tone === 'win' ? 'border-gold bg-gold/[0.15]' : tone === 'lose' ? 'border-red-300/60 bg-red-500/10' : 'border-white/10 bg-black/20'
                  )}
                >
                  <span aria-hidden className="shrink-0 leading-none">
                    <PlayerAvatarGlyph value={glyphOf(row.playerId)} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold text-white">{nameOf(row.playerId)}</span>
                  {row.tag ? (
                    <span className={cn('shrink-0 font-black', tone === 'win' ? 'text-gold' : 'text-red-300')}>{verdictFor(row.tag)}</span>
                  ) : (
                    <span className="shrink-0 font-bold tabular-nums text-white/80">{formats.short(row.estimate)}</span>
                  )}
                </li>
              )
            })}
            {silent.map((p) => (
              <li key={p.id} className={cn('flex shrink-0 items-center border-2 border-white/10 bg-black/20 opacity-60', tier.row)}>
                <span aria-hidden className="shrink-0 leading-none">
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-white">{p.name}</span>
                <span className="shrink-0 text-white/80">{t('online.noAnswer')}</span>
              </li>
            ))}
          </ol>
          {note && <p className="shrink-0 text-xl font-semibold text-white/80">{note}</p>}
        </aside>
      ) : (
        standings
      )}
    </div>
  )
}
