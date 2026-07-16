/**
 * Ids des jeux disposant d'une page règles (/regles/<id>) — module sans
 * dépendance serveur, importable côté client (guichet, landing…).
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
  '1220',
  'sans-filtre',
] as const

export type RulesGameId = (typeof RULES_GAME_IDS)[number]

export function isRulesGameId(id: string): id is RulesGameId {
  return (RULES_GAME_IDS as readonly string[]).includes(id)
}
