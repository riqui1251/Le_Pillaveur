"use client"

/** Couleurs de la table « Cartes sur Table » (mêmes que EndConfetti). */
const COLORS = ['#D9A441', '#E8C373', '#F3EAD3', '#B3382E', '#274B8F']

/**
 * Deux salves pour l'addition. canvas-confetti n'est chargée qu'ici, à la
 * demande : rien dans le morceau de la page tant que la soirée n'est pas finie.
 */
export function celebrate(): void {
  if (typeof window === 'undefined') return
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  } catch {
    // matchMedia absent : on fête quand même.
  }
  void import('canvas-confetti')
    .then(({ default: confetti }) => {
      confetti({ particleCount: 90, spread: 70, startVelocity: 42, origin: { y: 0.25 }, colors: COLORS })
      window.setTimeout(() => confetti({ particleCount: 60, spread: 110, startVelocity: 32, origin: { y: 0.3 }, colors: COLORS, scalar: 0.9 }), 260)
    })
    .catch(() => {})
}
