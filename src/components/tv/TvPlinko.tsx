"use client"

import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { PlinkoCastState, PlinkoCastFrame, PlinkoCastLive, PlinkoCastLiveBall } from '@/lib/cast-types'
import { SPECIAL_PIN_COLORS, type SpecialPinType } from '@/lib/plinko-pins'
import { cn } from '@/lib/utils'
import { JACKPOT_VALUE, previewSlotValues } from '@/app/[locale]/games/plinko/plinko-scoring'
import { ballsInCategory, modifierSummary, type ModifierToken } from '@/app/[locale]/games/plinko/plinko-live'
import { TvAvatar } from './tv-shared'

const SLOT_COUNT = 10
const DISPLAY_CAP = 999
const CHIPS_PER_SEGMENT = 3
const CHIPS_WITH_SUMMARY = 2

type Category = 'red' | 'green'
type Hit = PlinkoCastLiveBall['hits'][number]
type ScoreRow = PlinkoCastState['scoreboard'][number]

const BALL_RGB = { red: '239,68,68', green: '34,197,94' } as const

function usePlinkoText() {
  const t = useTranslations('games.plinko')
  const pinLabel = (type: SpecialPinType) => t(`pinLabels.${type}`)
  const categoryLabel = (category: Category) => (category === 'red' ? t('game.drinks') : t('game.gives'))
  const shortLabel = (hit: Hit) => {
    const nothing = (hit.type === 'mystery' && !hit.resolved) || hit.inert
    if (nothing) return t('game.live.nothing')
    const shown = hit.type === 'mystery' && hit.resolved ? hit.resolved : hit.type
    return t(`game.live.short.${shown}`)
  }
  const formatModifier = (token: ModifierToken): string => {
    switch (token.kind) {
      case 'cancelled': return t('game.live.cancelled')
      case 'jackpot': return t('game.live.jackpot', { value: token.value })
      case 'multiplier': return `×${token.factor}`
      case 'add': return `+${token.n}`
      case 'subtract': return `−${token.n}`
      case 'swapped': return `🔄 ${t('game.live.swapped')}`
    }
  }
  return { t, pinLabel, categoryLabel, shortLabel, formatModifier }
}

function currentIndexOf(state: PlinkoCastState): number {
  if (typeof state.currentPlayerIndex === 'number') return state.currentPlayerIndex
  return state.scoreboard.findIndex((p) => p.name === state.currentPlayerName)
}

function hasPlayed(row: ScoreRow): boolean {
  return row.turns ? row.turns.length > 0 : row.totalRed + row.totalGreen > 0
}

/**
 * Rendu TV du cast Plinko : le plateau du téléphone (mêmes positions %) avec les
 * billes en direct, et à droite ce que le téléphone montre à toute la table —
 * joueur au tour, effets touchés par chaque balle, résultat, joueurs. En fin de
 * partie, la TV suit l'écran de résultats du téléphone (tournées → détail → totaux).
 */
export function TvPlinko({ state, frame }: { state: PlinkoCastState; frame: PlinkoCastFrame | null }) {
  if (state.phase === 'finished') return <PlinkoResults state={state} />
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-3">
      <div className="flex h-full max-h-[40rem] w-full min-w-0 gap-8">
        <PlinkoBoard state={state} frame={frame} />
        <PlinkoSidePanel state={state} />
      </div>
    </div>
  )
}

