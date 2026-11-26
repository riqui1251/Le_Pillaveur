import { soireeGameColors } from '@/lib/soiree/catalog'

/**
 * Les couleurs de l'ardoise, à part de soiree-ui : le classement des gorgées
 * (SiteDrinkRanking) les lit aussi sur /classement, sans y tirer tout le Mode
 * Soirée ni ses textes.
 */

/** Or, argent, bronze : le podium de l'ardoise. */
export const MEDALS = [
  'linear-gradient(135deg, #F1D27A, #D9A441)',
  'linear-gradient(135deg, #EDEDED, #A9B0B8)',
  'linear-gradient(135deg, #E3A86B, #B0703A)',
] as const

/** Le dégradé du jeu (ses deux couleurs), pour un fond, une bande ou une barre. */
export function gameGradient(gameId: string, angle = 135): string {
  const { from, to } = soireeGameColors(gameId)
  return `linear-gradient(${angle}deg, ${from}, ${to})`
}
