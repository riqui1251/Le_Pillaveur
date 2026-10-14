import { IMPOSTEUR_LANGS, type ImposteurLang, type ImposteurWordPair } from '../engine'
import { IMPOSTEUR_PAIRS_FR } from './fr'
import { IMPOSTEUR_PAIRS_EN } from './en'
import { IMPOSTEUR_PAIRS_ES } from './es'
import { IMPOSTEUR_PAIRS_IT } from './it'

export type { ImposteurLang } from '../engine'

const PAIRS_BY_LANG: Record<ImposteurLang, ImposteurWordPair[]> = {
  fr: IMPOSTEUR_PAIRS_FR,
  en: IMPOSTEUR_PAIRS_EN,
  es: IMPOSTEUR_PAIRS_ES,
  it: IMPOSTEUR_PAIRS_IT,
}

/** Langue de salle → langue de paires ; inconnue ou absente → français. */
export function imposteurLangOf(lang: string | null | undefined): ImposteurLang {
  return (IMPOSTEUR_LANGS as readonly string[]).includes(lang ?? '')
    ? (lang as ImposteurLang)
    : 'fr'
}

/** Paires de mots dans la langue de la SALLE (posée à sa création). */
export function getImposteurPairs(lang: string | null | undefined): ImposteurWordPair[] {
  return PAIRS_BY_LANG[imposteurLangOf(lang)]
}
