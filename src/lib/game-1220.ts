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

export interface GiveReason1220 {
  id: string
  label: string
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

  if (bandContains(c.band, total)) {
    giveReasons.push({
      id: 'band',
      label: `Somme dans ta plage (${formatBand(c.band)})`,
    })
  }

  const isEven = total % 2 === 0
  const parityOk =
    (isEven && c.parity === 'pair') || (!isEven && c.parity === 'impair')
  if (parityOk) {
    giveReasons.push({
      id: 'parity',
      label: `Parité (${c.parity === 'pair' ? 'pair' : 'impair'})`,
    })
  }

  if (total === c.giveNumber) {
    giveReasons.push({
      id: 'giveNum',
      label: `Somme = chiffre donne à boire (${c.giveNumber})`,
    })
  }

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

function formatBand(b: Band1220): string {
  if (b === '2-10') return '2–10'
  if (b === '11-20') return '11–20'
  return '21–30'
}

export function formatSips(n: number): string {
  if (Number.isInteger(n)) return `${n}`
  return n.toFixed(1).replace('.', ',')
}
