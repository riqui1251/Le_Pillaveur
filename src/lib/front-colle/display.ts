/**
 * Mise en page du mot sur la carte (PUR, testé dans display.test.ts) : il se
 * lit de loin, sur un téléphone collé au front, donc le plus grand possible
 * sans jamais déborder. Coupures aux espaces seulement, en 1 à 3 lignes.
 */

/** Largeur moyenne d'un caractère de Playfair Display gras, en em (marge comprise). */
export const WORD_CHAR_EM = 0.62
/** Hauteur d'une ligne, en em (interligne serré du mot). */
export const WORD_LINE_EM = 1.1
export const WORD_MIN_PX = 14
const MAX_LINES = 3

/** Longueur (en caractères) de la plus longue ligne, au mieux, en coupant `word` en `lines` lignes au plus. */
export function balancedLineLength(word: string, lines: number): number {
  const tokens = word.split(/\s+/).filter((token) => token.length > 0)
  if (tokens.length === 0) return 0
  const memo = new Map<string, number>()
  const best = (start: number, left: number): number => {
    const key = `${start}:${left}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    let length = -1
    let result = Number.POSITIVE_INFINITY
    for (let end = start; end < tokens.length; end += 1) {
      length += tokens[end].length + 1
      const rest = end === tokens.length - 1 ? 0 : left > 1 ? best(end + 1, left - 1) : Number.POSITIVE_INFINITY
      result = Math.min(result, Math.max(length, rest))
    }
    memo.set(key, result)
    return result
  }
  return best(0, Math.max(1, lines))
}

/** Taille de police (px) du mot pour une boîte `boxW` × `boxH`, plafonnée à `maxPx`. */
export function fitWordFontPx(word: string, boxW: number, boxH: number, maxPx: number): number {
  const tokens = word.split(/\s+/).filter((token) => token.length > 0)
  if (tokens.length === 0 || boxW <= 0 || boxH <= 0) return Math.max(WORD_MIN_PX, maxPx)
  let best = 0
  for (let lines = 1; lines <= Math.min(MAX_LINES, tokens.length); lines += 1) {
    const longest = balancedLineLength(word, lines)
    const used = Math.min(lines, tokens.length)
    const size = Math.min(boxW / (longest * WORD_CHAR_EM), boxH / (used * WORD_LINE_EM))
    best = Math.max(best, size)
  }
  return Math.floor(Math.max(WORD_MIN_PX, Math.min(maxPx, best)))
}
