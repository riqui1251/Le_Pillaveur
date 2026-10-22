'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { Crown } from 'lucide-react'
import type { PetitBuveurT } from '../case-config'

export type CoinSide = 'pile' | 'face'

function CoinFaceContent({ side }: { side: CoinSide }) {
  const t = useTranslations('games.petit-buveur.coinFlip')
  const isPile = side === 'pile'

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-full border-[3px] shadow-[inset_0_2px_8px_rgba(0,0,0,0.25),0_4px_16px_rgba(0,0,0,0.35)] ${
        isPile
          ? 'border-gold-strong bg-gold text-[#24201A]'
          : 'border-gold bg-gold-strong text-[#24201A]'
      }`}
    >
      <span className="font-display text-xs font-bold uppercase tracking-[0.15em]">
        {isPile ? t('pile') : t('face')}
      </span>
      {/* Face : une couronne à l'encre (le 👤 gris se perdait sur l'or cuivré). */}
      {isPile ? (
        <span className="mt-0.5 text-3xl font-black sm:text-4xl" aria-hidden>
          1
        </span>
      ) : (
        <Crown aria-hidden className="mt-1 h-8 w-8 sm:h-9 sm:w-9" strokeWidth={2.25} />
      )}
    </div>
  )
}

type CoinFlipProps = {
  result: CoinSide
  isFlipping: boolean
}

export function CoinFlip({ result, isFlipping }: CoinFlipProps) {
  const reduced = useReducedMotion()
  const landRotation = result === 'face' ? 180 : 0
  const spinRotations = 5 * 360 + landRotation
  // Moins d'animations : pas de 5 tours en 3D ni de ressort (framer-motion anime
  // en JS, la règle CSS prefers-reduced-motion ne le touche pas). Le suspense
  // reste : pièce neutre, résultat caché jusqu'à la fin du lancer.
  const spinning = isFlipping && !reduced
  const hideResult = isFlipping && Boolean(reduced)

  return (
    <div className="flex items-center justify-center py-4 [perspective:900px]">
      <motion.div
        className="relative h-28 w-28 sm:h-32 sm:w-32 [transform-style:preserve-3d]"
        initial={{ rotateY: 0 }}
        animate={
          spinning
            ? { rotateY: [0, spinRotations * 0.35, spinRotations * 0.72, spinRotations] }
            : { rotateY: hideResult ? 0 : landRotation }
        }
        transition={
          reduced
            ? { duration: 0 }
            : isFlipping
              ? {
                  duration: 2.1,
                  ease: [0.22, 0.68, 0.12, 1],
                  times: [0, 0.45, 0.78, 1],
                }
              : { type: 'spring', stiffness: 280, damping: 24 }
        }
      >
        {/* Halo pulsant coupé quand l'appareil demande moins d'animations. */}
        {spinning && (
          <motion.div
            className="pointer-events-none absolute -inset-6 rounded-full bg-gold/20 blur-2xl"
            animate={{ opacity: [0.2, 0.65, 0.15], scale: [0.85, 1.2, 0.9] }}
            transition={{ duration: 0.55, repeat: Infinity, repeatType: 'reverse' }}
          />
        )}

        {hideResult ? (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center rounded-full border-[3px] border-gold bg-gold/20 font-display text-4xl font-black text-gold"
          >
            ?
          </div>
        ) : (
          <>
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
          </>
        )}
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