function PlinkoBoard({ state, frame }: { state: PlinkoCastState; frame: PlinkoCastFrame | null }) {
  const live = state.live ?? null
  const cumulative = !!state.cumulative
  const slots = state.board.slots
  const redPreview = live ? previewSlotValues(slots, live.red.effects, cumulative) : []
  const greenPreview = live ? previewSlotValues(slots, live.green.effects, cumulative) : []
  const redSlot = live ? (live.red.landed ? live.red.slot : null) : (state.lastDrop?.redSlot ?? null)
  const greenSlot = live ? (live.green.landed ? live.green.slot : null) : (state.lastDrop?.greenSlot ?? null)
  // Téléphone sans `extraSlot` : à défaut de l'ordre d'arrivée, la dernière balle bonus créée qui est arrivée.
  const extraSlot =
    state.extraSlot !== undefined
      ? state.extraSlot
      : (live?.extras.filter((b) => b.landed && b.slot !== null).slice(-1)[0]?.slot ?? null)

  return (
    <div className="relative h-full shrink-0 overflow-hidden rounded-3xl border-2 border-gold/20 bg-felt-deep" style={{ aspectRatio: '17 / 20' }}>
      {state.board.normalPins.map((p, i) => (
        <div
          key={`n${i}`}
          className="absolute h-3 w-3 rounded-full bg-cream/40"
          style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)' }}
        />
      ))}

      {state.board.specialPins.map((p, i) => {
        const c = SPECIAL_PIN_COLORS[p.type]
        return (
          <div
            key={`s${i}`}
            className={cn('absolute z-10 flex h-9 w-9 items-center justify-center rounded-full border-2', c?.border, c?.bg)}
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            <span className="text-lg font-black leading-none text-black/80">{c?.glyph}</span>
          </div>
        )
      })}

      <div className="absolute bottom-0 flex w-full">
        {slots.map((v, i) => {
          const isRed = redSlot === i
          const isGreen = greenSlot === i
          const isExtra = extraSlot === i
          return (
            <div
              key={i}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 border-x border-t border-gold/20 px-0.5 transition-colors duration-200',
                isRed && isGreen
                  ? 'bg-gradient-to-r from-suit-red/60 to-emerald-700/60'
                  : isRed
                    ? 'bg-suit-red/60'
                    : isGreen
                      ? 'bg-emerald-700/60'
                      : isExtra
                        ? 'bg-gold/40'
                        : 'bg-black/30',
              )}
              style={{ width: `${100 / SLOT_COUNT}%` }}
            >
              {live ? (
                <LiveSlotChips live={live} slot={i} base={v} redValue={redPreview[i] ?? v} greenValue={greenPreview[i] ?? v} />
              ) : (
                <span className={cn('text-2xl font-black', isRed || isGreen ? 'text-cream' : 'text-cream/80')}>{v}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Billes : transition CSS pour lisser les trames (~12/s). */}
      {state.phase === 'dropping' &&
        frame?.balls.map((b, i) => (
          <div
            key={i}
            className="absolute z-20 h-5 w-5 rounded-full"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              transform: 'translate(-50%,-50%)',
              backgroundColor: `rgb(${BALL_RGB[b.color]})`,
              boxShadow: `0 0 0.875rem rgba(${BALL_RGB[b.color]},0.8)`,
              transition: 'left 90ms linear, top 90ms linear',
            }}
          />
        ))}
    </div>
  )
}

/** Même logique que `LiveSlotValues` du téléphone : valeur finale de chaque balle principale si elle tombait là. */
function LiveSlotChips({ live, slot, base, redValue, greenValue }: { live: PlinkoCastLive; slot: number; base: number; redValue: number; greenValue: number }) {
  const entries = [live.red, live.green]
    .sort((a, b) => (a.category === b.category ? 0 : a.category === 'red' ? -1 : 1))
    .map((ball) => {
      const faded = ball.landed && ball.slot !== slot
      const atLanding = ball.landed && !faded
      const projected = ball.id === 'red' ? redValue : greenValue
      const value = atLanding ? (ball.finalSips ?? projected) : projected
      const differs = atLanding ? value !== (ball.landedBase ?? base) : value !== base
      return { ball, faded, atLanding, value, differs }
    })
  return (
    <>
      {entries.map(({ ball, faded, atLanding, value, differs }) => (
        <span
          key={ball.id}
          className={cn(
            'flex h-6 w-full max-w-[2.75rem] items-center justify-center rounded-md border-2 text-lg font-black leading-none tabular-nums text-cream transition-opacity duration-300',
            ball.category === 'red' ? 'bg-suit-red' : 'bg-emerald-700',
            ball.category !== ball.id ? 'border-dashed border-cream/80' : 'border-transparent',
            faded && 'opacity-0',
            differs && 'ring-2 ring-gold',
            atLanding && (differs ? 'scale-110 ring-2 ring-gold' : 'scale-110 ring-2 ring-cream/80'),
          )}
        >
          {value > DISPLAY_CAP ? `${DISPLAY_CAP}+` : value}
        </span>
      ))}
    </>
  )
}

