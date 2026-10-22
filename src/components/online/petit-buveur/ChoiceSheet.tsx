"use client"

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Target } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { CaseToken } from '@/components/petit-buveur/CaseToken'
import { cn } from '@/lib/utils'

/**
 * Fenêtre de décision du Petit Buveur en ligne (cible, verdict, pile ou face,
 * Chance, téléport) : feuille du bas sur mobile, centrée sur desktop.
 * Non fermable : la partie attend ce choix.
 *
 * Elle tient dans l'écran (max 92dvh) : en-tête compact, contenu qui défile,
 * pied collé (`footer`) pour les actions rapides — à huit joueurs, le titre
 * et la consigne ne partent plus au-dessus du viewport.
 */
/**
 * Le focus entre dans la feuille à l'ouverture : au clavier, Tab partait
 * sinon du bouton resté derrière le voile. Fonction de module : référence
 * stable, appelée au montage seulement.
 */
export function focusOnMount(el: HTMLElement | null) {
  el?.focus({ preventScroll: true })
}

export function ChoiceSheet({
  ariaLabel,
  caseLabel,
  caseType,
  title,
  hint,
  icon,
  children,
  footer,
}: {
  ariaLabel: string
  caseLabel: string
  /** Type de la case : son jeton (même icône que le plateau et la carte de case). */
  caseType?: string
  title: string
  hint?: ReactNode
  icon?: ReactNode
  children: ReactNode
  /** Actions collées en bas de la feuille (Aléatoire / Moi…). */
  footer?: ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        tabIndex={-1}
        ref={focusOnMount}
        className="z-[100] flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gold/25 bg-felt-deep text-cream shadow-2xl outline-none"
      >
        <div className="shrink-0 border-b border-gold/20 px-4 pb-3 pt-4">
          <div className="flex items-center gap-3">
            {caseType ? (
              <CaseToken caseType={caseType} size={40} />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/30">
                {icon ?? <Target className="h-5 w-5 text-gold" aria-hidden />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gold">{caseLabel}</p>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold leading-tight text-cream">
                {caseType && icon ? <span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</span> : null}
                {title}
              </h2>
            </div>
          </div>
          {hint && <div className="mt-2 text-sm text-cream/80">{hint}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-gold/20 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

const CHOICE = 'w-full gap-2 whitespace-normal px-3 leading-tight'

/** Bouton principal (encre sur or) des fenêtres de décision — variante du socle, 48 px. */
export const PRIMARY_CHOICE = cn(buttonVariants({ variant: 'primary', size: 'game' }), CHOICE)

/** Bouton secondaire (feutre, filet or) des fenêtres de décision. */
export const SECONDARY_CHOICE = cn(buttonVariants({ variant: 'quiet', size: 'game' }), CHOICE)

/** Geste qui fait boire (« A bu ») : crème sur rouge carreau. */
export const DANGER_CHOICE = cn(buttonVariants({ variant: 'danger', size: 'game' }), CHOICE)
