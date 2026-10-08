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

/** Écrase toute répétition de la même lettre à un seul caractère (puuuute → pute). */
export function squashRepeats(text: string): string {
  return text.replace(/(.)\1+/g, '$1')
}

export type ModerationWord = {
  /** Mot tel que tapé (minuscules, NFC) : les accents y sont intacts. */
  raw: string
  /** Même mot normalisé (leet, accents retirés) — identique au token de tokenizeForModeration. */
  norm: string
}

/** Un seul caractère séparateur (même classe que SEPARATOR_RE, sans le drapeau g). */
const SEPARATOR_CHAR_RE = /[\s._\-+*\\/|'"`~^:,;!?#%&=<>()[\]{}]/

/**
 * Découpe en mots en gardant, pour chacun, la forme brute ET la forme
 * normalisée. Les frontières sont exactement celles de tokenizeForModeration :
 * un caractère leet (`!`, `|`, `+`, `(`…) devient une lettre AVANT le
 * découpage, il ne sépare donc jamais deux mots (`sh!t` reste un mot).
 *
 * La forme brute sert à la liste blanche : « râpé » et « rape » ont la même
 * forme normalisée, seuls les accents les distinguent.
 */
export function splitModerationWords(text: string): ModerationWord[] {
  const words: ModerationWord[] = []
  let raw = ''

  const flush = () => {
    if (!raw) return
    const norm = normalizeForModeration(raw)
    if (norm) words.push({ raw, norm })
    raw = ''
  }

  for (const char of text.normalize('NFC').toLowerCase()) {
    if (LEET_MAP[char] === undefined && SEPARATOR_CHAR_RE.test(char)) flush()
    else raw += char
  }
  flush()

  return words
}
