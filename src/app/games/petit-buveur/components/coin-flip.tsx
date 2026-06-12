'use client'

import { motion } from 'framer-motion'

export type CoinSide = 'pile' | 'face'

function CoinFaceContent({ side }: { side: CoinSide }) {
  const isPile = side === 'pile'

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-full border-[3px] shadow-[inset_0_2px_8px_rgba(0,0,0,0.25),0_4px_16px_rgba(0,0,0,0.35)] ${
        isPile
          ? 'border-slate-300/90 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-slate-700'
          : 'border-amber-300/90 bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-400 text-amber-900'
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
        {isPile ? 'Pile' : 'Face'}
      </span>
      <span className="mt-0.5 text-3xl font-black sm:text-4xl" aria-hidden>
        {isPile ? '1' : '👤'}
      </span>
      <span className="mt-1 text-[9px] font-medium opacity-50">FR</span>
    </div>
  )
}

type CoinFlipProps = {
  result: CoinSide
  isFlipping: boolean
}

export function CoinFlip({ result, isFlipping }: CoinFlipProps) {
  const landRotation = result === 'face' ? 180 : 0
  const spinRotations = 5 * 360 + landRotation

  return (
    <div className="flex items-center justify-center py-4 [perspective:900px]">
      <motion.div
        className="relative h-28 w-28 sm:h-32 sm:w-32 [transform-style:preserve-3d]"
        initial={{ rotateY: 0 }}
        animate={
          isFlipping
            ? { rotateY: [0, spinRotations * 0.35, spinRotations * 0.72, spinRotations] }
            : { rotateY: landRotation }
        }
        transition={
          isFlipping
            ? {
                duration: 2.1,
                ease: [0.22, 0.68, 0.12, 1],
                times: [0, 0.45, 0.78, 1],
              }
            : { type: 'spring', stiffness: 280, damping: 24 }
        }
      >
        {isFlipping && (
          <motion.div
            className="pointer-events-none absolute -inset-6 rounded-full bg-amber-400/25 blur-2xl"
            animate={{ opacity: [0.2, 0.65, 0.15], scale: [0.85, 1.2, 0.9] }}
            transition={{ duration: 0.55, repeat: Infinity, repeatType: 'reverse' }}
          />
        )}

        {/* Pile */}
        <div
          className="absolute inset-0 [backface-visibility:hidden]"
          style={{ transform: 'rotateY(0deg) translateZ(2px)' }}
        >
          <CoinFaceContent side="pile" />
        </div>

        {/* Face */}
        <div
          className="absolute inset-0 [backface-visibility:hidden]"
          style={{ transform: 'rotateY(180deg) translateZ(2px)' }}
        >
          <CoinFaceContent side="face" />
        </div>
      </motion.div>
    </div>
  )
}

export function getPileFaceOutcomeLabel(
  choice: CoinSide,
  result: CoinSide
): { won: boolean; label: string } {
  const won = choice === result
  return {
    won,
    label: won
      ? `Tirage : ${result} — la cible a gagné !`
      : `Tirage : ${result} — la cible perd et boit.`,
  }
}
