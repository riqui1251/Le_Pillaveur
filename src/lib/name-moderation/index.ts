import {
  compactForModeration,
  normalizeForModeration,
  splitModerationWords,
  squashRepeats,
  tokenizeForModeration,
  type ModerationWord,
} from './normalize'
import { allowedSpansInWord } from './allowed-words'
import { getPreparedTerms, type PreparedTerm } from './prepared-terms'
import { getModerationErrorMessage } from './messages'

export type NameModerationReason =
  | 'empty'
  | 'too_long'
  | 'invalid_characters'
  | 'profanity'

export type NameModerationResult =
  | { ok: true; value: string }
  | { ok: false; reason: NameModerationReason }

/** Lettres Unicode (accents), chiffres et espaces uniquement — pseudos compte. */
const ACCOUNT_CHARS_RE = /^[\p{L}\p{N}\s]+$/u

/** Joueurs locaux : lettres, chiffres, espaces, tiret, apostrophe. */
const PLAYER_CHARS_RE = /^[\p{L}\p{N}\s'-]+$/u

type Span = { start: number; end: number }

/**
 * Texte prêt à l'analyse : les mots recollés en une chaîne compacte (pour
 * attraper « c o n n a r d »), sans perdre où chaque mot commence et finit —
 * c'est ce qui permet de chercher une racine courte DANS un mot sans la
 * fabriquer à cheval sur deux, et d'exiger qu'une racine ambiguë (nique,
 * esti…) ouvre un mot.
 */
type Scan = {
  compact: string
  /** Mots normalisés (écrasés en passe « martelée ») — termes « mot entier ». */
  tokens: string[]
  wordStarts: Set<number>
  words: Span[]
  /** Portions couvertes par la liste blanche (cocktail, salopette, Tamer…). */
  shields: Span[]
}

/** Vrai si `text` finit déjà par `maxRun` fois la lettre `char`. */
function endsWithRun(text: string, char: string, maxRun: number): boolean {
  if (text.length < maxRun) return false
  for (let k = 1; k <= maxRun; k += 1) {
    if (text[text.length - k] !== char) return false
  }
  return true
}

/**
 * Recolle les mots en appliquant la même réduction des répétitions que
 * compactForModeration (deux lettres au plus), ou toutes écrasées à une seule
 * pour la passe « lettres martelées ».
 */
function buildScan(words: readonly ModerationWord[], squash: boolean): Scan {
  const maxRun = squash ? 1 : 2
  let compact = ''
  const wordStarts = new Set<number>()
  const spans: Span[] = []
  const shields: Span[] = []
  const tokens: string[] = []

  for (const word of words) {
    const { norm } = word
    const start = compact.length
    // positions[i] = place, dans compact, du i-ème caractère du mot (repli
    // compris) : sert à reporter la portion protégée par la liste blanche.
    const positions: number[] = []
    for (let i = 0; i < norm.length; i += 1) {
      positions.push(compact.length)
      if (!endsWithRun(compact, norm[i], maxRun)) compact += norm[i]
    }
    positions.push(compact.length)

    wordStarts.add(start)
    spans.push({ start, end: compact.length })
    tokens.push(squash ? squashRepeats(norm) : norm)

    for (const allowed of allowedSpansInWord(word)) {
      shields.push({ start: positions[allowed.start], end: positions[allowed.end] })
    }
  }

  return { compact, tokens, wordStarts, words: spans, shields }
}

function within(spans: readonly Span[], start: number, end: number): boolean {
  return spans.some((span) => span.start <= start && end <= span.end)
}

function scanHasTerm(scan: Scan, term: PreparedTerm, squash: boolean): boolean {
  const needle = squash ? term.squashed : term.compact
  if (!needle) return false

  if (term.kind === 'whole-word') {
    return scan.compact === needle || scan.tokens.includes(needle)
  }

  for (
    let at = scan.compact.indexOf(needle);
    at !== -1;
    at = scan.compact.indexOf(needle, at + 1)
  ) {
    const end = at + needle.length
    // Entièrement dans un mot de la liste blanche : « cock » de cocktail.
    // Un terme qui DÉBORDE de la portion protégée (cocktailconnard) compte.
    if (within(scan.shields, at, end)) continue
    if (term.kind === 'anywhere') return true
    // En tête d'un mot, éventuellement éclaté sur les suivants (« p.u.t.e »,
    // « niquer ») : toujours compté.
    if (scan.wordStarts.has(at)) return true
    // Racine courte (« SaleNegre », « GrosseBite ») : comptée dans un mot,
    // jamais à cheval sur deux. Racine ambiguë (word-start) : non — « unique ».
    if (term.kind === 'inside-word' && within(scan.words, at, end)) return true
  }

  return false
}

function scanHasAnyTerm(scan: Scan, terms: readonly PreparedTerm[], squash: boolean): boolean {
  return terms.some((term) => scanHasTerm(scan, term, squash))
}

/** Salve de 3 lettres identiques ou plus : « puuuute », « c000nnard ». */
const HAMMERED_RE = /(.)\1\1/

export function containsProfanity(name: string): boolean {
  const words = splitModerationWords(name)
  if (words.length === 0) return false

  const terms = getPreparedTerms()
  if (scanHasAnyTerm(buildScan(words, false), terms, false)) return true

  // Deuxième chance pour les lettres martelées. La réduction normale garde
  // DEUX lettres (« puuuute » → « puute »), ce qui laissait passer justement
  // les insultes martelées ; on relit alors tout écrasé à une lettre, termes
  // compris (connard → conard). Réservé aux textes qui portent vraiment une
  // salve de 3 : ailleurs, écraser les doubles ne ferait que rapprocher des
  // mots innocents des termes interdits.
  if (!words.some((word) => HAMMERED_RE.test(word.norm))) return false
  return scanHasAnyTerm(buildScan(words, true), terms, true)
}

/**
 * Pour le chat : des mots ADJACENTS relus comme un seul texte (« con nard »,
 * « e n c u l e r »). Seuls les termes d'au moins `minTermLength` caractères
 * comptent — recoller des mots courts fabrique vite une racine courte par
 * hasard (« tu as pu te voir »). Les règles de position valent toujours : un
 * terme court recollé doit ouvrir l'un des mots (« ni que » oui, « uni que »
 * non).
 */
export function containsProfanityAcrossWords(
  fragments: readonly string[],
  minTermLength: number
): boolean {
  const words = fragments.flatMap((fragment) => splitModerationWords(fragment))
  if (words.length === 0) return false

  const terms = getPreparedTerms().filter((term) => term.compact.length >= minTermLength)
  return scanHasAnyTerm(buildScan(words, false), terms, false)
}

export function validateAccountDisplayName(
  name: string,
  maxLength = 30
): NameModerationResult {
  const trimmed = name.trim()

  if (!trimmed) return { ok: false, reason: 'empty' }
  if (trimmed.length > maxLength) return { ok: false, reason: 'too_long' }
  if (!ACCOUNT_CHARS_RE.test(trimmed)) return { ok: false, reason: 'invalid_characters' }
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' }

  return { ok: true, value: trimmed }
}

export function validateLocalPlayerName(
  name: string,
  maxLength = 40
): NameModerationResult {
  const trimmed = name.trim()

  if (!trimmed) return { ok: false, reason: 'empty' }
  if (trimmed.length > maxLength) return { ok: false, reason: 'too_long' }
  if (!PLAYER_CHARS_RE.test(trimmed)) return { ok: false, reason: 'invalid_characters' }
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' }

  return { ok: true, value: trimmed }
}

export const NAME_MODERATION_ERROR_CODES = {
  empty: 'NAME_EMPTY',
  too_long: 'NAME_TOO_LONG',
  invalid_characters: 'NAME_INVALID_CHARACTERS',
  profanity: 'NAME_PROFANITY',
} as const

export type NameModerationErrorCode =
  (typeof NAME_MODERATION_ERROR_CODES)[NameModerationReason]

export function moderationErrorCode(
  reason: NameModerationReason
): NameModerationErrorCode {
  return NAME_MODERATION_ERROR_CODES[reason]
}

/** Fallback FR — préférer getModerationErrorMessage avec locale explicite. */
export function moderationErrorMessage(reason: NameModerationReason): string {
  return getModerationErrorMessage(reason, 'fr', 'account')
}

export function nameValidationI18nKey(
  reason: NameModerationReason
): 'empty' | 'tooLong' | 'invalidCharacters' | 'profanity' {
  switch (reason) {
    case 'empty':
      return 'empty'
    case 'too_long':
      return 'tooLong'
    case 'invalid_characters':
      return 'invalidCharacters'
    case 'profanity':
      return 'profanity'
  }
}

export { getModerationErrorMessage } from './messages'
export { normalizeForModeration, compactForModeration, tokenizeForModeration }
