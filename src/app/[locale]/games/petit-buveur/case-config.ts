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
}

const difficultyMultipliers: Record<Difficulty, number> = {
  facile: 1,
  normal: 2,
  difficile: 3,
  extreme: 4,
}

/** Poids relatifs — cases courantes un peu plus fréquentes */
const CASE_TYPE_POOL: { type: CaseType; weight: number }[] = [
  { type: 'gorgée', weight: 7 },
  { type: 'defi', weight: 5 },
  { type: 'normal', weight: 4 },
  { type: 'recul', weight: 3 },
  { type: 'avance', weight: 3 },
  { type: 'tous', weight: 3 },
  { type: 'roue', weight: 2 },
  { type: 'echange', weight: 2 },
  { type: 'bombe', weight: 2 },
  { type: 'protection', weight: 2 },
  { type: 'malediction', weight: 2 },
  { type: 'chance', weight: 2 },
  { type: 'repetition', weight: 2 },
  { type: 'miroir', weight: 2 },
  { type: 'defi-chaine', weight: 2 },
  { type: 'piege', weight: 2 },
  { type: 'melange', weight: 2 },
  { type: 'passe-tour', weight: 2 },
  { type: 'double-peine', weight: 2 },
  { type: 'solo', weight: 2 },
  { type: 'copie', weight: 2 },
  { type: 'roulette-russe', weight: 2 },
  { type: 'teleport', weight: 2 },
  { type: 'grappin', weight: 2 },
  { type: 'ancre', weight: 2 },
  { type: 'case-bonus', weight: 2 },
  { type: 'recul-groupe', weight: 2 },
  { type: 'pont', weight: 2 },
  { type: 'question', weight: 2 },
  { type: 'vote', weight: 2 },
  { type: 'miroir-inverse', weight: 2 },
  { type: 'rewind', weight: 2 },
  { type: 'loterie', weight: 2 },
  { type: 'inversion', weight: 2 },
  { type: 'double-case', weight: 1 },
  { type: 'roue-defis', weight: 2 },
  { type: 'de-honte', weight: 2 },
  { type: 'pile-face', weight: 2 },
]

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

export function pickCaseType(): CaseType {
  const total = CASE_TYPE_POOL.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const entry of CASE_TYPE_POOL) {
    r -= entry.weight
    if (r <= 0) return entry.type
  }
  return 'gorgée'
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

export function generateCase(difficulty: Difficulty, t: PetitBuveurT): Case {
  const type = pickCaseType()
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
