import { ALL_PROFANITY_TERMS, normalizeTermForMatching } from './terms'

export type PreparedTerm = {
  raw: string
  compact: string
}

let preparedTerms: PreparedTerm[] = buildPreparedTerms(ALL_PROFANITY_TERMS)

function buildPreparedTerms(terms: readonly string[]): PreparedTerm[] {
  const seen = new Set<string>()
  const output: PreparedTerm[] = []

  for (const raw of terms) {
    const compact = normalizeTermForMatching(raw)
    if (!compact || seen.has(compact)) continue
    seen.add(compact)
    output.push({ raw, compact })
  }

  return output
}

export function rebuildPreparedTerms(extraTerms: readonly string[] = []): void {
  preparedTerms = buildPreparedTerms([...ALL_PROFANITY_TERMS, ...extraTerms])
}

export function getPreparedTerms(): readonly PreparedTerm[] {
  return preparedTerms
}
