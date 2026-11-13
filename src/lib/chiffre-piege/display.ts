/**
 * Logique d'affichage du Chiffre Piégé, sans React : lecture du champ de
 * saisie et position de l'intervalle sur la barre 1 → max. Elle ne lit que la
 * vue publique (jamais le piège), comme l'écran.
 */

/** Trois chiffres suffisent : la plus grande plage s'arrête à 200. */
export const CHIFFRE_PIEGE_INPUT_MAX_LENGTH = 3

/** Garde les chiffres seuls (collage, clavier complet, signes) et coupe à la longueur utile. */
export function sanitizeChiffrePiegeInput(raw: string): string {
  return raw.replace(/\D+/g, '').slice(0, CHIFFRE_PIEGE_INPUT_MAX_LENGTH)
}

export type ChiffrePiegeInput =
  | { status: 'empty' }
  | { status: 'out-of-range'; value: number }
  | { status: 'ok'; value: number }

/** Ce que vaut la saisie pour l'intervalle ouvert [low, high]. */
export function readChiffrePiegeInput(raw: string, low: number, high: number): ChiffrePiegeInput {
  const digits = sanitizeChiffrePiegeInput(raw)
  if (!digits) return { status: 'empty' }
  const value = Number.parseInt(digits, 10)
  return value >= low && value <= high ? { status: 'ok', value } : { status: 'out-of-range', value }
}

/** Zone encore possible sur la barre 1 → max, en pourcentage de sa largeur. */
export function chiffrePiegeZone(view: { low: number; high: number; max: number }): { left: number; width: number } {
  return {
    left: ((view.low - 1) / view.max) * 100,
    width: ((view.high - view.low + 1) / view.max) * 100,
  }
}

/** Milieu de la case d'un nombre sur la même barre (repère de la saisie en cours). */
export function chiffrePiegeMark(value: number, max: number): number {
  return ((value - 0.5) / max) * 100
}
