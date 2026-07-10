"use client"

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { PlinkoCastState, PlinkoCastFrame } from '@/lib/cast-types'
import { SPECIAL_PIN_COLORS } from '@/lib/plinko-pins'
import { cn } from '@/lib/utils'
import { TvAvatar } from './tv-shared'

const SLOT_COUNT = 10

/**
 * Rendu TV du cast Plinko : le VRAI plateau (pions normaux + spéciaux + cases,
 * aux mêmes positions % que sur mobile) avec les billes qui tombent en direct
 * (trames `frame`), plus un panneau joueur/résultat/scores à droite.
 */
export function TvPlinko({ state, frame }: { state: PlinkoCastState; frame: PlinkoCastFrame | null }) {
  const t = useTranslations('tv')
  const finished = state.phase === 'finished'
  const dropping = state.phase === 'dropping'
  const board = state.board

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-5 px-6 py-4 sm:px-10 lg:flex-row lg:items-stretch lg:gap-6">
      {/* Plateau (portrait, mêmes % que sur mobile) — paysage sur TV, empilé sinon */}
      <div
        className="relative aspect-[319/487] h-[48vh] shrink-0 overflow-hidden rounded-2xl border border-white/10 lg:h-[84vh]"
        style={{
          background: 'radial-gradient(ellipse at 50% -10%, rgba(124,58,237,0.22) 0%, rgba(9,6,20,1) 65%)',
        }}
      >
        {board.normalPins.map((p, i) => (
          <div
            key={`n${i}`}
            className="absolute h-3 w-3 rounded-full bg-gold/50"
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)' }}
          />
        ))}

        {board.specialPins.map((p, i) => {
          const c = SPECIAL_PIN_COLORS[p.type]
          return (
            <div
              key={`s${i}`}
              className={cn('absolute flex h-7 w-7 items-center justify-center rounded-full border-2', c?.border, c?.bg)}
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)' }}
            >
              <span className="text-sm font-black leading-none text-black/80">{c?.glyph}</span>
            </div>
          )
        })}

        <div className="absolute bottom-0 flex w-full">
          {board.slots.map((v, i) => {
            const isRed = state.lastDrop?.redSlot === i
            const isGreen = state.lastDrop?.greenSlot === i
            return (
              <div
                key={i}
                className={cn(
                  'flex h-14 items-center justify-center border-x border-t border-gold/20',
                  isRed && isGreen
                    ? 'bg-amber-500/40'
                    : isRed
                      ? 'bg-red-500/40'
                      : isGreen
                        ? 'bg-emerald-500/40'
                        : 'bg-felt-deep/60',
                )}
                style={{ width: `${100 / SLOT_COUNT}%` }}
              >
                <span className="text-lg font-black text-white/80">{v}</span>
              </div>
            )
          })}
        </div>

        {/* Billes — uniquement pendant la chute ; transition CSS pour lisser le ~12 fps. */}
        {dropping &&
          frame?.balls.map((b, i) => (
            <div
              key={i}
              className="absolute h-5 w-5 rounded-full"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                transform: 'translate(-50%,-50%)',
                backgroundColor: b.color === 'red' ? '#ef4444' : '#22c55e',
                boxShadow: `0 0 14px ${b.color === 'red' ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)'}`,
                transition: 'left 90ms linear, top 90ms linear',
              }}
            />
          ))}
      </div>

      {/* Panneau d'infos */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 py-2">
        <div>
          {finished ? (
            <>
              <p className="text-3xl" aria-hidden>🍺</p>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300/70">{t('standings')}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-gold/60">{t('turnOf')}</p>
              <p className="text-4xl font-black sm:text-5xl">{state.currentPlayerName ?? '—'}</p>
            </>
          )}
        </div>

        {state.lastDrop && !finished && (
          <motion.div
            key={JSON.stringify(state.lastDrop)}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3"
          >
            <span className="text-xl font-bold">{state.lastDrop.playerName}</span>
            <span className="rounded-lg bg-red-500/20 px-3 py-1 text-lg font-bold text-red-300">
              {t('drinkVerb')} {state.lastDrop.redSips} 🍺
            </span>
            <span className="rounded-lg bg-emerald-500/20 px-3 py-1 text-lg font-bold text-emerald-300">
              {t('giveVerb')} {state.lastDrop.greenSips} 🍺
            </span>
          </motion.div>
        )}
        {state.roundDrinks > 0 && <p className="text-lg font-bold text-amber-300">🥂 ×{state.roundDrinks}</p>}

        <div className="mt-auto space-y-2">
          {state.scoreboard.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                state.currentPlayerName === p.name && !finished
                  ? 'border-gold/60 bg-gold/15'
                  : 'border-white/10 bg-white/[0.03]',
              )}
            >
              <TvAvatar name={p.name} index={i} size={36} />
              <span className="flex-1 truncate text-xl font-bold">{p.name}</span>
              <span className="text-base font-bold text-red-300">{p.totalRed} 🍺</span>
              <span className="text-base font-bold text-emerald-300">{p.totalGreen} 🍺</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
