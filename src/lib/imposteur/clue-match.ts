import { normalizeClue } from './engine'

/**
 * Rapprochement d'un indice avec une liste d'indices connus (pour un bot : la
 * liste de SON mot). Tolérant comme une oreille à table : accents, majuscules,
 * apostrophe courbe, pluriel et petites variantes passent ; « port » ne vaut
 * pas « sport », « la » ne vaut pas « plage ».
 */

/**
 * Longueur minimale d'une sous-chaîne ou d'une racine commune pour compter :
 * à 4, « port » ⊂ « sport » et « vin » ⊂ « vinaigre » rapprocheraient des
 * indices qui n'ont rien à voir.
 */
const MIN_STEM = 5

/**
 * Forme canonique d'un indice : normalisation moteur (minuscules, sans
 * accents), apostrophe droite, espaces / tirets / soulignés réduits à un
 * espace.
 */
export function clueKey(text: string): string {
  return normalizeClue(text)
    .replace(/[’‘`´]/g, "'")
    .replace(/[\s\-–—_]+/g, ' ')
    .trim()
}

/** Même racine : « vagues » ↔ « vague », « nageuse » ↔ « nageurs ». */
function sameStem(a: string, b: string): boolean {
  const n = Math.max(MIN_STEM, Math.min(a.length, b.length) - 2)
  return a.length >= n && b.length >= n && a.slice(0, n) === b.slice(0, n)
}

function alike(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= MIN_STEM && b.includes(a)) return true
  if (b.length >= MIN_STEM && a.includes(b)) return true
  return sameStem(a, b)
}

/** Vrai si `text` « dit la même chose » qu'un indice de `list`. */
export function clueMatches(text: string, list: readonly string[]): boolean {
  const key = clueKey(text)
  if (key.length === 0) return false
  return list.some((item) => alike(key, clueKey(item)))
}
