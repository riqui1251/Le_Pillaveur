import { CROBARD_WORDS_FR } from './fr'
import { CROBARD_WORDS_EN } from './en'
import { CROBARD_WORDS_ES } from './es'
import { CROBARD_WORDS_IT } from './it'
import type { CrobardEntry } from './types'

export type CrobardLang = 'fr' | 'en' | 'es' | 'it'

const WORDS_BY_LANG: Record<CrobardLang, CrobardEntry[]> = {
  fr: CROBARD_WORDS_FR,
  en: CROBARD_WORDS_EN,
  es: CROBARD_WORDS_ES,
  it: CROBARD_WORDS_IT,
}

/**
 * Mots à dessiner dans la langue de la SALLE (posée à sa création).
 * ⚠️ SERVER-ONLY : le mot est secret (seul le dessinateur le voit avant le
 * bilan) — ne jamais importer côté client.
 */
export function getCrobardWords(lang: string | null | undefined): string[] {
  const entries = WORDS_BY_LANG[(lang ?? 'fr') as CrobardLang] ?? WORDS_BY_LANG.fr
  return entries.map((e) => e.word)
}
