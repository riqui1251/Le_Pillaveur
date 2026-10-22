"use client"

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TUTORIAL_VISUALS } from '@/lib/online/tutorial-visuals'

/**
 * Tutoriel de premier lancement, commun aux jeux en ligne. S'affiche une
 * seule fois par jeu et par appareil (flag localStorage), réouvrable via
 * `TutorialReopenButton`. Contenu (titres/textes) traduit via
 * `games.<id>.tutorial.steps` ; chaque étape peut porter un facsimilé visuel
 * (voir tutorial-visuals.tsx, Direction B « La Vitrine ») — on MONTRE l'écran
 * réel (grille de vote, carte, canvas…) plutôt que de le décrire seul.
 */

export type TutorialStep = { title: string; body: string }

const SEEN_KEY_PREFIX = 'lp-tutorial-seen-'

export function hasSeenGameTutorial(gameId: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(SEEN_KEY_PREFIX + gameId) === '1'
  } catch {
    return true
  }
}

export function markGameTutorialSeen(gameId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SEEN_KEY_PREFIX + gameId, '1')
  } catch {
    // Stockage indisponible (navigation privée…) : tant pis, pas bloquant.
  }
}

/** Ouvre automatiquement au premier passage en jeu de CE jeu, sur cet appareil. */
export function useGameTutorial(gameId: string, active: boolean) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!active) return
    if (!hasSeenGameTutorial(gameId)) setOpen(true)
  }, [gameId, active])

  const close = () => {
    markGameTutorialSeen(gameId)
    setOpen(false)
  }

  return { open, close, reopen: () => setOpen(true) }
}

export function TutorialReopenButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  const t = useTranslations('gameTutorial')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('reopenAria')}
      className={cn(
        'touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-felt-deep/60 text-gold transition-colors hover:bg-gold/10',
        className
      )}
    >
      <Lightbulb className="h-4 w-4" />
    </button>
  )
}

export function GameTutorialModal({
  gameId,
  onClose,
}: {
  gameId: string
  onClose: () => void
}) {
  const t = useTranslations('gameTutorial')
  const tSteps = useTranslations(`games.${gameId}.tutorial`)
  const steps = (tSteps.raw('steps') as TutorialStep[] | undefined) ?? []
  const visuals = TUTORIAL_VISUALS[gameId]
  const [idx, setIdx] = useState(0)
  const step = steps[idx]
  const isLast = idx === steps.length - 1
  const titleId = useId()
  const reduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  // Modale : le focus entre sur « Suivant » et revient à la fermeture sur ce
  // qui l'avait ouverte (l'ampoule) ; Échap ferme, Tab tourne dans la carte.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    nextRef.current?.focus()
    return () => {
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const inside = document.activeElement instanceof Node && panelRef.current.contains(document.activeElement)
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!step || typeof document === 'undefined') return null

  // Porté sur <body> : rendu dans la scène des jeux en ligne (OnlineGameStage,
  // contexte d'empilement en z-20), le voile restait sous la Navbar et sous
  // les barres d'action, quel que soit son z-index.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? { opacity: 0 } : { scale: 0.92, opacity: 0, y: 10 }}
        animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
        transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-[#D8CCAE] bg-cream p-5 text-[#24201A] shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-[#24201A]/[0.12] bg-[#24201A]/5 px-2 py-0.5 font-display text-xs font-bold text-[#4A443A]">
            {t('stepCounter', { n: idx + 1, total: steps.length })}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-[#6B6455] transition-colors hover:bg-[#24201A]/[0.08] hover:text-[#24201A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {visuals?.[idx] && <div className="mt-2">{visuals[idx]}</div>}

        <motion.div
          key={idx}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 min-h-[5.5rem] space-y-1.5 text-center"
        >
          <h3 id={titleId} className="font-display text-lg font-bold">{step.title}</h3>
          <p className="text-sm leading-relaxed text-[#4A443A]">{step.body}</p>
        </motion.div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div aria-hidden className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  i === idx ? 'bg-gold' : 'bg-[#24201A]/20'
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {idx > 0 && (
              <button
                type="button"
                onClick={() => setIdx((v) => v - 1)}
                aria-label={t('prev')}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#24201A]/[0.12] bg-[#24201A]/5 text-[#4A443A] hover:bg-[#24201A]/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <Button
              ref={nextRef}
              type="button"
              variant="primary"
              size="game"
              onClick={() => (isLast ? onClose() : setIdx((v) => v + 1))}
              className="gap-1"
            >
              {isLast ? t('gotIt') : t('next')}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
