/**
 * Ids des jeux disposant d'une page règles (/regles/<id>) — module sans
 * dépendance serveur, importable côté client (guichet, landing…). Jeux en
 * ligne d'abord, puis les jeux à boire sur un seul téléphone (sans version en
 * ligne) : « règles pyramide », « jeu du roi »… sont des recherches courantes.
 */
export const RULES_GAME_IDS = [
  'loup-garou',
  'imposteur',
  'quiz',
  'menteur',
  'petit-buveur',
  'toucher-coule',
  'bluff',
  'espion',
  'tabou',
  'crobard',
  'telephone-dessine',
  'purple',
  'blackjack',
  '1220',
  'sans-filtre',
  'mots-codes',
  'dilemmes',
  'petit-bac',
  'president',
  'chiffre-piege',
  'vue-de-nez',
  'patate-chaude',
  'pyramide',
  'coupe-du-roi',
  'pmu',
  'cap-ou-pas-cap',
  'hi-lo',
  'monsieur-3',
  'front-colle',
  'plinko',
  'pile-poil',
  'degaine',
  'doigt-du-destin',
] as const

export type RulesGameId = (typeof RULES_GAME_IDS)[number]

export function isRulesGameId(id: string): id is RulesGameId {
  return (RULES_GAME_IDS as readonly string[]).includes(id)
}
