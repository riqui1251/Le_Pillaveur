"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Tutoriel de premier lancement, commun aux jeux en ligne. S'affiche une
 * seule fois par jeu et par appareil (flag localStorage), réouvrable via
 * `TutorialReopenButton`. Contenu (titres/textes) fourni par l'appelant,
 * traduit via `t.raw('games.<id>.tutorial.steps')`.
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

function markGameTutorialSeen(gameId: string) {
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
      onClick={onClick}
      aria-label={t('reopenAria')}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white',
        className
      )}
    >
      <Lightbulb className="h-4 w-4" />
    </button>
  )
}

export function GameTutorialModal({
  steps,
  onClose,
}: {
  steps: TutorialStep[]
  onClose: () => void
}) {
  const t = useTranslations('gameTutorial')
  const [idx, setIdx] = useState(0)
  const step = steps[idx]
  const isLast = idx === steps.length - 1

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-gold/20 bg-felt-deep p-5 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {t('stepCounter', { n: idx + 1, total: steps.length })}
          </span>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 min-h-[6.5rem] space-y-2"
        >
          <h3 className="text-lg font-black">{step.title}</h3>
          <p className="text-sm leading-relaxed text-white/70">{step.body}</p>
        </motion.div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  i === idx ? 'bg-gold' : 'bg-white/15'
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {idx > 0 && (
              <button
                onClick={() => setIdx((v) => v - 1)}
                aria-label={t('prev')}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => (isLast ? onClose() : setIdx((v) => v + 1))}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-bold hover:from-amber-400 hover:to-amber-500"
            >
              {isLast ? t('gotIt') : t('next')}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