function PlinkoSidePanel({ state }: { state: PlinkoCastState }) {
  const { t, categoryLabel } = usePlinkoText()
  const tv = useTranslations('tv')
  const n = state.scoreboard.length
  const currentIndex = currentIndexOf(state)
  const current = state.scoreboard[currentIndex]
  const isResult = state.phase === 'result' && !!state.lastDrop
  const live = state.live ?? null
  // Au résultat, l'index du téléphone a déjà avancé : le joueur « au tour » est celui qui suit.
  const nextIndex = isResult ? currentIndex : currentIndex + 1
  const next = nextIndex >= 0 && nextIndex < n ? state.scoreboard[nextIndex] : null
  const playedIndex = isResult
    ? typeof state.currentPlayerIndex === 'number'
      ? state.currentPlayerIndex - 1
      : state.scoreboard.findIndex((p) => p.name === state.lastDrop?.playerName)
    : -1

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {isResult && state.lastDrop ? (
        <div className="flex min-w-0 shrink-0 flex-col gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <TvAvatar name={state.lastDrop.playerName} index={Math.max(0, playedIndex)} size={64} />
            <p className="min-w-0 flex-1 truncate text-5xl font-black leading-tight">{state.lastDrop.playerName}</p>
            {next && <NextUp name={next.name} index={nextIndex} label={t('game.nextUp')} className="max-w-[18rem] shrink-0" />}
          </div>
          {/* Une seule ligne : un retour à la ligne (tournée, « Distribuisce »…) pousserait la grille des joueurs hors de la toile. */}
          <motion.div
            key={JSON.stringify(state.lastDrop)}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex min-w-0 flex-nowrap items-center gap-3"
          >
            <ResultSips category="red" value={state.lastDrop.redSips} />
            <ResultSips category="green" value={state.lastDrop.greenSips} />
            {state.roundDrinks > 0 && <RoundDrinksBadge count={state.roundDrinks} />}
          </motion.div>
        </div>
      ) : (
        <div className="flex min-w-0 shrink-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-5">
            <TvAvatar name={state.currentPlayerName ?? '?'} index={Math.max(0, currentIndex)} size={80} active />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-4 text-lg font-semibold uppercase tracking-[0.25em] text-gold/90">
                {tv('turnOf')}
                {state.phase === 'dropping' && <span className="normal-case tracking-normal text-gold">{t('game.inGame')}</span>}
              </p>
              <p className="truncate text-6xl font-black leading-tight">{current?.name ?? state.currentPlayerName ?? '—'}</p>
            </div>
            {state.roundDrinks > 0 && <RoundDrinksBadge count={state.roundDrinks} />}
          </div>
          {state.phase !== 'dropping' && next && <NextUp name={next.name} index={nextIndex} label={t('game.nextUp')} />}
        </div>
      )}

      {live && (
        // Colonne des libellés à la largeur du plus long (« Distribuisce » en italien), les deux rangées restent alignées.
        <div
          role="group"
          aria-label={t('game.live.effectsLabel')}
          className="grid shrink-0 items-start gap-x-4 gap-y-3 rounded-3xl border-2 border-gold/20 bg-black/25 px-5 py-3"
          style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}
        >
          {(['red', 'green'] as const).map((category) => (
            <LiveCategoryRow
              key={category}
              live={live}
              category={category}
              label={categoryLabel(category)}
              cumulative={!!state.cumulative}
              maxSegments={n > 12 ? 1 : 2}
            />
          ))}
        </div>
      )}

      <Scoreboard rows={state.scoreboard} currentIndex={currentIndex} withLive={!!live} />
    </div>
  )
}

function NextUp({ name, index, label, className }: { name: string; index: number; label: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3 text-2xl', className)}>
      <span className="shrink-0 font-semibold uppercase tracking-[0.2em] text-gold/90">{label}</span>
      <TvAvatar name={name} index={index} size={36} />
      <span className="min-w-0 truncate font-bold text-white/90">{name}</span>
    </div>
  )
}

