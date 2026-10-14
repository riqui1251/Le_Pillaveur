import type { ImposteurLang, ImposteurWordPair } from '../../engine'
import { IMPOSTEUR_CLUES_FR } from './fr'
import { IMPOSTEUR_CLUES_EN } from './en'
import { IMPOSTEUR_CLUES_ES } from './es'
import { IMPOSTEUR_CLUES_IT } from './it'

/**
 * ⚠️ SERVER-ONLY : le catalogue d'indices des bots révèle l'autre mot de
 * chaque paire. Jamais importé par un composant, une vue ni la couche bot —
 * seul server-adapter.ts y accède, par `imposteurClueListFor`, qui ne rend
 * que la liste du mot demandé (clues.test.ts, règle 8, vérifie les imports).
 *
 * Clé = `${a}|${b}` telle qu'écrite dans data/<lang>.ts (un même mot peut
 * figurer dans deux paires : fr « jogging », es « tormenta »). Chaque liste
 * est triée du plus VAGUE (partagé avec l'autre mot, en tête) au plus PRÉCIS :
 * le rang est la précision, bot-clue.ts s'y repère.
 */
export type ImposteurClueSet = { a: string[]; b: string[] }

export const IMPOSTEUR_CLUES: Partial<Record<ImposteurLang, Record<string, ImposteurClueSet>>> = {
  fr: IMPOSTEUR_CLUES_FR,
  en: IMPOSTEUR_CLUES_EN,
  es: IMPOSTEUR_CLUES_ES,
  it: IMPOSTEUR_CLUES_IT,
}

/**
 * Langues dont les 8 lots sont remplis : le validateur y exige une entrée par
 * paire. Une langue absente d'ici peut rester partielle (repli « … »).
 */
export const IMPOSTEUR_CLUES_COMPLETE: ImposteurLang[] = ['fr', 'en', 'it', 'es']

export function imposteurClueKey(pair: ImposteurWordPair): string {
  return `${pair.a}|${pair.b}`
}

/**
 * Liste de `word` dans `table`, en essayant `a|b` puis `b|a`. Seule la liste
 * du mot demandé sort d'ici — l'autre reste dans le catalogue.
 */
export function clueListIn(
  table: Record<string, ImposteurClueSet>,
  pair: ImposteurWordPair,
  word: string
): string[] | null {
  const direct = table[imposteurClueKey(pair)]
  if (direct) {
    if (word === pair.a) return [...direct.a]
    if (word === pair.b) return [...direct.b]
    return null
  }
  const flipped = table[imposteurClueKey({ a: pair.b, b: pair.a })]
  if (flipped) {
    if (word === pair.b) return [...flipped.a]
    if (word === pair.a) return [...flipped.b]
  }
  return null
}

/** Indices de `word` pour la paire, dans la langue de la partie ; null si absente du catalogue. */
export function imposteurClueListFor(
  lang: ImposteurLang,
  pair: ImposteurWordPair,
  word: string
): string[] | null {
  const table = IMPOSTEUR_CLUES[lang]
  return table ? clueListIn(table, pair, word) : null
}
