"use client"

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { PhaseCountdown } from './PhaseCountdown'

/**
 * GRAND CHIFFRE DU LANCEMENT (« 3, 2, 1 ») — la seule variante animée.
 *
 * Séparée de PhaseCountdown parce qu'elle est la seule à tirer framer-motion,
 * et que PhaseCountdown est monté sur le hub (bandeau « reprendre ma place »
 * de RejoinBanner) : y lier la bibliothèque d'animation coûtait 40 Ko gz à la
 * page ouverte entre chaque partie, pour afficher un nombre de secondes. Ici,
 * seuls les jeux en ligne l'importent — et ils embarquent déjà framer-motion.
 *
 * Même horloge que le texte (réveil au changement de seconde, par le rendu
 * personnalisé de PhaseCountdown). Jamais « 0 » : la phase suivante arrive
 * avant que le joueur ne le lise. Animations réduites : le chiffre change
 * en fondu, sans le zoom qui bondit chaque seconde.
 */
export function PhaseCountdownLaunch({
  endsAt,
  className,
}: {
  /** Échéance serveur (epoch ms) du lancement. */
  endsAt: number | null | undefined
  /** Classes du chiffre (taille, couleur du jeu). */
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <PhaseCountdown endsAt={endsAt}>
      {({ seconds }) => {
        const secondsLeft = Math.max(1, seconds)
        return (
          <AnimatePresence mode="popLayout">
            <motion.span
              key={secondsLeft}
              initial={reduceMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { scale: 1.6, opacity: 0 }}
              transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 20 }}
              className={className}
            >
              {secondsLeft}
            </motion.span>
          </AnimatePresence>
        )
      }}
    </PhaseCountdown>
  )
}
