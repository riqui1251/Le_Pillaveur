import { getCaseTypePool } from '@/lib/petit-buveur/case-generator'

export type CaseType =
  | 'normal'
  | 'defi'
  | 'gorgée'
  | 'recul'
  | 'avance'
  | 'tous'
  | 'roue'
  | 'echange'
  | 'bombe'
  | 'protection'
  | 'malediction'
  | 'chance'
  | 'repetition'
  | 'miroir'
  | 'defi-chaine'
  | 'piege'
  | 'melange'
  | 'passe-tour'
  | 'double-peine'
  | 'solo'
  | 'copie'
  | 'roulette-russe'
  | 'teleport'
  | 'grappin'
  | 'ancre'
  | 'case-bonus'
  | 'recul-groupe'
  | 'pont'
  | 'question'
  | 'vote'
  | 'miroir-inverse'
  | 'rewind'
  | 'loterie'
  | 'inversion'
  | 'double-case'
  | 'roue-defis'
  | 'de-honte'
  | 'pile-face'

export type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

export interface Case {
  type: CaseType
  /** @deprecated Derived at render via formatCaseDescription — not persisted */
  description?: string
  effect: number
  defiChallenge?: string
  gorgéeCulSec?: boolean
}

export type PetitBuveurT = {
  (key: string, values?: Record<string, string | number>): string
  raw: (key: string) => unknown
  /** Fourni par next-intl : permet de retomber sur la clé alcoolisée quand la variante Soft manque. */
  has?: (key: string) => boolean
}

const difficultyMultipliers: Record<Difficulty, number> = {
  facile: 1,
  normal: 2,
  difficile: 3,
  extreme: 4,
}

type DefiItem = { text: string; drinks: number; verifiableOnline?: boolean }

function getDefis(t: PetitBuveurT): DefiItem[] {
  return t.raw('defis') as DefiItem[]
}

export function getOnlineVerifiableDefis(t: PetitBuveurT): DefiItem[] {
  return getDefis(t).filter((defi) => defi.verifiableOnline !== false)
}

export function getDefiWheelChallenges(t: PetitBuveurT): string[] {
  return t.raw('defiWheelChallenges') as string[]
}

export function getCaseTypeLabel(type: CaseType, t: PetitBuveurT): string {
  return t(`caseTypes.${type}`)
}

/** Même pondération par difficulté que le moteur en ligne (roue des défis comprise). */
export function pickCaseType(
  difficulty: Difficulty = 'normal',
  exclude?: Iterable<CaseType>,
): CaseType {
  const pool = getCaseTypePool(difficulty, exclude ? new Set(exclude) : undefined)
  if (pool.length === 0) return 'normal'
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const entry of pool) {
    r -= entry.weight
    if (r <= 0) return entry.type
  }
  return pool[pool.length - 1].type
}

/** Cases sans choix de cible (résolues au lancer / après le dé) */
export const CASES_NO_TARGET = new Set<CaseType>([
  'solo',
  'case-bonus',
  'recul-groupe',
  'grappin',
  'pont',
  'loterie',
])

/** Ouvre une modale dédiée avant effet */
export const CASES_SPECIAL_MODAL = new Set<CaseType>([
  'roue',
  'roue-defis',
  'de-honte',
  'pile-face',
  'teleport',
  'vote',
  'chance',
  'echange',
  'defi-chaine',
  'double-case',
])

export function generateCase(
  difficulty: Difficulty,
  t: PetitBuveurT,
  exclude?: Iterable<CaseType>,
): Case {
  const type = pickCaseType(difficulty, exclude)
  const multiplier = difficultyMultipliers[difficulty]

  switch (type) {
    case 'normal':
      return { type, effect: 0 }
    case 'gorgée': {
      const baseGorgees = Math.floor(Math.random() * 3) + 1
      let finalDrinks = baseGorgees * multiplier
      if (difficulty === 'difficile' && finalDrinks > 8) finalDrinks = 8
      const gorgéeCulSec = difficulty === 'extreme' && finalDrinks >= 12
      return { type, effect: finalDrinks, gorgéeCulSec }
    }
    case 'defi': {
      const defis = getDefis(t)
      const defi = defis[Math.floor(Math.random() * defis.length)]
      const drinks = Math.min(defi.drinks * multiplier, 4)
      return {
        type,
        effect: drinks,
        defiChallenge: defi.text,
      }
    }
    case 'recul':
      return { type, effect: -1 }
    case 'avance':
      return { type, effect: 1 }
    case 'tous': {
      const drinks = Math.min((Math.floor(Math.random() * 2) + 1) * multiplier, 3)
      return { type, effect: drinks }
    }
    case 'roue':
      return { type, effect: 0 }
    case 'roue-defis':
      return { type, effect: 0 }
    case 'de-honte':
      return { type, effect: 0 }
    case 'pile-face':
      return { type, effect: 0 }
    case 'echange':
      return { type, effect: 0 }
    case 'bombe':
      return { type, effect: 2 }
    case 'protection':
      return { type, effect: 0 }
    case 'malediction':
      return { type, effect: 3 }
    case 'chance':
      return { type, effect: 0 }
    case 'repetition':
      return { type, effect: 0 }
    case 'miroir':
      return { type, effect: 0 }
    case 'defi-chaine':
      return { type, effect: 5 }
    case 'piege':
      return { type, effect: 0 }
    case 'melange':
      return { type, effect: 0 }
    case 'passe-tour':
      return { type, effect: 0 }
    case 'double-peine': {
      const drinks = Math.min((Math.floor(Math.random() * 3) + 2) * multiplier, 8)
      return { type, effect: drinks }
    }
    case 'solo':
      return { type, effect: 1 }
    case 'copie':
      return { type, effect: 0 }
    case 'roulette-russe':
      return { type, effect: 6 }
    case 'teleport':
      return { type, effect: 0 }
    case 'grappin':
      return { type, effect: 0 }
    case 'ancre':
      return { type, effect: 0 }
    case 'case-bonus':
      return { type, effect: 1 }
    case 'recul-groupe':
      return { type, effect: -1 }
    case 'pont':
      return { type, effect: 0 }
    case 'question': {
      const drinks = Math.min(2 * multiplier, 4)
      return { type, effect: drinks }
    }
    case 'vote': {
      const drinks = Math.min((Math.floor(Math.random() * 2) + 2) * multiplier, 5)
      return { type, effect: drinks }
    }
    case 'miroir-inverse':
      return { type, effect: 1 }
    case 'rewind':
      return { type, effect: 0 }
    case 'loterie':
      return { type, effect: 0 }
    case 'inversion': {
      const drinks = Math.min((Math.floor(Math.random() * 2) + 1) * multiplier, 4)
      return { type, effect: drinks }
    }
    case 'double-case':
      return { type, effect: 0 }
    default:
      return { type: 'normal', effect: 0 }
  }
}
