import type { ImposteurWordPair } from '../engine'
import { IMPOSTEUR_PAIRS_FR } from './fr'
import { IMPOSTEUR_PAIRS_EN } from './en'
import { IMPOSTEUR_PAIRS_ES } from './es'
import { IMPOSTEUR_PAIRS_IT } from './it'

export type ImposteurLang = 'fr' | 'en' | 'es' | 'it'

const PAIRS_BY_LANG: Record<ImposteurLang, ImposteurWordPair[]> = {
  fr: IMPOSTEUR_PAIRS_FR,
  en: IMPOSTEUR_PAIRS_EN,
  es: IMPOSTEUR_PAIRS_ES,
  it: IMPOSTEUR_PAIRS_IT,
}

/** Paires de mots dans la langue de la SALLE (posée à sa création). */
export function getImposteurPairs(lang: string | null | undefined): ImposteurWordPair[] {
  return PAIRS_BY_LANG[(lang ?? 'fr') as ImposteurLang] ?? PAIRS_BY_LANG.fr
}
