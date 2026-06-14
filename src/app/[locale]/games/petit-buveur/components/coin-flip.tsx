'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { PetitBuveurT } from '../case-config'

export type CoinSide = 'pile' | 'face'

function CoinFaceContent({ side }: { side: CoinSide }) {
  const t = useTranslations('games.petit-buveur.coinFlip')
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
        {isPile ? t('pile') : t('face')}
      </span>
      <span className="mt-0.5 text-3xl font-black sm:text-4xl" aria-hidden>
        {isPile ? '1' : '👤'}
      </span>
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

        <div
          className="absolute inset-0 [backface-visibility:hidden]"
          style={{ transform: 'rotateY(0deg) translateZ(2px)' }}
        >
          <CoinFaceContent side="pile" />
        </div>

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
  _choice: CoinSide,
  result: CoinSide,
  t: PetitBuveurT
): { won: boolean; label: string } {
  const resultLabel = t(`coinFlip.${result}`)
  const won = _choice === result
  return {
    won,
    label: won
      ? t('coinFlip.won', { result: resultLabel })
      : t('coinFlip.lost', { result: resultLabel }),
  }
}
