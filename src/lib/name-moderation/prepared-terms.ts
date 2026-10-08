import { squashRepeats } from './normalize'
import {
  ALL_PROFANITY_TERMS,
  EXACT_TERM_MAX_LENGTH,
  SHORT_ROOT_MAX_LENGTH,
  TERMS_AT_WORD_START,
  normalizeTermForMatching,
} from './terms'

/**
 * Où un terme peut être trouvé (voir l'en-tête de terms.ts) :
 * - whole-word  : mot entier (≤ 3 caractères : fdp, ntm) ;
 * - word-start  : début d'un mot, éventuellement éclaté (« p.u.t.e ») — les
 *   seules racines ambiguës de TERMS_AT_WORD_START (nique, esti, cono…) ;
 * - inside-word : début d'un mot OU à l'intérieur d'un seul mot (4-5
 *   caractères : SaleNegre, GrosseBite, clusterfuck) ;
 * - anywhere    : n'importe où, mots recollés compris (≥ 6 caractères).
 */
export type TermKind = 'whole-word' | 'word-start' | 'inside-word' | 'anywhere'

export type PreparedTerm = {
  raw: string
  /** Forme compacte : sans espaces ni accents. */
  compact: string
  /** Forme compacte écrasée, pour la passe « lettres martelées ». */
  squashed: string
  kind: TermKind
}

/**
 * Classe un terme d'après sa SEULE forme compacte : les termes ajoutés par la
 * supervision (fichier ou base) suivent donc exactement la même règle de
 * longueur que la liste de base.
 */
export function termKind(compact: string): TermKind {
  if (compact.length <= EXACT_TERM_MAX_LENGTH) return 'whole-word'
  if (TERMS_AT_WORD_START.has(compact)) return 'word-start'
  if (compact.length <= SHORT_ROOT_MAX_LENGTH) return 'inside-word'
  return 'anywhere'
}

let preparedTerms: PreparedTerm[] = buildPreparedTerms(ALL_PROFANITY_TERMS)

function buildPreparedTerms(terms: readonly string[]): PreparedTerm[] {
  const seen = new Set<string>()
  const output: PreparedTerm[] = []

  for (const raw of terms) {
    const compact = normalizeTermForMatching(raw)
    if (!compact || seen.has(compact)) continue
    seen.add(compact)
    output.push({ raw, compact, squashed: squashRepeats(compact), kind: termKind(compact) })
  }

  return output
}

export function rebuildPreparedTerms(extraTerms: readonly string[] = []): void {
  preparedTerms = buildPreparedTerms([...ALL_PROFANITY_TERMS, ...extraTerms])
}

export function getPreparedTerms(): readonly PreparedTerm[] {
  return preparedTerms
}
