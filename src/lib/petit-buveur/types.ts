/**
 * Types du moteur Petit Buveur (serveur-autoritaire, déterministe).
 *
 * Découplés de la couche UI (`src/app/.../games/petit-buveur`) : le moteur est
 * une logique pure réutilisable côté serveur comme côté client. Les textes
 * (cases, défis) restent traduits côté client via next-intl à partir des
 * identifiants/index portés par l'état.
 */

export const BOARD_SIZE = 30

export type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

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

/** Case générée : type + effet numérique. Le texte d'un défi est résolu via `defiIndex`. */
export interface EngineCase {
  type: CaseType
  effect: number
  /** Index du défi dans la liste i18n `defis` (résolu en texte côté client). */
  defiIndex?: number
  /** Gorgée « cul sec » (difficulté extrême). */
  gorgeeCulSec?: boolean
}

/** Cases sans choix de cible — résolues automatiquement après le dé. */
export const CASES_NO_TARGET = new Set<CaseType>([
  'normal',
  'solo',
  'case-bonus',
  'recul-groupe',
  'grappin',
  'pont',
  'loterie',
])

/** Cases interactives ouvrant une modale dédiée (choix joueur requis). */
export const CASES_INTERACTIVE = new Set<CaseType>([
  'roue',
  'roue-defis',
  'de-honte',
  'pile-face',
  'teleport',
  'vote',
  'chance',
  'echange',
  'defi-chaine',
])

/** Cases interactives dont la modale désigne un joueur (`targetId`). */
export const CASES_INTERACTIVE_TARGET = new Set<CaseType>(['vote', 'echange', 'pile-face', 'defi-chaine'])

/** Cases où l'acteur ne peut pas être sa propre cible. */
export const CASES_NO_SELF_TARGET = new Set<CaseType>(['echange', 'defi-chaine'])

/**
 * Méta-cases : elles n'ont pas d'effet propre, elles en rejouent (Répétition,
 * Rewind) ou en enchaînent (Double case). Résolues à part par le moteur.
 */
export const CASES_META = new Set<CaseType>(['repetition', 'rewind', 'double-case'])

/**
 * Une case nécessite le choix d'une cible (joueur) si elle n'est ni auto-résolue
 * (no-target) ni interactive à modale. C'est le cœur du jeu : lancer le dé →
 * choisir une cible → l'effet s'applique à elle. Pour une méta-case, c'est la
 * case rejouée ou enchaînée qui décide : lire `pending.needsTarget`.
 */
export function needsTarget(caseType: CaseType): boolean {
  return (
    !CASES_NO_TARGET.has(caseType) && !CASES_INTERACTIVE.has(caseType) && !CASES_META.has(caseType)
  )
}