function ResultSips({ category, value }: { category: Category; value: number }) {
  const { categoryLabel } = usePlinkoText()
  const red = category === 'red'
  return (
    <span
      className={cn(
        'flex min-w-0 items-baseline gap-3 whitespace-nowrap rounded-2xl px-5 py-1 font-black',
        red ? 'bg-suit-red/40 text-red-300' : 'bg-emerald-700/50 text-emerald-300',
      )}
    >
      <span className="min-w-0 truncate text-2xl">{categoryLabel(category)}</span>
      <span className="shrink-0 text-4xl tabular-nums">{value} 🍺</span>
    </span>
  )
}

function RoundDrinksBadge({ count }: { count: number }) {
  const { t } = usePlinkoText()
  return (
    <span
      title={t('game.roundDrinksShort')}
      className="shrink-0 whitespace-nowrap rounded-2xl border-2 border-gold/40 bg-gold/10 px-4 py-0.5 text-3xl font-black text-gold"
    >
      🥂 ×{count}
    </span>
  )
}

function LiveCategoryRow({ live, category, label, cumulative, maxSegments }: {
  live: PlinkoCastLive
  category: Category
  label: string
  cumulative: boolean
  maxSegments: number
}) {
  const { t } = usePlinkoText()
  const segments = ballsInCategory(live, category).filter((b) => !b.isMain || b.hits.length > 0)
  const shown = segments.slice(0, maxSegments)
  const hidden = segments.length - shown.length
  const color = category === 'red' ? 'text-red-300' : 'text-emerald-300'
  return (
    <>
      <span className={cn('flex h-11 items-center gap-2 whitespace-nowrap text-2xl font-black', color)}>
        <span aria-hidden className={cn('h-4 w-4 shrink-0 rounded-full', category === 'red' ? 'bg-suit-red' : 'bg-emerald-700')} />
        {label}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        {segments.length === 0 ? (
          <span className="flex h-11 items-center text-2xl italic text-white/70">{t('game.live.none')}</span>
        ) : (
          shown.map((ball, i) => (
            <LiveSegment
              key={ball.id}
              ball={ball}
              cumulative={cumulative}
              colorClass={color}
              moreBalls={i === shown.length - 1 ? hidden : 0}
            />
          ))
        )}
      </div>
    </>
  )
}

function LiveSegment({ ball, cumulative, colorClass, moreBalls }: { ball: PlinkoCastLiveBall; cumulative: boolean; colorClass: string; moreBalls: number }) {
  const { t, pinLabel, shortLabel, formatModifier } = usePlinkoText()
  const reduceMotion = !!useReducedMotion()
  const summary = modifierSummary(ball.effects, cumulative, ball.isMain, JACKPOT_VALUE).map(formatModifier)
  if (!ball.isMain && ball.landed && ball.finalSips !== null) summary.push(`= ${ball.finalSips}`)
  const start = Math.max(0, ball.hits.length - (summary.length > 0 ? CHIPS_WITH_SUMMARY : CHIPS_PER_SEGMENT))
  return (
    <div className="flex h-11 min-w-0 items-center gap-2 overflow-hidden">
      {!ball.isMain && <span role="img" aria-label={t('game.live.extraBall')} className="shrink-0 text-3xl leading-none">🎱</span>}
      {start > 0 && <span className="shrink-0 text-xl font-bold text-white/70">+{start}</span>}
      {/* Les pions rognent avant le résumé (c'est lui qui dit ce que vaudra la balle), et
          calés à droite : faute de place, ce sont les plus anciens qui disparaissent, pas le dernier et son libellé. */}
      <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
        {ball.hits.slice(start).map((hit, i) => {
          const last = start + i === ball.hits.length - 1
          return (
            <motion.span
              key={start + i}
              role="img"
              aria-label={pinLabel(hit.type)}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 24 }}
              className="flex shrink-0 items-center gap-1"
            >
              <PinDot type={hit.type} />
              {(hit.type === 'mystery' || hit.inert) && (
                <>
                  <span aria-hidden className="text-xl font-bold text-white/70">→</span>
                  {(hit.type === 'mystery' && !hit.resolved) || hit.inert
                    ? <span aria-hidden className="text-xl font-bold text-white/70">∅</span>
                    : hit.resolved && <PinDot type={hit.resolved} />}
                </>
              )}
              {hit.doubled && <span aria-hidden className="rounded-full bg-gold px-1.5 text-lg font-black leading-tight text-black">×2</span>}
              {last && <span className="ml-1 whitespace-nowrap text-xl font-bold text-white/90">{shortLabel(hit)}</span>}
            </motion.span>
          )
        })}
      </div>
      {summary.length > 0 && (
        <span className={cn('ml-auto shrink-0 whitespace-nowrap pl-2 text-2xl font-black tabular-nums', colorClass)}>{summary.join(' · ')}</span>
      )}
      {moreBalls > 0 && <span className="shrink-0 text-xl font-bold text-white/70">+{moreBalls}</span>}
    </div>
  )
}

