"use client"

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Target } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Fenêtre de décision du Petit Buveur en ligne (cible, verdict, pile ou face,
 * Chance, téléport) : plein écran en bas sur mobile, centrée sur desktop.
 * Non fermable : la partie attend ce choix.
 */
export function ChoiceSheet({
  ariaLabel,
  caseLabel,
  title,
  hint,
  icon,
  children,
  scroll = false,
}: {
  ariaLabel: string
  caseLabel: string
  title: string
  hint?: ReactNode
  icon?: ReactNode
  children: ReactNode
  /** Contenu long (liste de cibles) : défilement interne. */
  scroll?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className={cn(
          'z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-gold/25 bg-felt-deep shadow-2xl',
          scroll && 'flex max-h-[85dvh] flex-col'
        )}
      >
        <div className="flex flex-col items-center gap-2 border-b border-gold/20 bg-gradient-to-br from-amber-600/20 to-transparent px-5 pb-4 pt-5 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/30">
            {icon ?? <Target className="h-6 w-6 text-amber-300" aria-hidden />}
          </div>
          <span className="rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-100">
            {caseLabel}
          </span>
          <h3 className="text-lg font-bold text-cream">{title}</h3>
          {hint && <div className="max-w-[20rem] text-sm text-cream/70">{hint}</div>}
        </div>
        <div className={cn('p-4 sm:p-5', scroll && 'min-h-0 overflow-y-auto')}>{children}</div>
      </motion.div>
    </motion.div>
  )
}

/** Bouton principal (or) des fenêtres de décision. */
export const PRIMARY_CHOICE =
  'flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-base font-bold text-felt-deep shadow-lg transition-colors hover:bg-amber-400 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream'

/** Bouton secondaire (feutre) des fenêtres de décision. */
export const SECONDARY_CHOICE =
  'flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-xl border border-gold/30 bg-felt px-4 py-3 text-base font-bold text-cream transition-colors hover:border-gold/60 hover:bg-felt-deep active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
