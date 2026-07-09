import type { TabouEntry } from '../engine'
import { TABOU_WORDS_FR } from './fr'
import { TABOU_WORDS_EN } from './en'
import { TABOU_WORDS_ES } from './es'
import { TABOU_WORDS_IT } from './it'

export type TabouLang = 'fr' | 'en' | 'es' | 'it'

const WORDS_BY_LANG: Record<TabouLang, TabouEntry[]> = {
  fr: TABOU_WORDS_FR,
  en: TABOU_WORDS_EN,
  es: TABOU_WORDS_ES,
  it: TABOU_WORDS_IT,
}

/**
 * Mots + tabous dans la langue de la SALLE (posée à sa création).
 * ⚠️ SERVER-ONLY : le mot et les 4 tabous sont secrets (seul le décrivant
 * les voit) — ne jamais importer côté client.
 */
export function getTabouWords(lang: string | null | undefined): TabouEntry[] {
  return WORDS_BY_LANG[(lang ?? 'fr') as TabouLang] ?? WORDS_BY_LANG.fr
}