function PinDot({ type, small = false }: { type: SpecialPinType; small?: boolean }) {
  const c = SPECIAL_PIN_COLORS[type]
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-2 font-black leading-none text-black/80',
        small ? 'h-8 w-8 text-lg' : 'h-10 w-10 text-xl',
        c?.border,
        c?.bg,
      )}
    >
      {c?.glyph}
    </span>
  )
}

/**
 * Pendant un lancer, la bande d'effets passe avant : joueurs en rangées serrées
 * (4 au plus par colonne) et sans légende, que la bande porte déjà ; sinon le
 * panneau déborde de la toile à 12 joueurs.
 */
function Scoreboard({ rows, currentIndex, withLive }: { rows: ScoreRow[]; currentIndex: number; withLive: boolean }) {
  const { categoryLabel } = usePlinkoText()
  const tv = useTranslations('tv')
  const n = rows.length
  const cols = withLive ? Math.min(n > 12 ? 4 : 3, Math.max(1, Math.ceil(n / 4))) : n <= 4 ? 1 : n <= 8 ? 2 : 3
  const compact = withLive
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {!withLive && (
        <div className="flex shrink-0 items-center gap-5 text-lg font-semibold uppercase tracking-[0.2em]">
          <span className="text-gold/90">{tv('players')}</span>
          <span className="ml-auto flex items-center gap-2 text-red-300">
            <span aria-hidden className="h-3 w-3 rounded-full bg-suit-red" />
            {categoryLabel('red')}
          </span>
          <span className="flex items-center gap-2 text-emerald-300">
            <span aria-hidden className="h-3 w-3 rounded-full bg-emerald-700" />
            {categoryLabel('green')}
          </span>
        </div>
      )}
      <div className="grid min-h-0 content-start gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {rows.map((p, i) => {
          const active = i === currentIndex
          const played = hasPlayed(p)
          return (
            <div
              key={`${p.name}-${i}`}
              className={cn(
                'flex min-w-0 items-center gap-2.5 rounded-2xl border-2 px-3',
                compact ? 'py-1' : 'py-1.5',
                active ? 'border-gold/60 bg-gold/[0.15]' : 'border-white/10 bg-white/[0.04]',
              )}
            >
              <TvAvatar name={p.name} index={i} size={compact ? 32 : 40} />
              <span className={cn('min-w-0 flex-1 truncate text-xl font-bold', !played && !active && 'text-white/70')}>{p.name}</span>
              {played ? (
                <span className={cn('flex shrink-0 items-center gap-2 font-black tabular-nums', compact ? 'text-lg' : 'text-xl')}>
                  <span className="text-red-300">{p.totalRed}</span>
                  <span className="text-emerald-300">{p.totalGreen}</span>
                </span>
              ) : (
                <span className="shrink-0 text-lg font-bold text-white/70">—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlinkoResults({ state }: { state: PlinkoCastState }) {
  const { t } = usePlinkoText()
  // Sans `results` (téléphone plus ancien), l'écran des totaux d'avant.
  const phase = state.results?.phase ?? 'final'
  const title =
    phase === 'tournees'
      ? t('game.results.roundDrinksPhase')
      : phase === 'details'
        ? t('game.results.detailsPhase')
        : t('game.results.finalPhase')
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-4 px-8 py-4">
      <div className="flex shrink-0 flex-wrap items-baseline justify-center gap-x-8 gap-y-1">
        <p className="text-xl font-semibold uppercase tracking-[0.3em] text-gold/90">{title}</p>
        {phase === 'final' && state.roundDrinks > 0 && (
          <p className="text-3xl font-black text-gold">{t('game.results.roundDrinksAll', { count: state.roundDrinks })}</p>
        )}
      </div>
      {phase === 'tournees' ? (
        <RoundDrinksScreen count={state.roundDrinks} />
      ) : phase === 'details' ? (
        <PlayerDetail rows={state.scoreboard} index={state.results?.playerIndex ?? 0} />
      ) : (
        <FinalTotals rows={state.scoreboard} />
      )}
    </div>
  )
}

function RoundDrinksScreen({ count }: { count: number }) {
  const { t } = usePlinkoText()
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-7xl" aria-hidden>🥂</p>
      <p className="text-9xl font-black leading-none text-gold">{count > 0 ? count : '—'}</p>
      <p className="max-w-[60rem] text-4xl font-bold text-white/90">
        {count > 0
          ? t('roundDrinksBanner', { label: count === 1 ? t('roundDrinksSingular') : t('roundDrinksPlural'), count })
          : t('noRoundDrinks')}
      </p>
    </div>
  )
}

function SipBox({ category, value, size }: { category: Category; value: number; size: 'xl' | 'lg' | 'md' }) {
  const { categoryLabel } = usePlinkoText()
  const red = category === 'red'
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center justify-center rounded-2xl border-2 text-center',
        red ? 'border-suit-red/40 bg-suit-red/20 text-red-300' : 'border-emerald-700/50 bg-emerald-700/25 text-emerald-300',
        size === 'xl' ? 'flex-col gap-2 py-5' : size === 'lg' ? 'flex-col py-2' : 'gap-2 py-1',
      )}
    >
      <p className={cn('truncate font-bold uppercase tracking-[0.15em]', size === 'xl' ? 'text-3xl' : 'text-lg')}>{categoryLabel(category)}</p>
      <p className={cn('shrink-0 font-black leading-none tabular-nums', size === 'xl' ? 'text-9xl' : size === 'lg' ? 'text-6xl' : 'text-3xl')}>{value}</p>
    </div>
  )
}

