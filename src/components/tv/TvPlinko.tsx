"use client"

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { PlinkoCastState } from '@/lib/cast-types'
import { cn } from '@/lib/utils'
import { TvAvatar } from './tv-shared'

/** Rendu TV du cast Plinko (jeu local) : cases de score + reveal du lancer + scoreboard. */
export function TvPlinko({ state }: { state: PlinkoCastState }) {
  const t = useTranslations('tv')
  const finished = state.phase === 'finished'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-8 py-6">
      <div className="text-center">
        {finished ? (
          <>
            <p className="text-4xl" aria-hidden>🍺</p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.3em] text-amber-300/70">{t('standings')}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-300/60">{t('turnOf')}</p>
            <p className="text-5xl font-black">{state.currentPlayerName ?? '—'}</p>
          </>
        )}
      </div>

      {/* Cases de score + bille(s) tombée(s) */}
      <div className="flex items-end justify-center">
        <div className="grid w-full max-w-4xl grid-cols-10 gap-2">
          {state.slots.map((v, i) => {
            const isRed = state.lastDrop?.redSlot === i
            const isGreen = state.lastDrop?.greenSlot === i
            return (
              <div
                key={i}
                className={cn(
                  'relative flex h-20 flex-col items-center justify-end rounded-xl border pb-2',
                  isRed && isGreen
                    ? 'border-fuchsia-400/60 bg-fuchsia-500/25'
                    : isRed
                      ? 'border-red-400/60 bg-red-500/25'
                      : isGreen
                        ? 'border-emerald-400/60 bg-emerald-500/25'
                        : 'border-white/10 bg-white/[0.03]',
                )}
              >
                {(isRed || isGreen) && (
                  <motion.span
                    initial={{ y: -70, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                    className={cn(
                      'absolute -top-3 h-6 w-6 rounded-full shadow-lg',
                      isRed && isGreen
                        ? 'bg-gradient-to-r from-red-500 to-emerald-500'
                        : isRed
                          ? 'bg-red-500'
                          : 'bg-emerald-500',
                    )}
                  />
                )}
                <span className="text-2xl font-black text-white/80">{v}</span>
              </div>
            )
          })}
        </div>
      </div>

      {state.lastDrop && !finished && (
        <motion.div
          key={JSON.stringify(state.lastDrop)}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mx-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3"
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

      {state.roundDrinks > 0 && (
        <p className="text-center text-lg font-bold text-amber-300">🥂 ×{state.roundDrinks}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-center gap-3">
        {state.scoreboard.map((p, i) => (
          <div
            key={`${p.name}-${i}`}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-2',
              state.currentPlayerName === p.name && !finished
                ? 'border-violet-400/60 bg-violet-500/15'
                : 'border-white/10 bg-white/[0.03]',
            )}
          >
            <TvAvatar name={p.name} index={i} size={32} />
            <span className="text-lg font-bold">{p.name}</span>
            <span className="text-sm font-bold text-red-300">{p.totalRed} 🍺</span>
            <span className="text-sm font-bold text-emerald-300">{p.totalGreen} 🍺</span>
          </div>
        ))}
      </div>
    </div>
  )
}
