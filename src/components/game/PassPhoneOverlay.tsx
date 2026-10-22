"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { playGameSound } from '@/lib/sound/game-sounds'

/** Durée du flash (ms) : le temps de lire un nom et de tendre le téléphone. */
const FLASH_MS = 1100

export type PassPhoneOverlayProps = {
  /**
   * Identifiant du joueur au tour — le flash part quand il CHANGE d'un joueur
   * à un autre. Jamais pour la première clé non nulle (montage, joueurs
   * chargés après coup), ni pour un retour de null à la même clé.
   */
  playerKey: string | null | undefined
  /** Nom du joueur à qui passer le téléphone. */
  name: string
  /** Avatar du joueur (glyphe, emoji ou portrait). */
  avatar?: ReactNode
  /** Faux : aucun flash (partie finie, écran de résultat…). Le changement de joueur est quand même noté. */
  enabled?: boolean
}

/**
 * « PASSE LE TÉLÉPHONE À … » — flash plein écran des jeux LOCAUX.
 *
 * Un seul téléphone circule : quand le joueur au tour change, le nom ne
 * changeait qu'en 16 px au milieu de l'écran, et c'était souvent le mauvais
 * joueur qui appuyait. Le flash (~1,1 s, son de tour) dit à qui tendre le
 * téléphone ; un toucher le ferme plus tôt. Cousin local de TurnOverlay
 * (Petit Buveur), sans la vibration : le téléphone est encore dans la main
 * de celui qui vient de jouer.
 */
export function PassPhoneOverlay({ playerKey, name, avatar, enabled = true }: PassPhoneOverlayProps) {
  const t = useTranslations('gameUi.passPhone')
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(false)
  // Dernier VRAI joueur vu (jamais null) : le flash ne part qu'à un vrai
  // changement. La première clé non nulle sert de point de départ — les
  // joueurs locaux se chargent après le montage (usePlayers part de []), une
  // clé absente puis posée n'est pas un passage de téléphone.
  const lastKeyRef = useRef<string | null>(null)
  // En ref : un joueur rapide refait changer la clé avant la fin du flash,
  // le minuteur doit survivre à la ré-exécution de l'effet.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
      setVisible(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!playerKey) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
      setVisible(false)
      return
    }
    if (playerKey === lastKeyRef.current) return
    const first = lastKeyRef.current === null
    lastKeyRef.current = playerKey
    if (first || !enabled) return

    setVisible(true)
    playGameSound('turn')
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      setVisible(false)
    }, FLASH_MS)
  }, [playerKey, enabled])

  const close = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
    setVisible(false)
  }

  return (
    // Région vivante montée en permanence : un lecteur d'écran annonce le
    // nom quand le flash s'y insère (une région créée avec son contenu est
    // souvent tue). Elle est elle-même en `fixed`, hors du flux : vide, une
    // div ordinaire comptait pour un élément dans le `gap` d'un parent flex.
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-[115]">
      <AnimatePresence>
        {visible && (
          <motion.button
            key={playerKey ?? ''}
            type="button"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 bg-felt-deep/95 px-6 text-center text-cream focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-gold"
          >
            <span className="sr-only">{t('label', { name })}</span>
            <motion.span
              aria-hidden
              initial={reduced ? false : { scale: 0.8, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 22 }}
              className="flex flex-col items-center gap-4"
            >
              <span className="text-base font-semibold text-cream/80">{t('lead')}</span>
              {avatar != null && (
                <span className="flex h-20 w-20 items-center justify-center text-6xl leading-none">{avatar}</span>
              )}
              <span className="max-w-full break-words font-display text-3xl font-bold leading-tight text-cream">
                {name}
              </span>
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
