import { decimalSeparatorFor } from './input'

/**
 * Nombres affichés par À Vue de Nez (jeu local, téléphone en ligne, TV) :
 * estimations, réponses, bornes de la règle et scores passent tous par ici.
 */

/** En dessous, pas de séparateur de milliers : « 1789 » est une année, pas « 1 789 ». */
const GROUPING_FROM = 10_000

export type VdnNumberFormats = {
  full: (value: number) => string
  /** Étiquettes de la règle : 1,2 M plutôt que 1 200 000 au-dessus d'un jeton. */
  short: (value: number) => string
  /** Séparateur décimal de la langue, pour lire la saisie. */
  decimal: string
}

/**
 * Intl écrit « -4 » avec un trait d'union dans les quatre langues, alors que
 * les textes du jeu portent le vrai signe moins (« −1 point ») : sans ce
 * passage, la révélation et le classement d'une même partie divergeaient.
 */
export function withTypographicMinus(formatted: string): string {
  return formatted.replace(/-/g, '−')
}

export function createVdnNumberFormats(locale: string): VdnNumberFormats {
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 })
  const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false })
  let compact = grouped
  try {
    compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
  } catch {
    // Navigateur sans notation compacte : le nombre entier reste lisible.
  }
  const full = (value: number) => withTypographicMinus((Math.abs(value) >= GROUPING_FROM ? grouped : plain).format(value))
  return {
    full,
    short: (value: number) => (Math.abs(value) >= GROUPING_FROM ? withTypographicMinus(compact.format(value)) : full(value)),
    decimal: decimalSeparatorFor(locale),
  }
}
