/** Règles du jeu 1220 : dé 12 + dé 20, somme de 2 à 32. */

export type Parity1220 = 'pair' | 'impair'
export type Band1220 = '2-10' | '11-20' | '21-30'

export interface Choices1220 {
  parity: Parity1220
  band: Band1220
  /** Chiffre « fait boire » : si somme = ce chiffre, le joueur boit. */
  drinkNumber: number
  /** Chiffre « donne à boire » : si somme = ce chiffre, le joueur distribue (en plus des autres déclencheurs). */
  giveNumber: number
}

/**
 * Raison de distribuer : un identifiant, jamais une phrase. Le moteur écrivait
 * ses raisons en français (« Somme dans ta plage ») et l'écran les glissait
 * telles quelles dans une phrase traduite : la table anglaise lisait du
 * français au cœur du résultat. L'écran traduit à partir de la somme.
 */
export type GiveReasonId1220 = 'band' | 'parity' | 'giveNum'

export interface GiveReason1220 {
  id: GiveReasonId1220
}

export interface PlayerRollResult1220 {
  drinkSips: number
  giveReasons: GiveReason1220[]
  giveRawCount: number
  /** Gorgées à distribuer après règle « moitié » (nombre sur un dé mais pas en somme). */
  giveEffective: number
  partialHit: boolean
  partialNumbers: number[]
}

export const TOTAL_MIN = 2
export const TOTAL_MAX = 12 + 20

export const BANDS_1220: readonly Band1220[] = ['2-10', '11-20', '21-30']

export function bandContains(band: Band1220, total: number): boolean {
  switch (band) {
    case '2-10':
      return total >= 2 && total <= 10
    case '11-20':
      return total >= 11 && total <= 20
    case '21-30':
      return total >= 21 && total <= 30
    default:
      return false
  }
}

/** Plage qui contient la somme (31 et 32 n'en ont aucune). */
export function bandOf(total: number): Band1220 | null {
  return BANDS_1220.find((b) => bandContains(b, total)) ?? null
}

/** Un des chiffres du joueur est sorti sur le dé 12 ou 20, mais la somme n’est pas ce chiffre. */
export function hasPartialDieHit(
  d12: number,
  d20: number,
  total: number,
  drinkNumber: number,
  giveNumber: number
): { partial: boolean; numbers: number[] } {
  const nums = [drinkNumber, giveNumber]
  const hit = nums.filter(n => (d12 === n || d20 === n) && total !== n)
  return { partial: hit.length > 0, numbers: hit }
}

export function evaluatePlayerRoll1220(
  d12: number,
  d20: number,
  c: Choices1220
): PlayerRollResult1220 {
  const total = d12 + d20
  const giveReasons: GiveReason1220[] = []

  if (bandContains(c.band, total)) giveReasons.push({ id: 'band' })

  const isEven = total % 2 === 0
  const parityOk =
    (isEven && c.parity === 'pair') || (!isEven && c.parity === 'impair')
  if (parityOk) giveReasons.push({ id: 'parity' })

  if (total === c.giveNumber) giveReasons.push({ id: 'giveNum' })

  const drinkSips = total === c.drinkNumber ? 1 : 0
  const { partial, numbers } = hasPartialDieHit(
    d12,
    d20,
    total,
    c.drinkNumber,
    c.giveNumber
  )

  const giveRawCount = giveReasons.length
  const giveEffective =
    partial && giveRawCount > 0 ? giveRawCount / 2 : giveRawCount

  return {
    drinkSips,
    giveReasons,
    giveRawCount,
    giveEffective,
    partialHit: partial,
    partialNumbers: numbers,
  }
}
