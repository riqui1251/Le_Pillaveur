import type { VdnQuestionMeta } from './data/types'

/**
 * Unité affichée derrière un nombre de la question (réponse, estimation, champ
 * de saisie, TV). Une année de notre ère se lit seule : « 1959 », jamais
 * « 1959 année ». Avant notre ère, l'unité porte l'ère et reste : « 753 av. J.-C. ».
 * La banque garde son « année » : server-adapter.test.ts y recoupe les
 * drapeaux `year` de la méta. Seul l'affichage la tait.
 */
export function vdnShownUnit(unit: string, question: Pick<VdnQuestionMeta, 'year' | 'bce'>): string {
  return question.year === true && question.bce !== true ? '' : unit
}
