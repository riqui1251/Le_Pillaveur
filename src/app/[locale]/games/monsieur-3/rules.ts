/**
 * Règles d'un lancer de Monsieur 3, en fonctions pures : l'écran en tire le
 * verdict (qui boit, qui relance), la mise en évidence des dés et le libellé
 * du bouton, sans dupliquer les conditions.
 */

export interface DiceRoll { dice1: number; dice2: number }

/** Ce qui fait boire Monsieur 3 — sommes 5 et 8 d'abord, elles imposent aussi un geste. */
export type DrinkTrigger = 'three' | 'five' | 'sum3' | 'sum5' | 'sum8'

export interface PlayOutcome {
  /** Monsieur 3 a lancé sans rien déclencher : la partie s'arrête. */
  endsGame: boolean
  /** Monsieur 3 boit une gorgée (un 3 ou un 5 sur un dé, ou une somme de 3, 5 ou 8). */
  m3Drinks: boolean
  trigger: DrinkTrigger | null
  /** Double : le lanceur choisit un duel. */
  double: boolean
  /** Une règle est tombée : le même joueur relance. */
  rollAgain: boolean
}

export function playOutcome({ dice1, dice2 }: DiceRoll, rollerIsM3: boolean): PlayOutcome {
  const sum = dice1 + dice2
  const double = dice1 === dice2
  const m3Drinks =
    dice1 === 3 || dice2 === 3 || dice1 === 5 || dice2 === 5 || sum === 3 || sum === 5 || sum === 8
  const rollAgain = m3Drinks || double
  if (rollerIsM3 && !rollAgain) {
    return { endsGame: true, m3Drinks: false, trigger: null, double: false, rollAgain: false }
  }
  let trigger: DrinkTrigger | null = null
  if (m3Drinks) {
    if (sum === 5) trigger = 'sum5'
    else if (sum === 8) trigger = 'sum8'
    else if (dice1 === 3 || dice2 === 3) trigger = 'three'
    else if (dice1 === 5 || dice2 === 5) trigger = 'five'
    else trigger = 'sum3'
  }
  return { endsGame: false, m3Drinks, trigger, double, rollAgain }
}

/** Nombre de dés qui montrent `face`. */
export function countFace({ dice1, dice2 }: DiceRoll, face: number): number {
  return (dice1 === face ? 1 : 0) + (dice2 === face ? 1 : 0)
}

/** `drink` : le dé fait boire Monsieur 3 ; `duel` : il forme un double ; null : neutre. */
export type DieTone = 'drink' | 'duel' | null

/**
 * Dés à cercler : ceux qui déclenchent la règle. Une somme (3, 5, 8) engage
 * les deux dés ; sinon seul le 3 ou le 5 compte, et un double sans autre
 * règle cercle les deux dés pour le duel.
 */
export function diceTones(dice: DiceRoll, outcome: PlayOutcome): [DieTone, DieTone] {
  if (outcome.endsGame) return [null, null]
  if (outcome.trigger === 'sum3' || outcome.trigger === 'sum5' || outcome.trigger === 'sum8') {
    return ['drink', 'drink']
  }
  const tone = (value: number): DieTone =>
    value === 3 || value === 5 ? 'drink' : outcome.double ? 'duel' : null
  return [tone(dice.dice1), tone(dice.dice2)]
}