/**
 * Les pions touchés tiennent sur un nombre de rangées connu d'avance : au-delà de
 * `max` types, « +n » dit qu'il en reste plutôt que de les rogner sans prévenir.
 */
function PowerupChips({ powerups, labeled, small = false, max }: { powerups: SpecialPinType[]; labeled: boolean; small?: boolean; max: number }) {
  const { pinLabel } = usePlinkoText()
  if (powerups.length === 0 || max <= 0) return null
  const counts = new Map<SpecialPinType, number>()
  powerups.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1))
  const entries = Array.from(counts)
  const visible = entries.length > max ? entries.slice(0, max - 1) : entries
  const hidden = entries.length - visible.length
  return (
    <div className={cn('flex min-h-0 flex-wrap content-start overflow-hidden', small ? 'gap-1.5' : 'gap-2')}>
      {visible.map(([type, count]) => (
        <span key={type} className={cn('flex min-w-0 items-center gap-2 rounded-full border-2 border-white/10 bg-black/25 pl-1 pr-3', small ? 'py-0.5' : 'py-1')}>
          <PinDot type={type} small={small} />
          {labeled && <span className="min-w-0 max-w-[11rem] truncate text-xl font-bold text-white/90">{pinLabel(type)}</span>}
          {count > 1 && <span className="shrink-0 text-xl font-black text-gold">×{count}</span>}
        </span>
      ))}
      {hidden > 0 && (
        <span className="flex shrink-0 items-center self-stretch rounded-full border-2 border-white/10 bg-black/25 px-3 text-xl font-black text-white/80">
          +{hidden}
        </span>
      )}
    </div>
  )
}

