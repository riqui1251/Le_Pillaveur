/**
 * Les 12 questions du fil de l'Espion et leurs réponses possibles, en codes
 * communs aux 4 langues (textes sous games.espion.game.qa : `qa.<question>.q`
 * et `.q_2`, `qa.<question>.<valeur>` à `_3`, `qa.any` à `_3`).
 *
 * Sûr côté client : aucun lieu ici. Le carnet qui relie chaque lieu à ses
 * réponses (data/attributes) reste au serveur, car il donnerait à un espion
 * humain un filtre exact contre les autres humains.
 */
export const ESPION_QUESTIONS = {
  where: ['inside', 'outside'],
  when: ['day', 'night'],
  price: ['free', 'cheap', 'pricey'],
  outfit: ['casual', 'smart', 'uniform', 'swim'],
  noise: ['quiet', 'loud'],
  food: ['meal', 'snack', 'none'],
  crowd: ['few', 'crowd'],
  company: ['alone', 'friends', 'family', 'work'],
  stay: ['minutes', 'hours', 'days'],
  moving: ['fixed', 'moving'],
  entry: ['open', 'ticket', 'restricted'],
  mood: ['fun', 'serious', 'tense'],
} as const satisfies Record<string, readonly string[]>

export type EspionQuestionId = keyof typeof ESPION_QUESTIONS

/** Ordre figé : celui du carnet, du brief des rédacteurs et des tirages de questions. */
export const ESPION_QUESTION_IDS = [
  'where',
  'when',
  'price',
  'outfit',
  'noise',
  'food',
  'crowd',
  'company',
  'stay',
  'moving',
  'entry',
  'mood',
] as const satisfies readonly EspionQuestionId[]

export type EspionValueOf<Q extends EspionQuestionId> = (typeof ESPION_QUESTIONS)[Q][number]
export type EspionValue = EspionValueOf<EspionQuestionId>

/** « Ça dépend » : compatible avec tout, la réponse prudente de qui ne veut rien trahir. */
export const ESPION_ANY = 'any'
export type EspionAny = typeof ESPION_ANY
export type EspionAnswer = EspionValue | EspionAny

/** Une ligne du carnet : la réponse d'un lieu à chaque question, ou `any` quand elle dépend de la personne. */
export type EspionAttributes = { [Q in EspionQuestionId]: EspionValueOf<Q> | EspionAny }

export function isEspionQuestionId(id: unknown): id is EspionQuestionId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ESPION_QUESTIONS, id)
}

export function espionQuestionValues(questionId: EspionQuestionId): readonly EspionValue[] {
  return ESPION_QUESTIONS[questionId]
}

/** Réponse admise à `questionId` : une de ses valeurs, ou `any`. */
export function isEspionAnswerFor(questionId: EspionQuestionId, value: unknown): value is EspionAnswer {
  if (value === ESPION_ANY) return true
  return typeof value === 'string' && (ESPION_QUESTIONS[questionId] as readonly string[]).includes(value)
}
