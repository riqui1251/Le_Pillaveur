"use client"

import { Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { PmuCastState, PmuCastFrame } from '@/lib/cast-types'
import { cn } from '@/lib/utils'

type CastHorse = PmuCastState['horses'][number]

/** Largeur (rem) de la colonne d'étiquette d'un couloir : sert aussi au calcul des parieurs visibles. */
const LABEL_REM = 30
const TOKEN_REM = 3.5

const MEDALS = ['🥇', '🥈', '🥉']

/** Gains visibles à l'écran de fin (8 rangées de 2) : au-delà, la colonne déborderait de la toile de 39 rem. */
const MAX_PAYOUT_CELLS = 16

/**
 * Parieurs d'un couloir qui tiennent sur deux lignes de la colonne d'étiquette
 * (estimation de largeur en text-xl gras), le reste résumé en « +N » : des
 * dizaines de parieurs sur un cheval ne doivent pas pousser la piste hors écran.
 */
export function fitRiders(names: string[], bets: (number | undefined)[], widthRem = LABEL_REM, lines = 2) {
  const chipRem = (i: number) => names[i].length * 0.68 + (bets[i] != null ? 2.9 : 0) + 1.5 + 0.5
  const plusRem = 3.5
  let line = 0
  let used = 0
  for (let i = 0; i < names.length; ) {
    const w = chipRem(i)
    const reserve = line === lines - 1 && i < names.length - 1 ? plusRem : 0
    if (used === 0 || used + w + reserve <= widthRem) {
      used += w
      i += 1
    } else if (line < lines - 1) {
      line += 1
      used = 0
    } else {
      return { visible: i, hidden: names.length - i }
    }
  }
  return { visible: names.length, hidden: 0 }
}

/**
 * Rendu TV du cast Course PMU, alimenté par le téléphone : en attente (parieurs
 * et mises), la piste en direct (positions par les trames de la course en
 * cours), puis le vainqueur, les gorgées à distribuer et le classement — ce que
 * l'écran du téléphone montre à toute la tablée, au même moment.
 */
export function TvPmu({ state, frame }: { state: PmuCastState; frame: PmuCastFrame | null }) {
  const finished = state.phase === 'finished'
  const finish = state.finish || 100
  // Une trame d'une course précédente (rejouer) remettrait les chevaux à l'arrivée au départ.
  const liveFrame =
    state.phase === 'racing' && frame?.positions && (frame.race == null || state.race == null || frame.race === state.race)
      ? frame
      : null

  const posOf = (h: CastHorse) => Math.min(liveFrame?.positions[h.key] ?? h.position, finish)

  if (finished) return <PmuFinished state={state} posOf={posOf} finish={finish} />

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-10 py-5">
      <PmuBanner state={state} />
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
        {state.horses.map((h) => (
          <Lane key={h.key} horse={h} pct={(posOf(h) / finish) * 100} />
        ))}
      </div>
    </div>
  )
}

function PmuBanner({ state }: { state: PmuCastState }) {
  const t = useTranslations('tv')
  const tp = useTranslations('games.pmu')
  if (state.phase === 'racing') {
    return <p className="shrink-0 text-center text-5xl font-black text-white">🏇 {t('racing')}</p>
  }
  if (state.stage === 'betting') {
    return (
      <div className="flex shrink-0 items-center justify-center gap-8">
        <p className="shrink-0 text-5xl font-black text-white">{tp('titleBetting')}</p>
        <p className="min-w-0 text-xl leading-snug text-white/80">{tp('betting.info')}</p>
      </div>
    )
  }
  return (
    <div className="flex shrink-0 items-baseline justify-center gap-6">
      {state.mode && <p className="text-5xl font-black text-white">{tp(`modes.${state.mode}.title`)}</p>}
      <p className={cn('font-bold', state.mode ? 'text-2xl text-white/80' : 'text-5xl text-white')}>{t('waiting')}</p>
    </div>
  )
}

