/** Substitutions leet / chiffres courantes (FR/EN/ES/IT). */
const LEET_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  'à': 'a',
  'á': 'a',
  'â': 'a',
  'ä': 'a',
  'ã': 'a',
  '8': 'b',
  '©': 'c',
  'ç': 'c',
  '¢': 'c',
  '3': 'e',
  '€': 'e',
  'é': 'e',
  'è': 'e',
  'ê': 'e',
  'ë': 'e',
  '£': 'e',
  '6': 'g',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  'í': 'i',
  'ì': 'i',
  'î': 'i',
  'ï': 'i',
  '0': 'o',
  'ó': 'o',
  'ò': 'o',
  'ô': 'o',
  'ö': 'o',
  'õ': 'o',
  '5': 's',
  '$': 's',
  '§': 's',
  '7': 't',
  '+': 't',
  '2': 'z',
  'ú': 'u',
  'ù': 'u',
  'û': 'u',
  'ü': 'u',
  '9': 'g',
  '(': 'c',
  ')': 'd',
  '[': 'c',
  ']': 'd',
}

const SEPARATOR_RE = /[\s._\-+*\\/|'"`~^:,;!?#%&=<>()[\]{}]+/g

export function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '')
}

export function applyLeetSubstitutions(text: string): string {
  let out = ''
  for (const char of text) {
    const lower = char.toLowerCase()
    out += LEET_MAP[lower] ?? lower
  }
  return out
}

/** Réduit les répétitions excessives (puuuutain → puutain). */
export function collapseRepeatedChars(text: string): string {
  return text.replace(/(.)\1{2,}/g, '$1$1')
}

/** Normalise pour détection : leet, accents, séparateurs → espaces. */
export function normalizeForModeration(name: string): string {
  const base = foldDiacritics(applyLeetSubstitutions(name.toLowerCase()))
  return base
    .replace(SEPARATOR_RE, ' ')
    .replace(/\d/g, (digit) => LEET_MAP[digit] ?? digit)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokens séparés (espaces / ponctuation) après normalisation. */
export function tokenizeForModeration(name: string): string[] {
  const normalized = normalizeForModeration(name)
  if (!normalized) return []
  return normalized.split(' ').filter(Boolean)
}

/** Chaîne compacte sans espaces (détecte f u c k, f.u.c.k, etc.). */
export function compactForModeration(name: string): string {
  return collapseRepeatedChars(tokenizeForModeration(name).join(''))
}
