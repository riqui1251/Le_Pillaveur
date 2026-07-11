"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react'
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
  if (!step) return null

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
        className="relative w-full max-w-sm rounded-2xl border border-[#D8CCAE] bg-cream p-5 text-[#24201A] shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-[#24201A]/12 bg-[#24201A]/5 px-2 py-0.5 font-display text-[10px] font-bold text-[#4A443A]">
            {t('stepCounter', { n: idx + 1, total: steps.length })}
          </span>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6B6455] transition-colors hover:bg-[#24201A]/8 hover:text-[#24201A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {visuals?.[idx] && <div className="mt-2">{visuals[idx]}</div>}

        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 min-h-[5.5rem] space-y-1.5 text-center"
        >
          <h3 className="font-display text-lg font-bold">{step.title}</h3>
          <p className="text-sm leading-relaxed text-[#4A443A]">{step.body}</p>
        </motion.div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  i === idx ? 'bg-gold' : 'bg-[#24201A]/15'
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {idx > 0 && (
              <button
                onClick={() => setIdx((v) => v - 1)}
                aria-label={t('prev')}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#24201A]/12 bg-[#24201A]/5 text-[#6B6455] hover:bg-[#24201A]/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => (isLast ? onClose() : setIdx((v) => v + 1))}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-bold text-black hover:from-amber-400 hover:to-amber-500"
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