function PlayerDetail({ rows, index }: { rows: ScoreRow[]; index: number }) {
  const { t } = usePlinkoText()
  const player = rows[index]
  if (!player) return null
  const turns = player.turns ?? [{ redSips: player.totalRed, greenSips: player.totalGreen, powerups: [] }]
  const single = turns.length <= 1
  return (
    <div className="flex min-h-0 w-full max-w-[64rem] flex-1 flex-col justify-center gap-6">
      <div className="flex min-w-0 items-center gap-6">
        <TvAvatar name={player.name} index={index} size={112} active />
        <p className="min-w-0 flex-1 truncate text-7xl font-black leading-tight">{player.name}</p>
        <p className="shrink-0 text-4xl font-black tabular-nums text-white/80">
          {index + 1} / {rows.length}
        </p>
      </div>
      {turns.length === 0 ? (
        <div className="flex gap-6">
          <SipBox category="red" value={0} size="xl" />
          <SipBox category="green" value={0} size="xl" />
        </div>
      ) : (
        // Un lancer par joueur en jeu local ; plusieurs tours se rangent côte à côte pour tenir en hauteur.
        <div className="flex min-h-0 gap-6">
          {turns.slice(0, 2).map((turn, i) => (
            <div key={i} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
              {!single && <p className="text-2xl font-bold text-white/80">{t('game.results.turn', { n: i + 1 })}</p>}
              <div className="flex gap-6">
                <SipBox category="red" value={turn.redSips} size={single ? 'xl' : 'lg'} />
                <SipBox category="green" value={turn.greenSips} size={single ? 'xl' : 'lg'} />
              </div>
              {/* 3 rangées de 3 pions libellés (≤ 17,5 rem chacun) sur 64 rem ; 4 rangées de 1 en deux colonnes. */}
              <PowerupChips powerups={turn.powerups} labeled max={single ? 9 : 4} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type TotalsLayout = {
  cols: number
  rows: number
  /** Une seule rangée de cartes : contenu centré, plus gros. */
  tall: boolean
  sip: 'xl' | 'lg' | 'md'
  avatar: number
  nameClass: string
  chips: { labeled: boolean; small: boolean; max: number }
}

/** Bilans faits sur la toile 80 × 39 rem (cellule, en-tête, gorgées, puis rangées de pions qui restent). */
function totalsLayout(n: number): TotalsLayout {
  if (n <= 2) return { cols: Math.max(1, n), rows: 1, tall: true, sip: 'xl', avatar: 56, nameClass: 'text-4xl', chips: { labeled: true, small: false, max: 6 } }
  if (n <= 4) return { cols: n, rows: 1, tall: true, sip: 'lg', avatar: n === 3 ? 56 : 48, nameClass: n === 3 ? 'text-4xl' : 'text-3xl', chips: { labeled: true, small: false, max: 5 } }
  if (n <= 6) return { cols: 3, rows: 2, tall: false, sip: 'md', avatar: 40, nameClass: 'text-2xl', chips: { labeled: false, small: true, max: 12 } }
  if (n <= 8) return { cols: 4, rows: 2, tall: false, sip: 'md', avatar: 40, nameClass: 'text-2xl', chips: { labeled: false, small: true, max: 9 } }
  if (n <= 12) return { cols: 4, rows: 3, tall: false, sip: 'md', avatar: 40, nameClass: 'text-2xl', chips: { labeled: false, small: true, max: 3 } }
  return { cols: 4, rows: Math.ceil(n / 4), tall: false, sip: 'md', avatar: 40, nameClass: 'text-2xl', chips: { labeled: false, small: true, max: 0 } }
}

function FinalTotals({ rows }: { rows: ScoreRow[] }) {
  const layout = totalsLayout(rows.length)
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }}
      >
        {rows.map((p, i) => {
          const powerups = (p.turns ?? []).flatMap((turn) => turn.powerups)
          return (
            <div
              key={`${p.name}-${i}`}
              className={cn(
                'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border-2 border-gold/20 bg-black/25',
                layout.tall ? 'justify-center gap-3 p-4' : 'gap-1.5 p-2.5',
              )}
            >
              <div className="flex min-w-0 shrink-0 items-center gap-3">
                <TvAvatar name={p.name} index={i} size={layout.avatar} />
                <p className={cn('min-w-0 flex-1 truncate font-black', layout.nameClass)}>{p.name}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <SipBox category="red" value={p.totalRed} size={layout.sip} />
                <SipBox category="green" value={p.totalGreen} size={layout.sip} />
              </div>
              <PowerupChips powerups={powerups} labeled={layout.chips.labeled} small={layout.chips.small} max={layout.chips.max} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