function Lane({ horse, pct }: { horse: CastHorse; pct: number }) {
  const tp = useTranslations('games.pmu')
  const bets = horse.players.map((_, i) => horse.bets?.[i])
  const { visible, hidden } = fitRiders(horse.players, bets)
  return (
    <div className="flex max-h-36 min-h-0 flex-1 items-center gap-6">
      <div className="flex h-full min-w-0 shrink-0 flex-col justify-center gap-1 overflow-hidden" style={{ width: `${LABEL_REM}rem` }}>
        <p className="flex min-w-0 items-center gap-3 text-3xl font-black text-white">
          <span
            className="h-6 w-6 shrink-0 rounded-full ring-2 ring-white/30"
            style={{ background: `linear-gradient(135deg, ${horse.colorFrom}, ${horse.colorTo})` }}
            aria-hidden
          />
          <span className="truncate">{horse.name}</span>
        </p>
        {horse.players.length === 0 ? (
          <p className="text-xl text-white/70">{tp('setup.noPlayer')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {horse.players.slice(0, visible).map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-black/30 px-3 py-0.5 text-xl font-bold text-white/90"
              >
                <span className="truncate">{name}</span>
                {bets[i] != null && <span className="shrink-0 text-gold">{bets[i]}🍺</span>}
              </span>
            ))}
            {hidden > 0 && (
              <span className="rounded-full bg-black/30 px-3 py-0.5 text-xl font-black text-gold">+{hidden}</span>
            )}
          </div>
        )}
      </div>
      <div className="relative h-16 min-w-0 flex-1 overflow-hidden rounded-2xl border-2 border-white/10 bg-black/30">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${horse.colorFrom}40, ${horse.colorTo}90)`,
            transition: 'width 90ms linear',
          }}
        />
        <div
          className="absolute inset-y-0 right-0 w-2 opacity-60"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff, #fff 0.4rem, transparent 0.4rem, transparent 0.8rem)' }}
        />
        <div
          className="absolute top-0 flex h-full items-center"
          style={{ left: `calc((100% - ${TOKEN_REM}rem) * ${pct / 100})`, transition: 'left 90ms linear' }}
        >
          <div
            className="flex items-center justify-center rounded-full border-2 border-white/40 text-4xl shadow-lg"
            style={{
              width: `${TOKEN_REM}rem`,
              height: `${TOKEN_REM}rem`,
              background: `linear-gradient(135deg, ${horse.colorFrom}, ${horse.colorTo})`,
            }}
          >
            🐎
          </div>
        </div>
      </div>
      <span className="w-28 shrink-0 text-right text-3xl font-black tabular-nums text-white/80">{Math.round(pct)}%</span>
    </div>
  )
}

function PmuFinished({
  state,
  posOf,
  finish,
}: {
  state: PmuCastState
  posOf: (h: CastHorse) => number
  finish: number
}) {
  const t = useTranslations('tv')
  const tp = useTranslations('games.pmu')
  const tc = useTranslations('common')
  const winner = state.horses.find((h) => h.key === state.winnerKey) ?? null
  const ranked = [...state.horses].sort((a, b) => {
    if (a.key === state.winnerKey) return -1
    if (b.key === state.winnerKey) return 1
    return posOf(b) - posOf(a)
  })
  const payouts = state.payouts ?? []
  const picking = state.stage === 'payout'
  const twoCols = payouts.length > 4
  const dense = payouts.length > 10
  const overflow = payouts.length > MAX_PAYOUT_CELLS
  const shown = overflow ? payouts.slice(0, MAX_PAYOUT_CELLS - 1) : payouts

  return (
    <div className="flex min-h-0 flex-1 gap-10 px-10 py-6">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-6">
        {winner && (
          <div className="flex min-w-0 shrink-0 items-center gap-6">
            <div
              className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl border-2 border-gold/60 text-7xl shadow-xl"
              style={{ background: `linear-gradient(135deg, ${winner.colorFrom}, ${winner.colorTo})` }}
            >
              🐎
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-3 font-display text-base font-semibold uppercase tracking-[0.3em] text-gold/90">
                <Trophy aria-hidden className="h-6 w-6 text-gold" />
                {t('winner')}
              </p>
              <p className="truncate text-5xl font-black leading-tight text-gold">{tp('results.winner', { name: winner.name })}</p>
              {winner.players.length > 0 && (
                <p className="truncate text-2xl font-bold text-white/80">{winner.players.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {state.mode === 'libre' && state.distSips != null && winner && (
          <div className="flex shrink-0 flex-col items-center gap-2 rounded-3xl border border-gold/30 bg-black/25 px-8 py-6 text-center">
            <p className="text-8xl font-black tabular-nums text-gold">{state.distSips} 🍺</p>
            <p className="text-2xl font-bold text-white/90">
              {tp('results.libreWin', {
                name: winner.players.length > 0 ? winner.players.join(', ') : winner.name,
                count: state.distSips,
              })}
            </p>
          </div>
        )}

        {state.mode === 'paris' && winner && (
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {picking && payouts.length > 0 && (
              <p className="shrink-0 text-xl text-white/80">
                {state.noTargets ? tp('results.allWinners') : tp('results.pickTarget')}
              </p>
            )}
            {payouts.length === 0 ? (
              <p className="text-2xl text-white/80">{tp('results.noRider')}</p>
            ) : (
              <div className={cn('grid min-h-0', twoCols ? 'grid-cols-2' : 'grid-cols-1', dense ? 'gap-2' : 'gap-3')}>
                {shown.map((p, i) => (
                  <div
                    key={`${p.name}-${i}`}
                    className={cn(
                      'flex min-w-0 items-center gap-4 rounded-2xl border border-white/10 bg-black/25 px-5 font-bold',
                      dense ? 'py-1.5 text-xl' : 'py-2.5 text-2xl',
                    )}
                  >
                    <span className="min-w-0 truncate text-white">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-gold">
                      {twoCols ? `${p.sips}` : tc('sipsCount', { count: p.sips })} 🍺
                    </span>
                    {p.target ? (
                      <span className="flex min-w-0 items-center gap-2 text-white/80">
                        <span className="shrink-0">{tp('results.giveTo')}</span>
                        <span className="truncate text-white">{p.target}</span>
                      </span>
                    ) : picking && !state.noTargets ? (
                      <span className="shrink-0 text-white/70">{tp('results.toWhom')}</span>
                    ) : null}
                  </div>
                ))}
                {overflow && (
                  <div className="flex items-center rounded-2xl border border-white/10 bg-black/25 px-5 py-1.5 text-xl font-black text-gold">
                    +{payouts.length - shown.length}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex w-[26rem] shrink-0 flex-col justify-center gap-3">
        <p className="font-display text-base font-semibold uppercase tracking-[0.3em] text-gold/90">{t('standings')}</p>
        {ranked.map((h, i) => (
          <div
            key={h.key}
            className={cn(
              'flex min-w-0 items-center gap-4 rounded-2xl border px-5 py-3',
              h.key === state.winnerKey ? 'border-gold/60 bg-gold/10' : 'border-white/10 bg-black/25',
            )}
          >
            <span className="w-10 shrink-0 text-center text-3xl font-black text-white/80">{MEDALS[i] ?? `${i + 1}.`}</span>
            <span
              className="h-6 w-6 shrink-0 rounded-full"
              style={{ background: `linear-gradient(135deg, ${h.colorFrom}, ${h.colorTo})` }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-3xl font-black text-white">{h.name}</span>
            <span className="shrink-0 text-2xl font-bold tabular-nums text-white/80">
              {Math.round((posOf(h) / finish) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
