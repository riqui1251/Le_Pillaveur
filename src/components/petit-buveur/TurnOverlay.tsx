"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { playGameSound } from '@/lib/sound/game-sounds'

/**
 * Flash plein écran au changement de tour — partagé local + online.
 *
 * S'affiche ~1,1 s quand `activeKey` change (pas au premier rendu). En ligne,
 * une courte vibration prévient le joueur quand c'est SON tour (mobile).
 */
export function TurnOverlay({
  activeKey,
  icon,
  name,
  isSelf = false,
  labelOf,
  labelSelf,
  delayMs = 0,
}: {
  /** Identifiant du joueur au tour — le flash se déclenche quand il change. */
  activeKey: string | null
  icon: ReactNode
  name: string
  isSelf?: boolean
  /** Libellé « Au tour de {name} » déjà interpolé. */
  labelOf: string
  /** Libellé « À toi de jouer ! » (prioritaire si isSelf). */
  labelSelf?: string
  /** Retarde le flash (laisse le temps de LIRE l'effet de la case précédente). */
  delayMs?: number
}) {
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(false)
  // Dernier joueur déjà annoncé : le flash ne part qu'à un VRAI changement
  // (pas au premier rendu, pas quand activeKey repasse par null puis revient).
  const lastKeyRef = useRef<string | null | undefined>(undefined)
  // Minuteurs en refs : ils doivent SURVIVRE aux re-exécutions de l'effet
  // (joueur rapide → activeKey rebouge avant la fin), sinon le flash reste
  // bloqué à l'écran ou ne part jamais. Nettoyés au démontage.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (lastKeyRef.current === undefined) {
      lastKeyRef.current = activeKey
      return
    }
    if (!activeKey) {
      // Le sujet du flash a disparu (dé lancé, partie finie…) : tout annuler.
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      hideTimerRef.current = null
      showTimerRef.current = null
      setVisible(false)
      return
    }
    if (activeKey === lastKeyRef.current) return
    lastKeyRef.current = activeKey

    const show = () => {
      showTimerRef.current = null
      setVisible(true)
      playGameSound('turn')
      if (isSelf) {
        try {
          navigator.vibrate?.(120)
        } catch {
          // vibration non supportée — silencieux
        }
      }
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setVisible(false), 1100)
    }

    if (showTimerRef.current) clearTimeout(showTimerRef.current)
    if (delayMs > 0) showTimerRef.current = setTimeout(show, delayMs)
    else show()
  }, [activeKey, isSelf, delayMs])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          className="pointer-events-none fixed inset-0 z-[115] flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <motion.div
            initial={reduced ? {} : { scale: 0.7, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 20 }}
            className={
              'flex flex-col items-center gap-3 rounded-3xl border px-8 py-6 shadow-2xl ' +
              (isSelf
                ? 'border-amber-400/50 bg-amber-500/15 shadow-amber-500/20'
                : 'border-white/15 bg-gray-900/90')
            }
          >
            <span className="flex h-16 w-16 items-center justify-center text-5xl leading-none" aria-hidden>
              {icon}
            </span>
            <div className="text-center">
              {isSelf && labelSelf ? (
                <p className="text-xl font-bold text-amber-200">{labelSelf}</p>
              ) : (
                <p className="text-lg font-bold text-white">{labelOf}</p>
              )}
              <p className="mt-0.5 max-w-[14rem] truncate text-sm text-white/60">{name}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
