"use client"

import { useEffect, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { getCaseMeta, CASE_FAMILY_STYLE } from '@/lib/petit-buveur/case-families'
import { playGameSound } from '@/lib/sound/game-sounds'

/**
 * Révélation de case — partagée local + online.
 *
 * Carte qui « flippe » à l'apparition, teintée par la FAMILLE de la case
 * (bonus vert, malus rouge, déplacement bleu, interaction violet) avec son
 * icône : l'effet se lit d'un coup d'œil. `revealKey` relance l'animation
 * (et le son) à chaque nouvelle case.
 */
export function CaseRevealCard({
  caseType,
  label,
  revealKey,
  headerExtra,
  children,
  className,
}: {
  caseType: string
  /** Libellé traduit du type de case. */
  label: string
  /** Change à chaque NOUVELLE case pour rejouer flip + son (pas à chaque rendu). */
  revealKey: string | number
  /** Éléments additionnels dans la rangée d'en-tête (n° de case, dé…). */
  headerExtra?: ReactNode
  /** Détail sous l'en-tête (texte d'effet, défi…). */
  children?: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const meta = getCaseMeta(caseType)
  const style = CASE_FAMILY_STYLE[meta.family]

  useEffect(() => {
    playGameSound('reveal')
  }, [revealKey])

  return (
    <motion.div
      key={revealKey}
      initial={reduced ? { opacity: 0 } : { opacity: 0, rotateX: -80, scale: 0.96 }}
      animate={{ opacity: 1, rotateX: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      style={{ transformPerspective: 700 }}
      className={cn('rounded-xl border p-3 shadow-sm', style.border, style.bg, className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <motion.span
          initial={reduced ? {} : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16, delay: reduced ? 0 : 0.08 }}
          className="text-xl leading-none"
          aria-hidden
        >
          {meta.icon}
        </motion.span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', style.chip)}>
          {label}
        </span>
        {headerExtra}
      </div>
      {children}
    </motion.div>
  )
}
