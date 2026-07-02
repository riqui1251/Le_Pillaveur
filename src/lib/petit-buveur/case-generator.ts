import type { SeededRng } from './rng'
import type { CaseType, Difficulty, EngineCase } from './types'

/**
 * Génération de cases déterministe (RNG seedé) pour le moteur serveur-autoritaire.
 *
 * Reproduit fidèlement la logique de
 * `src/app/[locale]/games/petit-buveur/case-config.ts#generateCase`, mais :
 *  - tout l'aléatoire passe par le RNG injecté (reproductible) ;
 *  - aucune dépendance i18n : un défi est désigné par son `defiIndex`
 *    (le texte est résolu côté client), son nombre de gorgées est fourni
 *    via `defiDrinks` (donnée canonique, identique entre locales).
 *
 * Lors du rewire de `game.tsx` (LOT 2.4), le jeu local convergera vers ce générateur.
 */

const difficultyMultipliers: Record<Difficulty, number> = {
  facile: 1,
  normal: 2,
  difficile: 3,
  extreme: 4,
}

/** Poids relatifs — identiques à case-config.ts. */
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

export interface CaseGenContext {
  difficulty: Difficulty
  /** Boost joueur en pourcentage (0..100). 0 si aucun. */
  boostPercent?: number
  /** Nombre de gorgées par défi (donnée i18n canonique, par index). */
  defiDrinks: number[]
  /** Indices de défis autorisés au tirage (absent = tous). */
  defiAllowed?: number[]
}

export function pickCaseType(rng: SeededRng): CaseType {
  return rng.weightedPick(CASE_TYPE_POOL).type
}

export function generateCase(rng: SeededRng, ctx: CaseGenContext): EngineCase {
  const boost = ctx.boostPercent ?? 0
  if (boost > 0 && rng.next() * 100 < boost) {
    return { type: 'avance', effect: rng.int(1, 3) }
  }

  const type = pickCaseType(rng)
  const multiplier = difficultyMultipliers[ctx.difficulty]

  switch (type) {
    case 'normal':
      return { type, effect: 0 }
    case 'gorgée': {
      const base = rng.int(1, 3)
      let finalDrinks = base * multiplier
      if (ctx.difficulty === 'difficile' && finalDrinks > 8) finalDrinks = 8
      const gorgeeCulSec = ctx.difficulty === 'extreme' && finalDrinks >= 12
      return { type, effect: finalDrinks, gorgeeCulSec }
    }
    case 'defi': {
      // Tirage restreint aux défis autorisés (en ligne : vérifiables uniquement).
      const allowed = ctx.defiAllowed && ctx.defiAllowed.length > 0 ? ctx.defiAllowed : null
      const count = Math.max(1, allowed ? allowed.length : ctx.defiDrinks.length)
      const pick = rng.pickIndex(count)
      const idx = allowed ? allowed[pick] : pick
      const drinks = Math.min((ctx.defiDrinks[idx] ?? 1) * multiplier, 4)
      return { type, effect: drinks, defiIndex: idx }
    }
    case 'recul':
      return { type, effect: -1 }
    case 'avance':
      return { type, effect: 1 }
    case 'tous':
      return { type, effect: Math.min(rng.int(1, 2) * multiplier, 3) }
    case 'roue':
    case 'roue-defis':
    case 'de-honte':
    case 'pile-face':
    case 'echange':
      return { type, effect: 0 }
    case 'bombe':
      return { type, effect: 2 }
    case 'protection':
      return { type, effect: 0 }
    case 'malediction':
      return { type, effect: 3 }
    case 'chance':
    case 'repetition':
    case 'miroir':
      return { type, effect: 0 }
    case 'defi-chaine':
      return { type, effect: 5 }
    case 'piege':
    case 'melange':
    case 'passe-tour':
      return { type, effect: 0 }
    case 'double-peine':
      return { type, effect: Math.min(rng.int(2, 4) * multiplier, 8) }
    case 'solo':
      return { type, effect: 1 }
    case 'copie':
      return { type, effect: 0 }
    case 'roulette-russe':
      return { type, effect: 6 }
    case 'teleport':
    case 'grappin':
    case 'ancre':
      return { type, effect: 0 }
    case 'case-bonus':
      return { type, effect: 1 }
    case 'recul-groupe':
      return { type, effect: -1 }
    case 'pont':
      return { type, effect: 0 }
    case 'question':
      return { type, effect: Math.min(2 * multiplier, 4) }
    case 'vote':
      return { type, effect: Math.min(rng.int(2, 3) * multiplier, 5) }
    case 'miroir-inverse':
      return { type, effect: 1 }
    case 'rewind':
    case 'loterie':
      return { type, effect: 0 }
    case 'inversion':
      return { type, effect: Math.min(rng.int(1, 2) * multiplier, 4) }
    case 'double-case':
      return { type, effect: 0 }
    default:
      return { type: 'normal', effect: 0 }
  }
}
