'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { PetitBuveurT } from '../case-config'

const DICE_DOT_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function DiceFace({ value, label }: { value: number; label: string }) {
  const face = Math.min(6, Math.max(1, value))
  const dots = DICE_DOT_POSITIONS[face]

  return (
    <div
      className="grid h-[5.5rem] w-[5.5rem] grid-cols-3 grid-rows-3 gap-2 rounded-2xl border-2 border-slate-200/80 bg-gradient-to-br from-white to-slate-100 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24"
      aria-label={label}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center justify-center">
          {dots.includes(i) ? (
            <span className="h-3 w-3 rounded-full bg-slate-900 shadow-inner sm:h-3.5 sm:w-3.5" />
          ) : null}
        </div>
      ))}
    </div>
  )
}

type ShameDiceProps = {
  displayValue: number
  isRolling: boolean
}

export function ShameDice({ displayValue, isRolling }: ShameDiceProps) {
  const t = useTranslations('games.petit-buveur.shameDice')

  return (
    <motion.div
      className="relative flex items-center justify-center py-2"
      animate={
        isRolling
          ? {
              rotate: [0, 18, -14, 22, -8, 12, 0],
              scale: [1, 1.08, 0.96, 1.1, 0.98, 1.04, 1],
              y: [0, -6, 2, -8, 0],
            }
          : { rotate: 0, scale: 1, y: 0 }
      }
      transition={
        isRolling
          ? { duration: 0.85, ease: 'easeInOut', times: [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1] }
          : { type: 'spring', stiffness: 320, damping: 22 }
      }
    >
      {isRolling && (
        <motion.div
          className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl"
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.9, 1.15, 0.9] }}
          transition={{ duration: 0.4, repeat: Infinity }}
        />
      )}
      <DiceFace value={displayValue} label={t('diceLabel', { value: displayValue })} />
    </motion.div>
  )
}

export function getDeHonteOutcomeLabel(value: number, t: PetitBuveurT): string {
  if (value <= 2) return t('shameDice.safe')
  if (value <= 4) return t('shameDice.twoSips')
  if (value === 5) return t('shameDice.advance')
  return t('shameDice.back')
}

export function buildDeHonteDescription(
  roll: number,
  playerHtml: string,
  t: PetitBuveurT
): string {
  const placeholders = { player: '__HTML_player__' }
  let key: string
  const values: Record<string, string | number> = { roll, ...placeholders }

  if (roll <= 2) key = 'shameDice.outcomeSafe'
  else if (roll <= 4) key = 'shameDice.outcomeDrink'
  else if (roll === 5) key = 'shameDice.outcomeAdvance'
  else key = 'shameDice.outcomeBack'

  let result = t(key, values)
  return result.replaceAll('__HTML_player__', playerHtml)
}
